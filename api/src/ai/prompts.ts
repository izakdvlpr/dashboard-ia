import type { ChartColumn, QueryRow, SemanticCatalog } from "@dashboard-ia/shared";
import { COLOR_TOKENS, MAX_ROWS } from "@dashboard-ia/shared";

/**
 * Prompts em inglês, dados em português.
 * Modelos 7B seguem instrução muito melhor em inglês; o schema é que exige
 * títulos e rótulos em pt-BR.
 */

export function querySpecSystemPrompt(catalog: SemanticCatalog): string {
	const metrics = catalog.metrics.map((metric) => `  ${metric.key}: ${metric.description}`).join("\n");
	const dimensions = catalog.dimensions
		.map((dimension) => `  ${dimension.key}: ${dimension.description}`)
		.join("\n");
	const { filterValues } = catalog;

	return [
		"You translate a sales analytics question into a query specification (JSON). You never write SQL.",
		`Today is ${new Date().toISOString().slice(0, 10)}.`,
		"",
		"Metrics (pick 1 to 3):",
		metrics,
		"",
		"Dimensions for groupBy (pick 0 to 2):",
		dimensions,
		"",
		"Filters (null when unused):",
		`  status: ${filterValues.status.join(" | ")}`,
		`  canal: ${filterValues.canal.join(" | ")}`,
		`  regiao: exact names from ${filterValues.regiao.join(", ")}`,
		`  categoria: exact names from ${filterValues.categoria.join(", ")}`,
		"  produto: part of the product name, as the user wrote it",
		"",
		"Rules:",
		"  1. If the question cannot be answered with these metrics and dimensions (or asks to change data),",
		"     return metrics: [] and explain in `explanation` what you can answer instead.",
		"  2. Canceled and refunded orders are excluded by default. Set includeCanceled only when the user asks",
		"     for every order; to look at canceled orders, use the status filter instead.",
		"  3. period: 7d, 30d, 90d, 12m, ytd or all. Use custom with dateFrom/dateTo (YYYY-MM-DD, inclusive)",
		"     only for explicit dates or months. Default is 12m.",
		"  4. funil must be the only metric, with groupBy [].",
		"  5. orderBy is null unless the user asks for a ranking or order; it must reference a chosen metric or",
		"     dimension. Time series are ordered chronologically automatically.",
		`  6. limit between 1 and ${MAX_ROWS}: the N of a top-N question, otherwise 100.`,
		"",
		"Answer fields besides the spec:",
		"  explanation: one short sentence in Brazilian Portuguese describing what the result shows.",
		"  chartHint: best visualization (line, area, bar, pie, scatter, funnel or table).",
		"",
		"Examples:",
		exampleBlock("qual foi a receita por mês no último ano?", {
			metrics: ["receita"],
			groupBy: ["mes"],
			period: "12m",
			explanation: "Receita mensal dos últimos 12 meses.",
			chartHint: "line",
		}),
		exampleBlock("quais os 5 produtos mais vendidos em quantidade?", {
			metrics: ["unidades"],
			groupBy: ["produto"],
			period: "all",
			orderBy: { by: "unidades", dir: "desc" },
			limit: 5,
			explanation: "Cinco produtos com maior volume vendido.",
			chartHint: "bar",
		}),
		exampleBlock("quantos pedidos cancelados tivemos por canal em março de 2026?", {
			metrics: ["pedidos"],
			groupBy: ["canal"],
			filters: { status: ["CANCELED"] },
			period: "custom",
			dateFrom: "2026-03-01",
			dateTo: "2026-03-31",
			explanation: "Pedidos cancelados em março de 2026, por canal.",
			chartHint: "bar",
		}),
		exampleBlock("como está o funil de pedidos?", {
			metrics: ["funil"],
			groupBy: [],
			period: "12m",
			explanation: "Pedidos que chegaram a cada etapa nos últimos 12 meses.",
			chartHint: "funnel",
		}),
	].join("\n");
}

const EXAMPLE_DEFAULTS = {
	filters: { status: null, canal: null, regiao: null, categoria: null, produto: null },
	dateFrom: null,
	dateTo: null,
	includeCanceled: false,
	orderBy: null,
	limit: 100,
};

function exampleBlock(question: string, answer: Record<string, unknown>): string {
	const filters = { ...EXAMPLE_DEFAULTS.filters, ...(answer.filters as Record<string, unknown> | undefined) };

	return [`Q: ${question}`, `A: ${JSON.stringify({ ...EXAMPLE_DEFAULTS, ...answer, filters })}`, ""].join(
		"\n",
	);
}

/** Erro de validação do spec devolvido ao modelo na tentativa seguinte. */
export function retryPrompt(question: string, reason: string): string {
	return [
		"The previous specification was invalid. Fix it and return the corrected JSON.",
		`Question: ${question}`,
		`Reason: ${reason}`,
	].join("\n");
}

