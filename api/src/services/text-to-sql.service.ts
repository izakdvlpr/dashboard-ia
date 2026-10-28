import { type ChatMessage, generate } from "../ai/gateway.ts";
import { retryPrompt, sqlSystemPrompt } from "../ai/prompts.ts";
import { sqlOutputSchema } from "../ai/schemas.ts";
import { prisma } from "../db.ts";
import { env } from "../env.ts";
import { errors } from "../errors.ts";
import { type QueryResult, runGuardedQuery } from "../sql-guardrails/executor.ts";
import { SqlRejectedError } from "../sql-guardrails/validator.ts";
import { buildSchemaBlock } from "./schema-catalog.service.ts";

/** 1 tentativa + 2 correções. Além disso o modelo costuma repetir o mesmo erro. */
const MAX_ATTEMPTS = 3;

export type TextToSqlResult = {
	result: QueryResult;
	rawSql: string;
	explanation: string;
	chartHint: string;
	attempts: number;
};

type Attempt = { rawSql: string; reason: string };

/**
 * NL -> SQL com retry alimentado pela mensagem exata da rejeição.
 * Toda tentativa vira linha em QueryLog, inclusive as recusadas.
 */
export async function textToSql(question: string): Promise<TextToSqlResult> {
	const schemaBlock = await buildSchemaBlock();
	const instructions = sqlSystemPrompt(schemaBlock);
	const messages: ChatMessage[] = [{ role: "user", content: question }];

	const failures: Attempt[] = [];

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
		const output = await generate({
			model: env.AI_SQL_MODEL,
			instructions,
			messages,
			schema: sqlOutputSchema,
		});

		const rawSql = output.sql.trim();

		try {
			const result = await runGuardedQuery(rawSql);

			await logQuery({
				question,
				attempt,
				rawSql,
				sanitizedSql: result.sql,
				status: "EXECUTED",
				rowCount: result.rowCount,
				durationMs: result.durationMs,
			});

			return {
				result,
				rawSql,
				explanation: output.explanation,
				chartHint: output.chartHint,
				attempts: attempt,
			};
		} catch (error) {
			const rejected = error instanceof SqlRejectedError;
			const reason = error instanceof Error ? error.message : String(error);

			await logQuery({
				question,
				attempt,
				rawSql,
				status: rejected ? "REJECTED" : "EXECUTION_ERROR",
				rejectionReason: reason,
			});

			failures.push({ rawSql, reason });

			if (attempt === MAX_ATTEMPTS) break;

			messages.push({ role: "assistant", content: JSON.stringify(output) });
			messages.push({ role: "user", content: retryPrompt(question, rawSql, reason) });
		}
	}

	throw errors.sqlRejected(
		`Não consegui gerar uma consulta válida em ${MAX_ATTEMPTS} tentativas. Último motivo: ${
			failures.at(-1)?.reason ?? "desconhecido"
		}`,
		{ attempts: failures },
	);
}

type LogInput = {
	question: string;
	attempt: number;
	rawSql: string;
	sanitizedSql?: string;
	status: "EXECUTED" | "REJECTED" | "EXECUTION_ERROR";
	rejectionReason?: string;
	rowCount?: number;
	durationMs?: number;
	chatMessageId?: string;
};

/** Log é observabilidade — nunca deve derrubar a requisição. */
async function logQuery(input: LogInput): Promise<void> {
	try {
		await prisma.queryLog.create({
			data: { ...input, model: env.AI_SQL_MODEL },
		});
	} catch (error) {
		console.error("[query-log]", error);
	}
}
