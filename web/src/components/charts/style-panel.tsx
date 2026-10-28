import { mergeOption } from "@dashboard-ia/shared";
import { cn } from "@/lib/utils.ts";
import { Button } from "../ui/button.tsx";

/**
 * Cada ajuste é um pedaço de EChartsOption. O conjunto ativo vira um único
 * `optionPatch` — o mesmo formato que o preset guarda no banco.
 */
export const STYLE_TWEAKS = [
	{ key: "legendBottom", label: "Legenda embaixo", patch: { legend: { top: "auto", bottom: 0 } } },
	{ key: "hideTitle", label: "Sem título", patch: { title: { show: false } } },
	{
		key: "compact",
		label: "Compacto",
		patch: { grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true } },
	},
	{ key: "rotateLabels", label: "Eixo X inclinado", patch: { xAxis: { axisLabel: { rotate: 45 } } } },
	{ key: "noAnimation", label: "Sem animação", patch: { animation: false } },
	{
		key: "zoom",
		label: "Zoom no eixo",
		patch: { dataZoom: [{ type: "inside" }, { type: "slider", height: 16, bottom: 4 }] },
	},
] as const;

export type StyleTweakKey = (typeof STYLE_TWEAKS)[number]["key"];

export function tweaksToPatch(active: ReadonlySet<string>): Record<string, unknown> {
	return STYLE_TWEAKS.filter((tweak) => active.has(tweak.key)).reduce<Record<string, unknown>>(
		(accumulator, tweak) => mergeOption(accumulator, tweak.patch as Record<string, unknown>),
		{},
	);
}

export function StylePanel({
	active,
	onToggle,
	className,
}: {
	active: ReadonlySet<string>;
	onToggle: (key: StyleTweakKey) => void;
	className?: string;
}) {
	return (
		<div className={cn("flex flex-wrap gap-1", className)}>
			{STYLE_TWEAKS.map((tweak) => (
				<Button
					key={tweak.key}
					size="sm"
					variant={active.has(tweak.key) ? "default" : "outline"}
					aria-pressed={active.has(tweak.key)}
					onClick={() => onToggle(tweak.key)}
				>
					{tweak.label}
				</Button>
			))}
		</div>
	);
}
