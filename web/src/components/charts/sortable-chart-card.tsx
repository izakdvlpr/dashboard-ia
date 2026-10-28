import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "@tanstack/react-router";
import { Columns2Icon, GripVerticalIcon, PencilIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import type { ChartDto } from "@/lib/api.ts";
import { cn } from "@/lib/utils.ts";
import { ChartCard } from "./chart-card.tsx";

type SortableChartCardProps = {
	chart: ChartDto;
	editing: boolean;
	onToggleSpan: (chart: ChartDto) => void;
	onUnpin: (chart: ChartDto) => void;
};

/**
 * Item ordenável da visão geral. O gráfico continua sendo renderizado pelo
 * `ChartCard`, aqui só entram o handle e os controles do modo de edição.
 */
export function SortableChartCard({ chart, editing, onToggleSpan, onUnpin }: SortableChartCardProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: chart.id,
		disabled: !editing,
	});

	return (
		<div
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={cn(
				"group min-w-0 space-y-2",
				chart.layoutSpan === 2 && "xl:col-span-2",
				isDragging && "z-10 opacity-70",
			)}
		>
			<div className="flex items-center gap-2">
				{editing ? (
					<button
						type="button"
						aria-label="Arrastar para reordenar"
						className="text-muted-foreground hover:text-foreground cursor-grab touch-none"
						{...attributes}
						{...listeners}
					>
						<GripVerticalIcon className="size-4" />
					</button>
				) : null}

				<Link
					to="/charts/$chartId"
					params={{ chartId: chart.id }}
					className="font-display hover:text-primary truncate text-sm font-semibold transition-colors"
				>
					{chart.title}
				</Link>

				<div className="ml-auto flex gap-1">
					{editing ? (
						<>
							<Button
								variant="ghost"
								size="icon"
								aria-label={chart.layoutSpan === 2 ? "Usar meia linha" : "Usar linha inteira"}
								title={chart.layoutSpan === 2 ? "Usar meia linha" : "Usar linha inteira"}
								onClick={() => onToggleSpan(chart)}
							>
								<Columns2Icon />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								aria-label="Remover da visão geral"
								title="Remover da visão geral"
								onClick={() => onUnpin(chart)}
							>
								<XIcon />
							</Button>
						</>
					) : (
						<Button asChild variant="ghost" size="icon" aria-label="Editar" title="Editar">
							<Link to="/charts/$chartId" params={{ chartId: chart.id }}>
								<PencilIcon />
							</Link>
						</Button>
					)}
				</div>
			</div>

			<ChartCard
				spec={chart.chartSpec}
				rows={chart.rows}
				height={chart.layoutSpan === 2 ? 320 : 280}
				className="group-hover:border-primary/40 transition-colors"
			/>
		</div>
	);
}
