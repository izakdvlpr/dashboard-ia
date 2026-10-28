import { COLOR_TOKENS, type ColorToken, cssVar, type StructuralToken } from "@dashboard-ia/shared";
import * as echarts from "echarts";

export type ThemeMode = "light" | "dark";

export const THEME_NAMES: Record<ThemeMode, string> = { light: "ds-light", dark: "ds-dark" };

/**
 * Os tokens do shadcn são `oklch(...)`. O canvas do ECharts entende oklch em
 * navegadores recentes, mas o zrender também faz cálculos próprios de cor
 * (gradientes, opacidade) que só funcionam em rgb/hex. Por isso resolvemos o
 * valor via elemento sonda: o browser converte oklch → rgb() por nós.
 */
export function resolveToken(token: ColorToken | StructuralToken): string {
	const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar(token)).trim();

	if (!raw) return "";
	if (raw.startsWith("#") || raw.startsWith("rgb")) return raw;
	if (!raw.startsWith("oklch") && !raw.startsWith("hsl") && !raw.startsWith("lab")) return raw;

	const probe = document.createElement("span");

	probe.style.display = "none";
	probe.style.color = raw;
	document.body.appendChild(probe);

	const resolved = getComputedStyle(probe).color;

	probe.remove();

	return resolved || raw;
}

export function palette(): string[] {
	return COLOR_TOKENS.map((token) => resolveToken(token));
}

/** Mesma cor com alfa — usado nas áreas dos gráficos de linha. */
export function withAlpha(color: string, alpha: number): string {
	const match = /^rgba?\(([^)]+)\)$/.exec(color);

	if (!match) return color;

	const [r, g, b] = match[1]?.split(/[\s,/]+/).filter(Boolean) ?? [];

	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildTheme() {
	const border = resolveToken("border");
	const muted = resolveToken("muted-foreground");
	const foreground = resolveToken("foreground");
	const popover = resolveToken("popover");
	const popoverForeground = resolveToken("popover-foreground");
	const fontFamily = getComputedStyle(document.body).fontFamily || "ui-sans-serif, system-ui, sans-serif";

	const axis = {
		axisLine: { lineStyle: { color: border } },
		axisTick: { show: false },
		axisLabel: { color: muted, fontSize: 11 },
		splitLine: { lineStyle: { color: border, type: "dashed" as const } },
	};

	return {
		color: palette(),
		backgroundColor: "transparent",
		textStyle: { fontFamily, color: foreground },
		title: {
			textStyle: { color: foreground, fontSize: 14, fontWeight: 600 },
			subtextStyle: { color: muted, fontSize: 12 },
		},
		legend: { textStyle: { color: muted }, icon: "roundRect", itemWidth: 10, itemHeight: 10 },
		tooltip: {
			backgroundColor: popover,
			borderColor: border,
			borderWidth: 1,
			textStyle: { color: popoverForeground, fontSize: 12 },
			axisPointer: { lineStyle: { color: border }, crossStyle: { color: border } },
		},
		grid: { borderColor: border },
		categoryAxis: axis,
		valueAxis: axis,
		timeAxis: axis,
		logAxis: axis,
	};
}

/** Registra os dois temas a partir dos tokens vigentes no documento. */
export function registerThemes(): void {
	const isDark = document.documentElement.classList.contains("dark");

	echarts.registerTheme(isDark ? THEME_NAMES.dark : THEME_NAMES.light, buildTheme());
}
