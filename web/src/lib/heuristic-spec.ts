import type { ChartColumn, ChartSpec } from "@dashboard-ia/shared";
import { COLOR_TOKENS } from "@dashboard-ia/shared";

/**
 * Primeiro palpite ao trocar o dataset no construtor: primeira coluna não numérica
 * vira o eixo X e as numéricas viram séries. O usuário ajusta tudo depois.
 */
export function heuristicSpec(columns: ChartColumn[], title = "Novo gráfico"): ChartSpec {
	const numeric = columns.filter((column) => column.type === "number");
	const category = columns.find((column) => column.type !== "number") ?? columns[0];
	const values = numeric.length > 0 ? numeric : columns;

	const series = values.slice(0, 3).map((column, index) => ({
		column: column.name,
		label: column.name,
		colorToken: COLOR_TOKENS[index % COLOR_TOKENS.length] as ChartSpec["series"][number]["colorToken"],
	}));

	const looksTemporal = /data|dia|mes|mês|month|date|periodo|período/i.test(category?.name ?? "");

	return {
		chartType: looksTemporal ? "line" : "bar",
		title,
		encoding: { x: category?.name, category: category?.name, value: series[0]?.column },
		series: series.length > 0 ? series : [{ column: "valor", label: "valor", colorToken: "chart-1" }],
		options: {
			legend: series.length > 1,
			grid: true,
			smooth: looksTemporal,
			horizontal: false,
			dataLabels: false,
			donut: false,
			valueFormat: "number",
		},
	};
}
