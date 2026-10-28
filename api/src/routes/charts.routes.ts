import { Router } from "express";
import { z } from "zod";
import { validateBody } from "../middleware/validate.ts";
import {
	createChart,
	createChartSchema,
	deleteChart,
	getChart,
	listCharts,
	reorderPinned,
	runChart,
	updateChart,
	updateChartSchema,
} from "../services/charts.service.ts";

const reorderSchema = z.object({ ids: z.array(z.string()).min(1) });

export const chartsRouter = Router();

chartsRouter.get("/", async (request, response) => {
	const pinned = request.query.pinned === "true";

	response.json({ charts: await listCharts({ pinned }) });
});

/** Antes das rotas com `:id` para não ser capturada por elas. */
chartsRouter.post("/reorder", validateBody(reorderSchema), async (request, response) => {
	const { ids } = request.body as z.infer<typeof reorderSchema>;

	response.json({ charts: await reorderPinned(ids) });
});

chartsRouter.get("/:id", async (request, response) => {
	response.json(await getChart(request.params.id));
});

chartsRouter.post("/", validateBody(createChartSchema), async (request, response) => {
	response.status(201).json(await createChart(request.body));
});

chartsRouter.patch("/:id", validateBody(updateChartSchema), async (request, response) => {
	response.json(await updateChart(String(request.params.id), request.body));
});

chartsRouter.delete("/:id", async (request, response) => {
	await deleteChart(request.params.id);
	response.status(204).end();
});

/** Dados sempre frescos: reexecuta o SELECT salvo pelos guardrails. */
chartsRouter.post("/:id/run", async (request, response) => {
	response.json(await runChart(request.params.id));
});
