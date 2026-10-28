import type { ChartColumn, ChartSpec, QueryRow } from "@dashboard-ia/shared";
import { chartColumnSchema, chartSpecSchema } from "@dashboard-ia/shared";
import { z } from "zod";
import { generate } from "../ai/gateway.ts";
import { answerSystemPrompt, answerUserPrompt } from "../ai/prompts.ts";
import { answerOutputSchema } from "../ai/schemas.ts";
import { prisma } from "../db.ts";
import { env } from "../env.ts";
import type { QueryResult } from "../sql-guardrails/executor.ts";
import { buildChartSpec } from "./chart-spec.service.ts";
import { textToSql } from "./text-to-sql.service.ts";

export type ChatStep = "sql_generated" | "sql_validated" | "query_executed" | "chart_generated";

export type ChatAnswer = {
	conversationId: string;
	messageId: string;
	question: string;
	sql: string;
	rawSql: string;
	explanation: string;
	answer: string;
	columns: QueryResult["columns"];
	rows: QueryResult["rows"];
	rowCount: number;
	durationMs: number;
	attempts: number;
	chartSpec: ChartSpec;
	chartFallback: boolean;
	steps: ChatStep[];
};

export async function ask(question: string, conversationId?: string): Promise<ChatAnswer> {
	const conversation = await resolveConversation(question, conversationId);

	await prisma.chatMessage.create({
		data: { conversationId: conversation.id, role: "USER", content: question },
	});

	const { result, rawSql, explanation, chartHint, attempts } = await textToSql(question);

	const [{ spec, fallback }, answer] = await Promise.all([
		buildChartSpec(question, result.columns, result.rows, chartHint),
		summarize(question, result),
	]);

	const message = await prisma.chatMessage.create({
		data: {
			conversationId: conversation.id,
			role: "ASSISTANT",
			content: answer,
			sql: result.sql,
			resultJson: { columns: result.columns, rows: result.rows, chartSpec: spec },
		},
	});

	// `@updatedAt` só dispara em update da própria linha — sem isso a lista de
	// conversas ficaria ordenada pela criação, não pela última pergunta.
	await prisma.conversation.update({
		where: { id: conversation.id },
		data: { updatedAt: new Date() },
	});

	return {
		conversationId: conversation.id,
		messageId: message.id,
		question,
		sql: result.sql,
		rawSql,
		explanation,
		answer,
		columns: result.columns,
		rows: result.rows,
		rowCount: result.rowCount,
		durationMs: result.durationMs,
		attempts,
		chartSpec: spec,
		chartFallback: fallback,
		steps: ["sql_generated", "sql_validated", "query_executed", "chart_generated"],
	};
}

/** Resposta em linguagem natural. Se o modelo falhar, devolve o resumo trivial. */
async function summarize(question: string, result: QueryResult): Promise<string> {
	const fallback = `Consulta executada: ${result.rowCount} ${
		result.rowCount === 1 ? "linha" : "linhas"
	} em ${result.durationMs} ms.`;

	if (result.rows.length === 0) return "A consulta não retornou nenhuma linha.";

	try {
		const output = await generate({
			model: env.AI_CHART_MODEL,
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
	chartSpec: chartSpecSchema,
});

export type ChatMessageView = {
	id: string;
	role: string;
	content: string;
	sql: string | null;
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

			return {
				id: message.id,
				role: message.role,
				content: message.content,
				sql: message.sql,
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
