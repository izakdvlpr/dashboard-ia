import type { QuerySpec } from "@dashboard-ia/shared";
import { MAX_ROWS, querySpecSchema } from "@dashboard-ia/shared";
import { z } from "zod";
import type { Prisma } from "@/prisma/generated/client.ts";
import { type ChatMessage, generate } from "../ai/gateway.ts";
import { querySpecSystemPrompt, retryPrompt } from "../ai/prompts.ts";
import { type QuerySpecOutput, querySpecOutputSchema } from "../ai/schemas.ts";
import { prisma } from "../db.ts";
import { env } from "../env.ts";
import { errors } from "../errors.ts";
import { compileQuery } from "../semantic/compiler.ts";
import { type QueryResult, runQuery } from "../semantic/executor.ts";
import { getSemanticCatalog } from "./schema-catalog.service.ts";

/** Escolher de enum erra pouco; uma correção basta. */
const MAX_ATTEMPTS = 2;

const EXECUTION_FAILED = "Falha ao executar a consulta. Tente um período menor ou menos agrupamentos.";

export type SemanticQueryResult = {
	result: QueryResult;
	spec: QuerySpec;
	explanation: string;
	chartHint: string;
	attempts: number;
};

/** Mesmo caminho para IA, builder e MCP: spec validado -> SQL do registry -> role read-only. */
export async function runQuerySpec(spec: QuerySpec): Promise<{ result: QueryResult; compiled: Prisma.Sql }> {
	const compiled = compileQuery(spec);

	try {
		return { result: await runQuery(compiled), compiled };
	} catch (error) {
		console.error("[runQuerySpec]", error, compiled.text);
		throw errors.queryExecution(EXECUTION_FAILED);
	}
}

/** O structured output usa `null` para campo ausente; o schema do shared quer `undefined`. */
function toSpecInput(output: QuerySpecOutput): unknown {
	const filters = Object.fromEntries(
		Object.entries(output.filters).filter(([, values]) => values !== null && values.length > 0),
	);

	return {
		metrics: output.metrics,
		groupBy: output.groupBy,
		filters,
		period: output.period,
		dateFrom: output.dateFrom ?? undefined,
		dateTo: output.dateTo ?? undefined,
		includeCanceled: output.includeCanceled,
		orderBy: output.orderBy ?? undefined,
		limit: Math.min(Math.max(output.limit, 1), MAX_ROWS),
	};
}

/**
 * NL -> QuerySpec. O modelo nunca escreve SQL: se o spec não passa no zod,
 * a mensagem do zod volta para ele uma vez. Toda tentativa vira linha em QueryLog.
 */
export async function questionToQuery(question: string): Promise<SemanticQueryResult> {
	const instructions = querySpecSystemPrompt(await getSemanticCatalog());
	const messages: ChatMessage[] = [{ role: "user", content: question }];

	let lastReason = "desconhecido";

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
		const output = await generate({
			model: env.AI_QUERY_MODEL,
			instructions,
			messages,
			schema: querySpecOutputSchema,
		});

		if (output.metrics.length === 0) {
			await logQuery({
				question,
				attempt,
				rawOutput: output,
				status: "REJECTED",
				rejectionReason: "fora do catálogo",
			});

			throw errors.queryRejected(
				output.explanation.trim() ||
					"Não consigo responder essa pergunta com os dados disponíveis. Pergunte sobre receita, pedidos, clientes, produtos ou regiões.",
			);
		}

		const parsed = querySpecSchema.safeParse(toSpecInput(output));

		if (!parsed.success) {
			lastReason = z.prettifyError(parsed.error);

			await logQuery({
				question,
				attempt,
				rawOutput: output,
				status: "REJECTED",
				rejectionReason: lastReason,
			});

			messages.push({ role: "assistant", content: JSON.stringify(output) });
			messages.push({ role: "user", content: retryPrompt(question, lastReason) });
			continue;
		}

		const spec = parsed.data;
		const compiled = compileQuery(spec);

		try {
			const result = await runQuery(compiled);

			await logQuery({
				question,
				attempt,
				rawOutput: output,
				compiledSql: compiled.text,
				status: "EXECUTED",
				rowCount: result.rowCount,
				durationMs: result.durationMs,
			});

			return {
				result,
				spec,
				explanation: output.explanation,
				chartHint: output.chartHint,
				attempts: attempt,
			};
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);

			await logQuery({
				question,
				attempt,
				rawOutput: output,
				compiledSql: compiled.text,
				status: "EXECUTION_ERROR",
				rejectionReason: reason,
			});

			// erro aqui é do registry ou timeout, não do modelo — repetir não ajuda
			throw errors.queryExecution(EXECUTION_FAILED);
		}
	}

	throw errors.queryRejected(
		`Não consegui montar uma consulta válida em ${MAX_ATTEMPTS} tentativas. Último motivo: ${lastReason}`,
	);
}

type LogInput = {
	question: string;
	attempt: number;
	rawOutput: QuerySpecOutput;
	compiledSql?: string;
	status: "EXECUTED" | "REJECTED" | "EXECUTION_ERROR";
	rejectionReason?: string;
	rowCount?: number;
	durationMs?: number;
};

/** Log é observabilidade — nunca deve derrubar a requisição. */
async function logQuery(input: LogInput): Promise<void> {
	try {
		await prisma.queryLog.create({
			data: { ...input, model: env.AI_QUERY_MODEL },
		});
	} catch (error) {
		console.error("[query-log]", error);
	}
}
