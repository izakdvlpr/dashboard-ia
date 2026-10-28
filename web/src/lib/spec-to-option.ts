import type { ChartSeriesSpec, ChartSpec, QueryRow, ValueFormat } from "@dashboard-ia/shared";
import { COLOR_TOKENS, mergeOption } from "@dashboard-ia/shared";
import type { EChartsOption } from "echarts";
import { resolveToken, withAlpha } from "./echarts-theme.ts";
import { formatAxisValue, formatValue } from "./format.ts";

type BuildInput = {
	spec: ChartSpec;
	rows: QueryRow[];
	/** patch do preset ativo + ajustes locais ainda não salvos */
	optionPatch?: Record<string, unknown> | null;
};

function seriesColor(series: ChartSeriesSpec): string {
	return resolveToken(series.colorToken);
}

function labelOf(row: QueryRow, column: string | undefined): string {
	if (!column) return "";

	const value = row[column];

	return value === null || value === undefined ? "—" : String(value);
}

function numberOf(row: QueryRow, column: string): number | null {
	const value = row[column];

	if (value === null || value === undefined) return null;
	if (typeof value === "number") return value;

	const parsed = Number(value);

	return Number.isFinite(parsed) ? parsed : null;
}

/** Aceita qualquer `CallbackDataParams` do ECharts sem depender do tipo interno. */
type LabelParams = { name?: string; value?: unknown; seriesName?: string };

function tooltipFormatter(format: ValueFormat) {
	return (params: unknown) => {
		const list = Array.isArray(params) ? params : [params];
		const head = list[0] as { axisValueLabel?: string; name?: string } | undefined;
		const title = head?.axisValueLabel ?? head?.name ?? "";

		const lines = list.map((item) => {
			const entry = item as { marker?: string; seriesName?: string; value: unknown; name?: string };
			const raw = Array.isArray(entry.value) ? entry.value[1] : entry.value;
			const name = entry.seriesName && list.length > 1 ? entry.seriesName : (entry.name ?? entry.seriesName);

			return `${entry.marker ?? ""} ${name}: <b>${formatValue(raw, format)}</b>`;
		});

		return [title, ...lines].filter(Boolean).join("<br/>");
	};
}

/**
 * Categorias (pie/funnel) usam category+value; os demais usam x + N séries.
 * Com `cycle`, uma série única percorre a paleta a partir do próprio token —
 * senão toda fatia do pie sairia da mesma cor.
 */
function categorical(spec: ChartSpec, rows: QueryRow[], cycle = false) {
	const categoryColumn = spec.encoding.category ?? spec.encoding.x;
	const valueColumn = spec.encoding.value ?? spec.series[0]?.column;
	const firstToken = spec.series[0]?.colorToken ?? "chart-1";
	const offset = Math.max(0, COLOR_TOKENS.indexOf(firstToken));

	return rows.map((row, index) => {
		const token =
			cycle && spec.series.length <= 1
				? COLOR_TOKENS[(offset + index) % COLOR_TOKENS.length]
				: spec.series[index % spec.series.length]?.colorToken;

		return {
			name: labelOf(row, categoryColumn),
			value: (valueColumn ? numberOf(row, valueColumn) : null) ?? undefined,
			itemStyle: { color: resolveToken(token ?? "chart-1") },
		};
	});
}

