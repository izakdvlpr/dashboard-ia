import { Router } from "express";
import { validateBody } from "../middleware/validate.ts";
import {
	createPreset,
	createPresetSchema,
	deletePreset,
	getPreset,
	listPresets,
	updatePreset,
	updatePresetSchema,
} from "../services/presets.service.ts";

export const presetsRouter = Router();

presetsRouter.get("/", async (request, response) => {
	const chartType = typeof request.query.chartType === "string" ? request.query.chartType : undefined;

	response.json({ presets: await listPresets(chartType) });
});

presetsRouter.get("/:id", async (request, response) => {
	response.json(await getPreset(request.params.id));
});

presetsRouter.post("/", validateBody(createPresetSchema), async (request, response) => {
	response.status(201).json(await createPreset(request.body));
});

presetsRouter.patch("/:id", validateBody(updatePresetSchema), async (request, response) => {
	response.json(await updatePreset(String(request.params.id), request.body));
});

presetsRouter.delete("/:id", async (request, response) => {
	await deletePreset(request.params.id);
	response.status(204).end();
});
