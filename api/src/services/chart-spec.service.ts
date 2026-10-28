import type { ChartColumn, ChartSpec, ChartType, QueryRow } from "@dashboard-ia/shared";
import { COLOR_TOKENS, chartSpecSchema, findUnknownColumns } from "@dashboard-ia/shared";
import { type ChatMessage, generate } from "../ai/gateway.ts";
import { chartSystemPrompt, chartUserPrompt } from "../ai/prompts.ts";
import { chartSpecOutputSchema } from "../ai/schemas.ts";
import { env } from "../env.ts";

const MAX_ATTEMPTS = 2;

export type ChartSpecResult = {
	spec: ChartSpec;
	/** true quando a IA falhou e caímos na heurística local. */
	fallback: boolean;
};

/**
 * Resultado -> ChartSpec. A IA só escolhe forma e tokens; cor literal nunca
 * atravessa, então todo gráfico gerado segue o design system.
 */
export async function buildChartSpec(
	question: string,
	columns: ChartColumn[],
	rows: QueryRow[],
	chartHint: string,
): Promise<ChartSpecResult> {
	if (rows.length === 0 || columns.length < 2) {
		return { spec: heuristicSpec(question, columns, chartHint), fallback: true };
	}

	const instructions = chartSystemPrompt();
	const messages: ChatMessage[] = [
		{ role: "user", content: chartUserPrompt(question, columns, rows, chartHint) },
	];

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
		try {
			const output = await generate({
				model: env.AI_CHART_MODEL,
				instructions,
				messages,
				schema: chartSpecOutputSchema,
			});

			const raw = JSON.stringify(output);
			const parsed = chartSpecSchema.safeParse(dropNulls(output));

			if (!parsed.success) {
				messages.push({ role: "assistant", content: raw });
				messages.push({
					role: "user",
					content: `Invalid spec: ${parsed.error.issues.map((issue) => issue.message).join("; ")}. Return corrected JSON.`,
				});
				continue;
			}

			const unknown = findUnknownColumns(parsed.data, columns);

			if (unknown.length > 0) {
				messages.push({ role: "assistant", content: raw });
				messages.push({
					role: "user",
					content: `These columns do not exist: ${unknown.join(", ")}. Available: ${columns
						.map((column) => column.name)
						.join(", ")}. Return corrected JSON.`,
				});
				continue;
			}

			return { spec: normalize(parsed.data, columns), fallback: false };
		} catch (error) {
			// Gateway fora do ar ou JSON irrecuperável: cai na heurística
			console.error("[chart-spec]", error);
			break;
		}
	}

	return { spec: heuristicSpec(question, columns, chartHint), fallback: true };
}

/** O schema de saída usa `null` para "ausente"; o do shared espera `undefined` para aplicar defaults. */
function dropNulls(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(dropNulls);
	if (typeof value !== "object" || value === null) return value;

	return Object.fromEntries(
		Object.entries(value)
			.filter(([, entry]) => entry !== null)
			.map(([key, entry]) => [key, dropNulls(entry)]),
	);
}

/** Corrige encoding faltante — o modelo às vezes esquece x/category. */
function normalize(spec: ChartSpec, columns: ChartColumn[]): ChartSpec {
	const numeric = columns.filter((column) => column.type === "number").map((column) => column.name);
	const label = columns.find((column) => column.type !== "number")?.name ?? columns[0]?.name;
	const categorical = spec.chartType === "pie" || spec.chartType === "funnel";

	if (categorical) {
		return {
			...spec,
			encoding: {
				...spec.encoding,
				category: spec.encoding.category ?? spec.encoding.x ?? label,
				value: spec.encoding.value ?? spec.series[0]?.column ?? numeric[0],
			},
		};
	}

	return {
		...spec,
		encoding: { ...spec.encoding, x: spec.encoding.x ?? spec.encoding.category ?? label },
	};
}

/** Sem IA: escolhe pelo formato do resultado. Nunca falha. */
export function heuristicSpec(question: string, columns: ChartColumn[], chartHint: string): ChartSpec {
	const numeric = columns.filter((column) => column.type === "number");
	const label = columns.find((column) => column.type !== "number") ?? columns[0];
	const hinted = ["line", "area", "bar", "pie", "scatter", "funnel"].includes(chartHint)
		? (chartHint as ChartType)
		: null;
	const chartType: ChartType = hinted ?? (columns.some((column) => column.type === "date") ? "line" : "bar");
	const categorical = chartType === "pie" || chartType === "funnel";

	const series = (numeric.length > 0 ? numeric : columns).slice(0, 5).map((column, index) => ({
		column: column.name,
		label: column.name,
		colorToken: COLOR_TOKENS[index % COLOR_TOKENS.length] ?? "chart-1",
	}));

	return chartSpecSchema.parse({
		chartType,
		title: question.slice(0, 80),
		encoding: categorical
			? { category: label?.name, value: numeric[0]?.name ?? label?.name }
			: { x: label?.name },
		series: series.length > 0 ? series : [{ column: "valor", label: "Valor", colorToken: "chart-1" }],
		options: {},
	});
}
