import { Router } from "express";
import { z } from "zod";
import { errors } from "../errors.ts";
import { validateBody } from "../middleware/validate.ts";
import { runGuardedQuery } from "../sql-guardrails/executor.ts";
import { SqlRejectedError } from "../sql-guardrails/validator.ts";

const runSchema = z.object({ sql: z.string().min(1).max(10_000) });

export const queryRouter = Router();

/**
 * Mesma trilha usada pelo chatbot — o builder manual não tem atalho para o banco.
 */
queryRouter.post("/run", validateBody(runSchema), async (request, response) => {
	const { sql } = request.body as z.infer<typeof runSchema>;

	try {
		const result = await runGuardedQuery(sql);

		response.json(result);
	} catch (error) {
		if (error instanceof SqlRejectedError) {
			throw errors.sqlRejected(error.message, { step: error.step });
		}

		throw errors.sqlExecution(error instanceof Error ? error.message : String(error));
	}
});
