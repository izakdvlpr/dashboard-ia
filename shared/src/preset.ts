import { z } from "zod";
import { CHART_TYPES } from "./chart-spec.ts";

/**
 * Preset = patch parcial de EChartsOption aplicado por cima da option base.
 * Só estiliza: nunca pode reinjetar dados (`series[].data`, `dataset`).
 */

const FORBIDDEN_PATCH_KEYS = new Set(["dataset", "data"]);

function assertNoData(value: unknown, path: string[] = []): string | null {
	if (Array.isArray(value)) {
		for (const [index, item] of value.entries()) {
			const found = assertNoData(item, [...path, String(index)]);
			if (found) return found;
		}
		return null;
	}

	if (value && typeof value === "object") {
		for (const [key, item] of Object.entries(value)) {
			if (FORBIDDEN_PATCH_KEYS.has(key)) return [...path, key].join(".");
			const found = assertNoData(item, [...path, key]);
			if (found) return found;
		}
	}

	return null;
}

export const optionPatchSchema = z.record(z.string(), z.unknown()).superRefine((patch, ctx) => {
	const found = assertNoData(patch);

	if (found) {
		ctx.addIssue({ code: "custom", message: `Preset não pode conter dados: "${found}"` });
	}
});

export const presetSchema = z.object({
	id: z.string(),
	name: z.string().min(1),
	description: z.string().nullable().optional(),
	/** null = vale para qualquer tipo de gráfico */
	chartType: z.enum(CHART_TYPES).nullable(),
	optionPatch: optionPatchSchema,
	isGlobalDefault: z.boolean(),
});

export const createPresetSchema = presetSchema.omit({ id: true, isGlobalDefault: true }).extend({
	isGlobalDefault: z.boolean().default(false),
});

export const updatePresetSchema = createPresetSchema.partial();

export type Preset = z.infer<typeof presetSchema>;
export type CreatePresetInput = z.infer<typeof createPresetSchema>;
export type UpdatePresetInput = z.infer<typeof updatePresetSchema>;

/**
 * Deep-merge do patch sobre a option base.
 * Objetos simples mesclam recursivamente; arrays são substituídos por inteiro
 * (mesma semântica recomendada pelo ECharts — evita sobrescrita parcial de `series`).
 */
export function mergeOption<T extends Record<string, unknown>>(
	base: T,
	patch: Record<string, unknown> | null | undefined,
): T {
	if (!patch) return base;

	const output: Record<string, unknown> = { ...base };

	for (const [key, patchValue] of Object.entries(patch)) {
		const baseValue = output[key];

		if (
			baseValue &&
			patchValue &&
			typeof baseValue === "object" &&
			typeof patchValue === "object" &&
			!Array.isArray(baseValue) &&
			!Array.isArray(patchValue)
		) {
			output[key] = mergeOption(baseValue as Record<string, unknown>, patchValue as Record<string, unknown>);
			continue;
		}

		output[key] = patchValue;
	}

	return output as T;
}
