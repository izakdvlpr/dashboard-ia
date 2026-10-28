import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	rectSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckIcon, LayoutDashboardIcon, PencilIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { type ApiError, chartsApi } from "@/lib/api.ts";
import { SortableChartCard } from "./sortable-chart-card.tsx";

const PINNED_KEY = ["charts", "pinned"];

/**
 * Gráficos salvos que o usuário mandou para a visão geral. Renderiza o cache do
 * `Chart` (rápido e sem custo de banco); "Atualizar dados" reexecuta os SELECTs.
 */
export function PinnedGrid({
	editing,
	onEditingChange,
}: {
	editing: boolean;
	onEditingChange: (editing: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const pinned = useQuery({ queryKey: PINNED_KEY, queryFn: () => chartsApi.list(true) });

	const charts = pinned.data?.charts ?? [];

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);

	const invalidate = () => queryClient.invalidateQueries({ queryKey: ["charts"] });

	const reorderMutation = useMutation({
		mutationFn: (ids: string[]) => chartsApi.reorder(ids),
		// a reversão da ordem otimista vai no onError da chamada, que conhece a lista anterior
		onError: (error: ApiError) => toast.error("Falha ao reordenar", { description: error.message }),
		onSuccess: (data) => queryClient.setQueryData(PINNED_KEY, data),
	});

	const updateMutation = useMutation({
		mutationFn: ({ id, ...input }: { id: string; isPinned?: boolean; layoutSpan?: number }) =>
			chartsApi.update(id, input),
		onSuccess: () => invalidate(),
		onError: (error: ApiError) => toast.error("Falha ao atualizar", { description: error.message }),
	});

	const refreshMutation = useMutation({
		mutationFn: async () => {
			const results = await Promise.allSettled(charts.map((chart) => chartsApi.run(chart.id)));

			return results.filter((result) => result.status === "rejected").length;
		},
		onSuccess: (failed) => {
			void invalidate();

			if (failed === 0) toast.success("Dados atualizados");
			else toast.warning(`${failed} de ${charts.length} gráficos não atualizaram`);
		},
	});

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event;

		if (!over || active.id === over.id) return;

		const from = charts.findIndex((chart) => chart.id === active.id);
		const to = charts.findIndex((chart) => chart.id === over.id);

		if (from < 0 || to < 0) return;

		// Otimista: o card fica na posição nova antes do round-trip; erro reverte.
		const next = arrayMove(charts, from, to);

		queryClient.setQueryData(PINNED_KEY, { charts: next });
		reorderMutation.mutate(
			next.map((chart) => chart.id),
			{ onError: () => queryClient.setQueryData(PINNED_KEY, { charts }) },
		);
	}

	if (pinned.isLoading) {
		return <Skeleton className="h-72" />;
	}

	return (
		<section className="space-y-4">
			<div className="flex flex-wrap items-center gap-x-2.5 gap-y-3">
				<h2 className="text-lg font-semibold">Meus gráficos</h2>
				<span className="label-mono bg-muted text-muted-foreground rounded-sm px-1.5 py-0.5 tabular-nums">
					{charts.length}
				</span>

				<div className="ml-auto flex gap-2">
					<Button
						size="sm"
						variant="outline"
						disabled={charts.length === 0 || refreshMutation.isPending}
						onClick={() => refreshMutation.mutate()}
					>
						<RefreshCwIcon className={refreshMutation.isPending ? "animate-spin" : undefined} />
						Atualizar dados
					</Button>
					<Button
						size="sm"
						variant={editing ? "default" : "outline"}
						disabled={charts.length === 0}
						onClick={() => onEditingChange(!editing)}
					>
						{editing ? <CheckIcon /> : <PencilIcon />}
						{editing ? "Concluir" : "Editar layout"}
					</Button>
				</div>
			</div>

			{charts.length === 0 ? (
				<Card>
					<CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-sm">
						<LayoutDashboardIcon className="size-5" />
						<p>Nenhum gráfico na visão geral ainda.</p>
						<p className="text-xs">
							Marque "Mostrar na visão geral" em{" "}
							<Link to="/charts" className="text-primary underline-offset-4 hover:underline">
								Gráficos
							</Link>{" "}
							ou monte um no{" "}
							<Link to="/builder" className="text-primary underline-offset-4 hover:underline">
								construtor
							</Link>
							.
						</p>
					</CardContent>
				</Card>
			) : (
				<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
					<SortableContext items={charts.map((chart) => chart.id)} strategy={rectSortingStrategy}>
						<div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[repeat(2,minmax(0,1fr))]">
							{charts.map((chart) => (
								<SortableChartCard
									key={chart.id}
									chart={chart}
									editing={editing}
									onToggleSpan={(target) =>
										updateMutation.mutate({
											id: target.id,
											layoutSpan: target.layoutSpan === 2 ? 1 : 2,
										})
									}
									onUnpin={(target) => updateMutation.mutate({ id: target.id, isPinned: false })}
								/>
							))}
						</div>
					</SortableContext>
				</DndContext>
			)}
		</section>
	);
}
