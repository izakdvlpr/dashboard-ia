import { querySpecSchema } from "@dashboard-ia/shared";
import { Router } from "express";
import { z } from "zod";
import { validateBody } from "../middleware/validate.ts";
import { runQuerySpec } from "../services/semantic-query.service.ts";

const runSchema = z.object({ spec: querySpecSchema });

export const queryRouter = Router();

/**
 * Mesma trilha usada pelo chatbot — o builder manual também só envia QuerySpec.
 */
queryRouter.post("/run", validateBody(runSchema), async (request, response) => {
	const { spec } = request.body as z.infer<typeof runSchema>;
	const { result } = await runQuerySpec(spec);

	response.json(result);
});
