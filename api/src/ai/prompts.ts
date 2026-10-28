import type { ChartColumn, QueryRow } from "@dashboard-ia/shared";
import { COLOR_TOKENS } from "@dashboard-ia/shared";
import { MAX_ROWS } from "../sql-guardrails/allowlist.ts";

/**
 * Prompts em inglês, dados em português.
 * Modelos 7B seguem instrução muito melhor em inglês; o schema é que exige
 * títulos e rótulos em pt-BR.
 */

export function sqlSystemPrompt(schemaBlock: string): string {
	return [
		"You are a PostgreSQL 13 analyst. Convert the user question into ONE read-only SQL query.",
		"",
		schemaBlock,
		"",
		"Hard rules:",
		"  1. Output a single SELECT statement. No INSERT/UPDATE/DELETE/DDL, no semicolon, no comments.",
		"  2. Only the tables listed above. Never touch information_schema or pg_catalog.",
		`  3. Always end with an explicit LIMIT (max ${MAX_ROWS}).`,
		'  4. Identifiers are camelCase and case-sensitive: always double-quote them ("placedAt", "unitPrice").',
		"  5. Aggregate whenever the question is analytical; do not return raw rows unless asked.",
		"  6. For time series use date_trunc + to_char(..., 'YYYY-MM') and order by the period ascending.",
		"  7. Give every computed column a short snake_case alias in Portuguese (receita, pedidos, ticket_medio).",
		"  8. UNION / INTERSECT / EXCEPT are not supported.",
		"",
		"Answer fields:",
		"  sql: the query.",
		"  explanation: one short sentence in Brazilian Portuguese describing what the query returns.",
		"  chartHint: best visualization for the result (line, area, bar, pie, scatter, funnel or table).",
		"",
		"Examples:",
		exampleBlock(
			"qual foi a receita por mês no último ano?",
			`SELECT to_char(date_trunc('month', o."placedAt"), 'YYYY-MM') AS mes, SUM(oi."quantity" * oi."unitPrice" - oi."discount") AS receita FROM "Order" o JOIN "OrderItem" oi ON oi."orderId" = o."id" WHERE o."status" NOT IN ('CANCELED', 'REFUNDED') AND o."placedAt" >= now() - interval '12 months' GROUP BY 1 ORDER BY 1 LIMIT 500`,
			"Receita mensal dos últimos 12 meses.",
			"line",
		),
		exampleBlock(
			"quais os 5 produtos mais vendidos em quantidade?",
			`SELECT p."name" AS produto, SUM(oi."quantity") AS unidades FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId" JOIN "Product" p ON p."id" = oi."productId" WHERE o."status" NOT IN ('CANCELED', 'REFUNDED') GROUP BY p."name" ORDER BY unidades DESC LIMIT 5`,
			"Cinco produtos com maior volume vendido.",
			"bar",
		),
		exampleBlock(
			"como a receita se divide entre as regiões?",
			`SELECT r."name" AS regiao, SUM(oi."quantity" * oi."unitPrice" - oi."discount") AS receita FROM "Order" o JOIN "OrderItem" oi ON oi."orderId" = o."id" JOIN "Region" r ON r."id" = o."regionId" WHERE o."status" NOT IN ('CANCELED', 'REFUNDED') GROUP BY r."name" ORDER BY receita DESC LIMIT 50`,
			"Receita total por região.",
			"pie",
		),
	].join("\n");
}

function exampleBlock(question: string, sql: string, explanation: string, chartHint: string): string {
	return [`Q: ${question}`, `A: ${JSON.stringify({ sql, explanation, chartHint })}`, ""].join("\n");
}

/** Erro do guardrail ou do Postgres devolvido ao modelo na tentativa seguinte. */
export function retryPrompt(question: string, badSql: string, reason: string): string {
	return [
		"The previous query was rejected. Fix it and return the corrected JSON.",
		`Question: ${question}`,
		`Rejected SQL: ${badSql}`,
		`Reason: ${reason}`,
	].join("\n");
}

export function chartSystemPrompt(): string {
	return [
		"You turn a SQL result into a chart specification for ECharts.",
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
		"You explain a SQL result to a business user, in Brazilian Portuguese.",
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
