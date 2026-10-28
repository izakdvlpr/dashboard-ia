import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";
import { useTheme } from "@/lib/theme.tsx";
import { cn } from "@/lib/utils.ts";

type EChartProps = {
	option: EChartsOption;
	className?: string;
	height?: number | string;
};

/**
 * O tema do ECharts é imutável depois que a instância nasce — trocar light/dark
 * remonta o componente via `key` (tema + estado das webfonts).
 */
export function EChart({ option, className, height = 300 }: EChartProps) {
	const { echartsTheme, chartKey } = useTheme();

	return (
		<ReactECharts
			key={chartKey}
			theme={echartsTheme}
			option={option}
			notMerge
			lazyUpdate
			style={{ height, width: "100%" }}
			className={cn("[&_canvas]:!rounded-md", className)}
			opts={{ renderer: "canvas" }}
		/>
	);
}
