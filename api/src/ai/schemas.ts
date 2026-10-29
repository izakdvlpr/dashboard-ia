import {
	CHART_TYPES,
	COLOR_TOKENS,
	DIMENSIONS,
	METRICS,
	ORDER_CHANNELS,
	ORDER_STATUSES,
	PERIODS,
	SORT_KEYS,
	VALUE_FORMATS,
} from "@dashboard-ia/shared";
import { z } from "zod";

/**
 * Schemas de saída estruturada enviados ao AI Gateway.
 *
 * Flat e sem `.default`/`.prefault`: viram JSON Schema para o provider, e nem
 * todo provider aceita defaults ou composição. Precisam ser mantidos em
 * sincronia com os zod de `@dashboard-ia/shared` — a validação real acontece lá.
 *
 * Campo opcional é `.nullable()`, não `.optional()`: o strict mode da OpenAI
 * exige toda chave em `required`. Os `null` são removidos antes da validação.
 */

/** Versão flat do `querySpecSchema` do shared. `metrics: []` = pergunta fora do catálogo. */
export const querySpecOutputSchema = z.object({
	metrics: z.array(z.enum(METRICS)),
	groupBy: z.array(z.enum(DIMENSIONS)),
	filters: z.object({
		status: z.array(z.enum(ORDER_STATUSES)).nullable(),
		canal: z.array(z.enum(ORDER_CHANNELS)).nullable(),
		regiao: z.array(z.string()).nullable(),
		categoria: z.array(z.string()).nullable(),
		produto: z.array(z.string()).nullable(),
	}),
	period: z.enum(PERIODS),
	dateFrom: z.string().nullable(),
	dateTo: z.string().nullable(),
	includeCanceled: z.boolean(),
	orderBy: z.object({ by: z.enum(SORT_KEYS), dir: z.enum(["asc", "desc"]) }).nullable(),
	limit: z.number().int(),
	explanation: z.string(),
	chartHint: z.enum([...CHART_TYPES, "table"]),
});

export type QuerySpecOutput = z.infer<typeof querySpecOutputSchema>;

export const chartSpecOutputSchema = z.object({
	chartType: z.enum(CHART_TYPES),
	title: z.string(),
	subtitle: z.string().nullable(),
	encoding: z.object({
		x: z.string().nullable(),
		y: z.string().nullable(),
		category: z.string().nullable(),
		value: z.string().nullable(),
	}),
	series: z
		.array(
			z.object({
				column: z.string(),
				label: z.string(),
				colorToken: z.enum(COLOR_TOKENS),
				stack: z.string().nullable(),
			}),
		)
		.min(1)
		.max(5),
	options: z.object({
		legend: z.boolean().nullable(),
		grid: z.boolean().nullable(),
		smooth: z.boolean().nullable(),
		horizontal: z.boolean().nullable(),
		dataLabels: z.boolean().nullable(),
		donut: z.boolean().nullable(),
		valueFormat: z.enum(VALUE_FORMATS).nullable(),
	}),
});

export const answerOutputSchema = z.object({
	answer: z.string(),
});

export const QUESTION_ROUTES = ["chitchat", "table", "chart"] as const;

export type QuestionRoute = (typeof QUESTION_ROUTES)[number];

export const questionRouteSchema = z.object({
	route: z.enum(QUESTION_ROUTES),
});
