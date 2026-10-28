import { CHART_TYPES, COLOR_TOKENS, VALUE_FORMATS } from "@dashboard-ia/shared";
import { z } from "zod";

/**
 * Schemas de saída estruturada enviados ao AI Gateway.
 *
 * Flat e sem `.default`/`.prefault`: viram JSON Schema para o provider, e nem
 * todo provider aceita defaults ou composição. Precisam ser mantidos em
 * sincronia com os zod de `@dashboard-ia/shared` — a validação real acontece lá.
 */

export const sqlOutputSchema = z.object({
	sql: z.string(),
	explanation: z.string(),
	chartHint: z.enum([...CHART_TYPES, "table"]),
});

export type SqlOutput = z.infer<typeof sqlOutputSchema>;

export const chartSpecOutputSchema = z.object({
	chartType: z.enum(CHART_TYPES),
	title: z.string(),
	subtitle: z.string().optional(),
	encoding: z.object({
		x: z.string().optional(),
		y: z.string().optional(),
		category: z.string().optional(),
		value: z.string().optional(),
	}),
	series: z
		.array(
			z.object({
				column: z.string(),
				label: z.string(),
				colorToken: z.enum(COLOR_TOKENS),
				stack: z.string().optional(),
			}),
		)
		.min(1)
		.max(5),
	options: z.object({
		legend: z.boolean().optional(),
		grid: z.boolean().optional(),
		smooth: z.boolean().optional(),
		horizontal: z.boolean().optional(),
		dataLabels: z.boolean().optional(),
		donut: z.boolean().optional(),
		valueFormat: z.enum(VALUE_FORMATS).optional(),
	}),
});

export const answerOutputSchema = z.object({
	answer: z.string(),
});
