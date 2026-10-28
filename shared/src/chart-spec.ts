import { z } from "zod";
import { COLOR_TOKENS } from "./design-tokens.ts";

/**
 * ChartSpec é a fonte da verdade compartilhada entre:
 *  - o schema de saída estruturada enviado ao AI Gateway (api/src/ai/schemas.ts)
 *  - a validação no servidor (zod, aqui)
 *  - o renderizador ECharts no web (web/src/lib/echarts/build-option.ts)
 *
 * Ao mudar qualquer campo aqui, atualize também o schema de saída da IA —
 * ele é mantido à parte (flat, sem defaults) porque nem todo provider aceita
 * defaults ou composição no JSON Schema de structured output.
 */

export const CHART_TYPES = ["line", "area", "bar", "pie", "scatter", "funnel"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const VALUE_FORMATS = ["number", "currency", "percent", "compact"] as const;
export type ValueFormat = (typeof VALUE_FORMATS)[number];

export const chartSeriesSpecSchema = z.object({
	/** nome exato de uma coluna do resultado */
	column: z.string().min(1),
	label: z.string().min(1),
	colorToken: z.enum(COLOR_TOKENS),
	/** séries com o mesmo stack são empilhadas (bar/area) */
	stack: z.string().optional(),
});

export const chartEncodingSchema = z.object({
	/** eixo categórico/temporal — line/area/bar/scatter */
	x: z.string().optional(),
	/** eixo de valor — usado só por scatter (y numérico explícito) */
	y: z.string().optional(),
	/** dimensão do rótulo — pie/funnel */
	category: z.string().optional(),
	/** dimensão do valor — pie/funnel */
	value: z.string().optional(),
});

export const chartOptionsSchema = z.object({
	legend: z.boolean().default(true),
	grid: z.boolean().default(true),
	smooth: z.boolean().default(false),
	horizontal: z.boolean().default(false),
	dataLabels: z.boolean().default(false),
	donut: z.boolean().default(false),
	valueFormat: z.enum(VALUE_FORMATS).default("number"),
});

export const chartSpecSchema = z.object({
	chartType: z.enum(CHART_TYPES),
	title: z.string().min(1),
	subtitle: z.string().optional(),
	encoding: chartEncodingSchema,
	series: z.array(chartSeriesSpecSchema).min(1).max(5),
	// prefault: o objeto vazio é entrada, não saída — cada campo aplica o próprio default
	options: chartOptionsSchema.prefault({}),
});

export type ChartSeriesSpec = z.infer<typeof chartSeriesSpecSchema>;
export type ChartEncoding = z.infer<typeof chartEncodingSchema>;
export type ChartOptions = z.infer<typeof chartOptionsSchema>;
export type ChartSpec = z.infer<typeof chartSpecSchema>;

export const COLUMN_TYPES = ["string", "number", "date", "boolean"] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export const chartColumnSchema = z.object({
	name: z.string(),
	type: z.enum(COLUMN_TYPES),
});
export type ChartColumn = z.infer<typeof chartColumnSchema>;

export type QueryRow = Record<string, string | number | boolean | null>;

/** Conteúdo do campo `Chart.spec` (Json) no banco. */
export const chartRecordSchema = z.object({
	chartSpec: chartSpecSchema,
	columns: z.array(chartColumnSchema),
	rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
});
export type ChartRecord = z.infer<typeof chartRecordSchema>;

/**
 * Toda coluna referenciada pela spec precisa existir no resultado.
 * Guarda contra alucinação de coluna que passou pelo structured output do modelo.
 */
export function findUnknownColumns(spec: ChartSpec, columns: ChartColumn[]): string[] {
	const known = new Set(columns.map((column) => column.name));
	const referenced = [
		spec.encoding.x,
		spec.encoding.y,
		spec.encoding.category,
		spec.encoding.value,
		...spec.series.map((series) => series.column),
	].filter((value): value is string => typeof value === "string" && value.length > 0);

	return [...new Set(referenced.filter((name) => !known.has(name)))];
}
