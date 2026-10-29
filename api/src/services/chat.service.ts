import type { ChartColumn, ChartSpec, QueryRow, QuerySpec } from "@dashboard-ia/shared";
import { chartColumnSchema, chartSpecSchema, querySpecSchema } from "@dashboard-ia/shared";
import { z } from "zod";
import { generate } from "../ai/gateway.ts";
import { answerSystemPrompt, answerUserPrompt } from "../ai/prompts.ts";
import { answerOutputSchema, type QuestionRoute } from "../ai/schemas.ts";
import { prisma } from "../db.ts";
import { env } from "../env.ts";
import { errors } from "../errors.ts";
import type { QueryResult } from "../semantic/executor.ts";
import { buildChartSpec } from "./chart-spec.service.ts";
import { assertSafePrompt } from "./guardrail.service.ts";
import { answerChitchat, classifyQuestion } from "./question-router.service.ts";
import { questionToQuery } from "./semantic-query.service.ts";

export type ChatStep =
	| "guardrail_checked"
	| "classified"
	| "answered"
	| "spec_generated"
	| "query_executed"
	| "chart_generated";

export type ChatAnswer = {
	conversationId: string;
	messageId: string;
	question: string;
	route: QuestionRoute;
	querySpec: QuerySpec | null;
	explanation: string;
	answer: string;
	columns: QueryResult["columns"];
	rows: QueryResult["rows"];
	rowCount: number;
	durationMs: number;
	attempts: number;
	chartSpec: ChartSpec | null;
	chartFallback: boolean;
	steps: ChatStep[];
};

export async function ask(question: string, conversationId?: string): Promise<ChatAnswer> {
	// Antes de criar qualquer registro: pergunta bloqueada não deixa rastro no histórico.
	await assertSafePrompt(question);

	const route = await classifyQuestion(question);
	const conversation = await resolveConversation(question, conversationId);

	await prisma.chatMessage.create({
		data: { conversationId: conversation.id, role: "USER", content: question },
	});

	if (route === "chitchat") {
		const answer = await answerChitchat(question);

		const message = await prisma.chatMessage.create({
			data: { conversationId: conversation.id, role: "ASSISTANT", content: answer },
		});

		await touchConversation(conversation.id);

		return {
			conversationId: conversation.id,
			messageId: message.id,
			question,
			route,
			querySpec: null,
			explanation: "",
			answer,
			columns: [],
			rows: [],
			rowCount: 0,
			durationMs: 0,
			attempts: 0,
			chartSpec: null,
			chartFallback: false,
			steps: ["guardrail_checked", "classified", "answered"],
		};
	}

	const { result, spec, explanation, chartHint, attempts } = await questionToQuery(question);

	// Rota `table` não chama o modelo de gráfico; o usuário pede depois via `generateChartForMessage`.
	const [chart, answer] = await Promise.all([
		route === "chart" ? buildChartSpec(question, result.columns, result.rows, chartHint) : null,
		summarize(question, result),
	]);

	const message = await prisma.chatMessage.create({
		data: {
			conversationId: conversation.id,
			role: "ASSISTANT",
			content: answer,
			querySpec: spec,
			resultJson: {
				columns: result.columns,
				rows: result.rows,
				chartSpec: chart?.spec ?? null,
				chartFallback: chart?.fallback ?? false,
				chartHint,
			},
		},
	});

	await touchConversation(conversation.id);

	const steps: ChatStep[] = ["guardrail_checked", "classified", "spec_generated", "query_executed"];

	if (chart) steps.push("chart_generated");

	return {
		conversationId: conversation.id,
		messageId: message.id,
		question,
		route,
		querySpec: spec,
		explanation,
		answer,
		columns: result.columns,
		rows: result.rows,
		rowCount: result.rowCount,
		durationMs: result.durationMs,
		attempts,
		chartSpec: chart?.spec ?? null,
		chartFallback: chart?.fallback ?? false,
		steps,
	};
}

export type GeneratedChart = { chartSpec: ChartSpec; chartFallback: boolean };

/**
 * Gráfico sob demanda para uma resposta da rota `table`. Reusa as linhas salvas
 * — não consulta o banco de novo — e é idempotente: clique duplo não gasta modelo.
 */
