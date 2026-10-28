import type { Preset } from "@dashboard-ia/shared";
import { createPresetSchema, optionPatchSchema, updatePresetSchema } from "@dashboard-ia/shared";
import type { z } from "zod";
import type { Prisma } from "@/prisma/generated/client.ts";
import { prisma } from "../db.ts";
import { errors } from "../errors.ts";

export { createPresetSchema, updatePresetSchema };

export type CreatePresetInput = z.infer<typeof createPresetSchema>;
export type UpdatePresetInput = z.infer<typeof updatePresetSchema>;

type PresetRow = {
	id: string;
	name: string;
	description: string | null;
	chartType: string | null;
	optionPatch: Prisma.JsonValue;
	isGlobalDefault: boolean;
};

/** `optionPatch` é Json livre no banco — o zod garante que não voltou dado embutido. */
function toDto(preset: PresetRow): Preset {
	return {
		id: preset.id,
		name: preset.name,
		description: preset.description,
		chartType: preset.chartType as Preset["chartType"],
		optionPatch: optionPatchSchema.parse(preset.optionPatch),
		isGlobalDefault: preset.isGlobalDefault,
	};
}

/**
 * Presets sem `chartType` valem para qualquer gráfico, então entram na lista de todos.
 */
export async function listPresets(chartType?: string): Promise<Preset[]> {
	const presets = await prisma.chartPreset.findMany({
		where: chartType ? { OR: [{ chartType }, { chartType: null }] } : undefined,
		orderBy: [{ isGlobalDefault: "desc" }, { name: "asc" }],
	});

	return presets.map(toDto);
}

export async function getPreset(id: string): Promise<Preset> {
	const preset = await prisma.chartPreset.findUnique({ where: { id } });

	if (!preset) throw errors.notFound("Preset");

	return toDto(preset);
}

/** Só um padrão por escopo: marcar um novo desmarca o anterior do mesmo `chartType`. */
async function clearDefault(chartType: string | null, exceptId?: string): Promise<void> {
	await prisma.chartPreset.updateMany({
		where: { chartType, isGlobalDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
		data: { isGlobalDefault: false },
	});
}

export async function createPreset(input: CreatePresetInput): Promise<Preset> {
	if (input.isGlobalDefault) await clearDefault(input.chartType);

	const preset = await prisma.chartPreset.create({
		data: {
			name: input.name,
			description: input.description ?? null,
			chartType: input.chartType,
			optionPatch: input.optionPatch as Prisma.InputJsonValue,
			isGlobalDefault: input.isGlobalDefault,
		},
	});

	return toDto(preset);
}

export async function updatePreset(id: string, input: UpdatePresetInput): Promise<Preset> {
	const current = await getPreset(id);
	const chartType = input.chartType === undefined ? current.chartType : input.chartType;

	if (input.isGlobalDefault) await clearDefault(chartType, id);

	const preset = await prisma.chartPreset.update({
		where: { id },
		data: {
			name: input.name ?? current.name,
			description: input.description === undefined ? current.description : input.description,
			chartType,
			optionPatch: (input.optionPatch ?? current.optionPatch) as Prisma.InputJsonValue,
			isGlobalDefault: input.isGlobalDefault ?? current.isGlobalDefault,
		},
	});

	return toDto(preset);
}

export async function deletePreset(id: string): Promise<void> {
	await getPreset(id);
	// Gráficos que usavam o preset voltam ao estilo base em vez de sumirem.
	await prisma.chart.updateMany({ where: { presetId: id }, data: { presetId: null } });
	await prisma.chartPreset.delete({ where: { id } });
}
