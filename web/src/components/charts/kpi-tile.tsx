import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import type { Kpi } from "@/lib/api.ts";
import { formatDelta, formatValue } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.tsx";
import { Skeleton } from "../ui/skeleton.tsx";

export function KpiTile({ kpi }: { kpi: Kpi }) {
	const up = (kpi.delta ?? 0) > 0;
	const flat = kpi.delta === null || kpi.delta === 0;
	const Icon = flat ? MinusIcon : up ? TrendingUpIcon : TrendingDownIcon;

	return (
		<Card className="gap-2 py-4">
			<CardHeader className="px-4">
				<CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
					{kpi.label}
				</CardTitle>
			</CardHeader>
			<CardContent className="flex items-end justify-between gap-2 px-4">
				<span className="text-2xl font-semibold tabular-nums">
					{formatValue(kpi.value, kpi.format === "percent" ? "percent" : kpi.format)}
				</span>
				<span
					className={cn(
						"flex items-center gap-1 text-xs font-medium tabular-nums",
						flat && "text-muted-foreground",
						!flat && up && "text-emerald-600 dark:text-emerald-400",
						!flat && !up && "text-rose-600 dark:text-rose-400",
					)}
					title="Variação vs. período anterior"
				>
					<Icon className="size-3.5" />
					{formatDelta(kpi.delta)}
				</span>
			</CardContent>
		</Card>
	);
}

export function KpiTileSkeleton() {
	return (
		<Card className="gap-2 py-4">
			<CardHeader className="px-4">
				<Skeleton className="h-3 w-20" />
			</CardHeader>
			<CardContent className="px-4">
				<Skeleton className="h-7 w-32" />
			</CardContent>
		</Card>
	);
}