export async function generateChartForMessage(messageId: string): Promise<GeneratedChart> {
	const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });

	if (message?.role !== "ASSISTANT") throw errors.notFound("Mensagem");

	const parsed = messageResultSchema.safeParse(message.resultJson);

	if (!parsed.success || parsed.data.rows.length === 0) {
		throw errors.validation("Esta resposta não tem dados para gerar gráfico.");
	}

	const { columns, rows, chartSpec, chartFallback, chartHint } = parsed.data;

	if (chartSpec) return { chartSpec, chartFallback: chartFallback ?? false };

	const question = await prisma.chatMessage.findFirst({
		where: { conversationId: message.conversationId, role: "USER", createdAt: { lt: message.createdAt } },
		orderBy: { createdAt: "desc" },
		select: { content: true },
	});

	const { spec, fallback } = await buildChartSpec(question?.content ?? "", columns, rows, chartHint ?? "bar");

	await prisma.chatMessage.update({
		where: { id: message.id },
		data: { resultJson: { columns, rows, chartSpec: spec, chartFallback: fallback, chartHint } },
	});

	return { chartSpec: spec, chartFallback: fallback };
}

// `@updatedAt` só dispara em update da própria linha — sem isso a lista de
// conversas ficaria ordenada pela criação, não pela última pergunta.
async function touchConversation(id: string): Promise<void> {
	await prisma.conversation.update({
		where: { id },
		data: { updatedAt: new Date() },
	});
}

/** Resposta em linguagem natural. Se o modelo falhar, devolve o resumo trivial. */
async function summarize(question: string, result: QueryResult): Promise<string> {
	const fallback = `Consulta executada: ${result.rowCount} ${
		result.rowCount === 1 ? "linha" : "linhas"
	} em ${result.durationMs} ms.`;

	if (result.rows.length === 0) return "A consulta não retornou nenhuma linha.";

	try {
		const output = await generate({
			model: env.AI_SIMPLE_MODEL,
			instructions: answerSystemPrompt(),
			messages: [{ role: "user", content: answerUserPrompt(question, result.columns, result.rows) }],
			schema: answerOutputSchema,
			temperature: 0.2,
		});

		return output.answer.trim() || fallback;
	} catch (error) {
		console.error("[summarize]", error);
		return fallback;
	}
}

async function resolveConversation(question: string, conversationId?: string) {
	if (conversationId) {
		const existing = await prisma.conversation.findUnique({ where: { id: conversationId } });

		if (existing) return existing;
	}

	return prisma.conversation.create({
		data: { title: question.slice(0, 80) },
	});
}

const UNTITLED = "Conversa sem título";

export async function listConversations() {
	const conversations = await prisma.conversation.findMany({
		orderBy: { updatedAt: "desc" },
		take: 50,
		select: { id: true, title: true, createdAt: true, updatedAt: true },
	});

	return conversations.map((conversation) => ({
		id: conversation.id,
		title: conversation.title ?? UNTITLED,
		createdAt: conversation.createdAt.toISOString(),
		updatedAt: conversation.updatedAt.toISOString(),
	}));
}

/** Payload que a mensagem do assistente guardou em `resultJson`. */
const messageResultSchema = z.object({
	columns: z.array(chartColumnSchema),
	rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
	chartSpec: chartSpecSchema.nullable(),
	chartFallback: z.boolean().optional(),
	chartHint: z.string().optional(),
});

export type ChatMessageView = {
	id: string;
	role: string;
	content: string;
	querySpec: QuerySpec | null;
	columns: ChartColumn[];
	rows: QueryRow[];
	chartSpec: ChartSpec | null;
	createdAt: string;
};

export type ConversationView = {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	messages: ChatMessageView[];
};

/**
 * Histórico já vem pronto para renderizar: o `resultJson` salvo é revalidado
 * aqui, então uma mensagem antiga com formato incompatível vira só texto.
 */
export async function getConversation(id: string): Promise<ConversationView | null> {
	const conversation = await prisma.conversation.findUnique({
		where: { id },
		include: { messages: { orderBy: { createdAt: "asc" } } },
	});

	if (!conversation) return null;

	return {
		id: conversation.id,
		title: conversation.title ?? UNTITLED,
		createdAt: conversation.createdAt.toISOString(),
		updatedAt: conversation.updatedAt.toISOString(),
		messages: conversation.messages.map((message) => {
			const parsed = messageResultSchema.safeParse(message.resultJson);
			const spec = querySpecSchema.safeParse(message.querySpec);

			return {
				id: message.id,
				role: message.role,
				content: message.content,
				querySpec: spec.success ? spec.data : null,
				columns: parsed.success ? parsed.data.columns : [],
				rows: parsed.success ? parsed.data.rows : [],
				chartSpec: parsed.success ? parsed.data.chartSpec : null,
				createdAt: message.createdAt.toISOString(),
			};
		}),
	};
}

export async function deleteConversation(id: string): Promise<void> {
	await prisma.conversation.delete({ where: { id } });
}