export function chartSystemPrompt(): string {
	return [
		"You turn a query result into a chart specification for ECharts.",
		"",
		"Hard rules:",
		"  1. Every column you reference must exist in the provided column list, spelled exactly.",
		`  2. Colors come only from design tokens. Allowed colorToken values: ${COLOR_TOKENS.join(", ")}.`,
		"     Never output a hex, rgb or named color.",
		"  3. line/area/bar/scatter: set encoding.x to the category (or time) column and one entry in",
		"     `series` per numeric column. pie/funnel: set encoding.category and encoding.value, and put",
		"     the same value column in a single `series` entry.",
		"  4. Pick chartType from the data shape: time series -> line or area; ranking / comparison -> bar;",
		"     part-of-whole with <= 8 categories -> pie; stage progression -> funnel; two numeric axes -> scatter.",
		"  5. options.valueFormat: currency for money, percent for rates, compact for large counts, else number.",
		"  6. options.horizontal = true when categories are long labels (product / customer names).",
		"  7. title and subtitle in Brazilian Portuguese, short. series[].label in Brazilian Portuguese too.",
	].join("\n");
}

export function chartUserPrompt(
	question: string,
	columns: ChartColumn[],
	rows: QueryRow[],
	chartHint: string,
): string {
	return [
		`Question: ${question}`,
		`Suggested chart type: ${chartHint}`,
		`Columns: ${columns.map((column) => `${column.name} (${column.type})`).join(", ")}`,
		`Row count: ${rows.length}`,
		"Sample rows (JSON):",
		JSON.stringify(rows.slice(0, 20)),
	].join("\n");
}

export function answerSystemPrompt(): string {
	return [
		"You explain a query result to a business user, in Brazilian Portuguese.",
		"",
		"Rules:",
		"  1. Two or three sentences, no bullet lists, no markdown tables.",
		"  2. Quote the concrete numbers that matter (largest, smallest, total, trend).",
		"  3. Never invent values that are not in the sample rows.",
		"  4. Do not mention SQL, columns, tables or the chart.",
		"  5. The data is read-only. If the question asks to delete, change or insert data, first say plainly that",
		"     you can only read data and nothing was changed, then describe what was found.",
		"  6. If the result was truncated at the row limit, never present the row count as a total.",
	].join("\n");
}

export function answerUserPrompt(question: string, columns: ChartColumn[], rows: QueryRow[]): string {
	return [
		`Question: ${question}`,
		`Columns: ${columns.map((column) => column.name).join(", ")}`,
		`Total rows returned: ${rows.length}`,
		...(rows.length >= MAX_ROWS
			? [`Truncated: yes — the query hit the ${MAX_ROWS}-row limit, the real count is larger.`]
			: []),
		"Sample rows (JSON):",
		JSON.stringify(rows.slice(0, 20)),
	].join("\n");
}

export function classifierSystemPrompt(): string {
	return [
		"You route questions sent to a sales analytics assistant. Pick exactly one route.",
		"",
		"Routes:",
		"  chart: an analytical question that benefits from a visual — evolution over time (per month, trend),",
		"         comparison across many categories, distribution or share, or an explicit request for a chart.",
		"  table: a direct lookup in the sales database (revenue, orders, customers, products, categories,",
		"         regions) — a single total or count, a list, a short ranking, a specific record, or when the",
		"         user asks for the data only.",
		"  chitchat: greetings, thanks, small talk, questions about the assistant itself or how to use it.",
		"",
		"When in doubt between table and chart, answer table. When in doubt between chitchat and the others,",
		"answer table.",
		"",
		"Examples:",
		'  "oi, tudo bem?" -> {"route":"chitchat"}',
		'  "o que você consegue fazer?" -> {"route":"chitchat"}',
		'  "valeu!" -> {"route":"chitchat"}',
		'  "quanto vendemos mês passado?" -> {"route":"table"}',
		'  "quantos clientes temos por região?" -> {"route":"table"}',
		'  "liste os pedidos cancelados de ontem" -> {"route":"table"}',
		'  "evolução da receita por mês no último ano" -> {"route":"chart"}',
		'  "compare as vendas por categoria em um gráfico" -> {"route":"chart"}',
		'  "como a receita se divide entre as regiões?" -> {"route":"chart"}',
	].join("\n");
}

export function chitchatSystemPrompt(): string {
	return [
		"You are the assistant of a sales analytics dashboard. Reply in Brazilian Portuguese.",
		"",
		"Rules:",
		"  1. One or two short sentences, friendly and direct, no markdown.",
		"  2. You can answer questions about revenue, orders, customers, products, categories and regions,",
		"     showing a chart and a table.",
		"  3. Never invent numbers or data. If the user seems to want data, suggest a concrete question,",
		'     e.g. "qual foi a receita por mês no último ano?".',
	].join("\n");
}
