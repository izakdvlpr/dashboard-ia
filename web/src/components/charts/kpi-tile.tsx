import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { Kpi } from "@/lib/api.ts";
import { formatDelta, formatValue } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import { Skeleton } from "../ui/skeleton.tsx";

/**
 * Painel único com células separadas por hairline (gap-px sobre bg-border) —
 * funciona em 1, 2 ou 4 colunas sem calcular qual borda cada célula leva.
 */
export function KpiStrip({ children }: { children: ReactNode }) {
	return (
		<div className="bg-border grid grid-cols-1 gap-px overflow-hidden rounded-xl border sm:grid-cols-2 xl:grid-cols-4">
			{children}
		</div>
	);
}

export function KpiTile({ kpi }: { kpi: Kpi }) {
	const value = formatValue(kpi.value, kpi.format === "percent" ? "percent" : kpi.format);
	const up = (kpi.delta ?? 0) > 0;
	const flat = kpi.delta === null || kpi.delta === 0;
	const Icon = flat ? MinusIcon : up ? ArrowUpRightIcon : ArrowDownRightIcon;

	return (
		<div className="bg-card flex min-w-0 flex-col gap-3 p-5">
			<span className="label-mono text-muted-foreground truncate">{kpi.label}</span>
			<span
				title={value}
				className="font-display truncate text-2xl leading-none font-semibold tracking-tight tabular-nums sm:text-3xl xl:text-2xl 2xl:text-3xl"
			>
				{value}
			</span>
			<div className="flex items-center gap-2 text-xs">
				<span
					className={cn(
						"inline-flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 font-mono font-medium tabular-nums",
						flat && "bg-muted text-muted-foreground",
						!flat && up && "bg-success/12 text-success",
						!flat && !up && "bg-destructive/12 text-destructive",
					)}
				>
					<Icon aria-hidden className="size-3.5" />
					{formatDelta(kpi.delta)}
				</span>
				<span className="text-muted-foreground truncate">vs. período anterior</span>
			</div>
		</div>
	);
}

export function KpiTileSkeleton() {
	return (
		<div className="bg-card flex flex-col gap-3 p-5">
			<Skeleton className="h-3 w-24" />
			<Skeleton className="h-8 w-36" />
			<Skeleton className="h-4 w-40" />
		</div>
	);
}