export function buildOption({ spec, rows, optionPatch }: BuildInput): EChartsOption {
	const format = spec.options.valueFormat;
	const { legend, grid, smooth, horizontal, dataLabels, donut } = spec.options;

	const header: EChartsOption = {
		title: spec.subtitle ? { text: spec.title, subtext: spec.subtitle } : { text: spec.title },
		tooltip: {
			trigger: spec.chartType === "pie" || spec.chartType === "funnel" ? "item" : "axis",
			formatter: tooltipFormatter(format),
		},
		legend: { show: legend && spec.series.length > 1, bottom: 0 },
	};

	if (spec.chartType === "pie") {
		return finish(
			{
				...header,
				legend: { show: legend, type: "scroll", bottom: 0 },
				series: [
					{
						type: "pie",
						radius: donut ? ["45%", "70%"] : "65%",
						center: ["50%", "48%"],
						avoidLabelOverlap: true,
						itemStyle: { borderRadius: 6, borderColor: resolveToken("background"), borderWidth: 2 },
						label: {
							show: dataLabels,
							formatter: (params: LabelParams) => `${params.name}\n${formatValue(params.value, format)}`,
						},
						data: categorical(spec, rows, true),
					},
				],
			},
			optionPatch,
		);
	}

	if (spec.chartType === "funnel") {
		return finish(
			{
				...header,
				legend: { show: legend, bottom: 0 },
				series: [
					{
						type: "funnel",
						left: "10%",
						right: "10%",
						top: 56,
						bottom: 32,
						sort: "descending",
						gap: 2,
						label: { show: true, position: "inside", formatter: "{b}" },
						data: categorical(spec, rows),
					},
				],
			},
			optionPatch,
		);
	}

	if (spec.chartType === "scatter") {
		const xColumn = spec.encoding.x ?? "";

		return finish(
			{
				...header,
				tooltip: { trigger: "item", formatter: tooltipFormatter(format) },
				grid: { left: 12, right: 20, top: 56, bottom: legend ? 40 : 16, containLabel: true, show: false },
				xAxis: { type: "value", splitLine: { show: grid } },
				yAxis: {
					type: "value",
					splitLine: { show: grid },
					axisLabel: { formatter: (value: number) => formatAxisValue(value, format) },
				},
				series: spec.series.map((series) => ({
					type: "scatter" as const,
					name: series.label,
					symbolSize: 8,
					itemStyle: { color: seriesColor(series), opacity: 0.8 },
					data: rows.map((row) => [numberOf(row, xColumn), numberOf(row, series.column)]),
				})),
			},
			optionPatch,
		);
	}

	// line / area / bar — eixo categórico + N séries
	const categories = rows.map((row) => labelOf(row, spec.encoding.x));
	const valueAxis = {
		type: "value" as const,
		splitLine: { show: grid },
		axisLabel: { formatter: (value: number) => formatAxisValue(value, format) },
	};
	// barra tem um rótulo por categoria: sem interval 0 o ECharts esconde metade deles
	const isBar = spec.chartType === "bar";
	const categoryAxis = {
		type: "category" as const,
		data: categories,
		boundaryGap: isBar,
		// chave ausente (não undefined) em line/area, senão apaga o axisLabel do tema
		...(isBar ? { axisLabel: { interval: 0, rotate: !horizontal && categories.length > 5 ? 30 : 0 } } : {}),
	};

	const series = spec.series.map((item) => {
		const color = seriesColor(item);
		const data = rows.map((row) => numberOf(row, item.column));
		const label = {
			show: dataLabels,
			position: horizontal ? ("right" as const) : ("top" as const),
			formatter: (params: LabelParams) => formatAxisValue(params.value, format),
			fontSize: 10,
		};

		if (spec.chartType === "bar") {
			return {
				type: "bar" as const,
				name: item.label,
				stack: item.stack,
				itemStyle: { color, borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
				barMaxWidth: 36,
				label,
				data,
			};
		}

		return {
			type: "line" as const,
			name: item.label,
			stack: item.stack,
			smooth,
			showSymbol: rows.length <= 24,
			symbolSize: 6,
			lineStyle: { width: 2, color },
			itemStyle: { color },
			areaStyle:
				spec.chartType === "area" ? { color: withAlpha(color, 0.22), origin: "start" as const } : undefined,
			label,
			data,
		};
	});

	return finish(
		{
			...header,
			grid: {
				left: 12,
				// containLabel não cobre o último rótulo do eixo de valor, que fica centrado na borda
				right: horizontal ? 40 : 20,
				top: 56,
				bottom: legend && spec.series.length > 1 ? 40 : 16,
				containLabel: true,
			},
			xAxis: horizontal ? valueAxis : categoryAxis,
			yAxis: horizontal ? { ...categoryAxis, inverse: true } : valueAxis,
			series,
		},
		optionPatch,
	);
}

function finish(option: EChartsOption, patch: Record<string, unknown> | null | undefined): EChartsOption {
	return mergeOption(option as Record<string, unknown>, patch) as EChartsOption;
}
