import type { ChartSpec, QueryRow } from "@dashboard-ia/shared";
import { AlertTriangleIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { buildOption } from "@/lib/spec-to-option.ts";
import { useTheme } from "@/lib/theme.tsx";
import { cn } from "@/lib/utils.ts";
import { Card, CardContent } from "../ui/card.tsx";
import { Skeleton } from "../ui/skeleton.tsx";
import { EChart } from "./echart.tsx";

type ChartCardProps = {
	spec: ChartSpec;
	rows: QueryRow[];
	optionPatch?: Record<string, unknown> | null;
	isLoading?: boolean;
	error?: Error | null;
	height?: number;
	className?: string;
	action?: ReactNode;
};

export function ChartCard({
	spec,
	rows,
	optionPatch,
	isLoading,
	error,
	height = 300,
	className,
	action,
}: ChartCardProps) {
	const { mode } = useTheme();

	// `mode` não é lido aqui, mas muda o valor das CSS vars que buildOption resolve
	// biome-ignore lint/correctness/useExhaustiveDependencies: recalcular no toggle de tema
	const option = useMemo(() => buildOption({ spec, rows, optionPatch }), [spec, rows, optionPatch, mode]);

	return (
		<Card className={cn("gap-0 py-4", className)}>
			{action ? <div className="flex justify-end px-4">{action}</div> : null}
			<CardContent className="px-2">
				{isLoading ? (
					<div className="space-y-3 p-4" style={{ height }}>
						<Skeleton className="h-4 w-40" />
						<Skeleton className="h-[calc(100%-2rem)] w-full" />
					</div>
				) : error ? (
					<div
						className="text-muted-foreground flex flex-col items-center justify-center gap-2 p-4 text-sm"
						style={{ height }}
					>
						<AlertTriangleIcon className="size-5" />
						{error.message}
					</div>
				) : rows.length === 0 ? (
					<div
						className="text-muted-foreground flex items-center justify-center p-4 text-sm"
						style={{ height }}
					>
						Sem dados no período.
					</div>
				) : (
					<EChart option={option} height={height} />
				)}
			</CardContent>
		</Card>
	);
}
