import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	BarChart3Icon,
	LayoutDashboardIcon,
	PencilIcon,
	SparklesIcon,
	Trash2Icon,
	WandSparklesIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ChartCard } from "@/components/charts/chart-card.tsx";
import { PageHeader } from "@/components/layout/app-shell.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { type ApiError, chartsApi } from "@/lib/api.ts";

export const Route = createFileRoute("/charts/")({ component: ChartsGallery });

function ChartsGallery() {
	const queryClient = useQueryClient();
	const charts = useQuery({ queryKey: ["charts"], queryFn: () => chartsApi.list() });

	// `["charts", "pinned"]` é a query da visão geral: fixar aqui muda a tela inicial.
	const invalidate = () => queryClient.invalidateQueries({ queryKey: ["charts"] });

	const removeMutation = useMutation({
		mutationFn: chartsApi.remove,
		onSuccess: () => {
			void invalidate();
			toast.success("Gráfico excluído");
		},
		onError: (error: ApiError) => toast.error("Falha ao excluir", { description: error.message }),
	});

	const pinMutation = useMutation({
		mutationFn: ({ id, isPinned }: { id: string; isPinned: boolean }) => chartsApi.update(id, { isPinned }),
		onSuccess: () => invalidate(),
	});

	if (charts.isLoading) {
		return (
			<>
				<PageHeader title="Gráficos" />
				<div className="grid gap-4 p-6 xl:grid-cols-2">
					{[0, 1].map((index) => (
						<Skeleton key={index} className="h-72" />
					))}
				</div>
			</>
		);
	}

	const list = charts.data?.charts ?? [];

	return (
		<>
			<PageHeader
				title="Gráficos"
				description={`${list.length} salvos — gerados pela IA ou pelo construtor.`}
				action={
					<Button asChild size="sm" variant="outline">
						<Link to="/builder">
							<WandSparklesIcon />
							Novo gráfico
						</Link>
					</Button>
				}
			/>

			{list.length === 0 ? (
				<Card className="m-6">
					<CardContent className="text-muted-foreground flex flex-col items-center gap-3 py-12 text-sm">
						<BarChart3Icon className="size-6" />
						Nenhum gráfico salvo ainda. Pergunte algo no chatbot ou monte um no construtor.
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-4 p-6 xl:grid-cols-2">
					{list.map((chart) => (
						<div key={chart.id} className="space-y-2">
							<div className="flex items-center gap-2">
								<Link
									to="/charts/$chartId"
									params={{ chartId: chart.id }}
									className="text-sm font-medium hover:underline"
								>
									{chart.title}
								</Link>
								<Badge variant={chart.source === "AI" ? "default" : "secondary"}>
									{chart.source === "AI" ? <SparklesIcon /> : null}
									{chart.source === "AI" ? "IA" : "Manual"}
								</Badge>
								<div className="ml-auto flex gap-1">
									<Button
										variant={chart.isPinned ? "secondary" : "ghost"}
										size="icon"
										aria-label={chart.isPinned ? "Remover da visão geral" : "Mostrar na visão geral"}
										title={chart.isPinned ? "Remover da visão geral" : "Mostrar na visão geral"}
										onClick={() => pinMutation.mutate({ id: chart.id, isPinned: !chart.isPinned })}
									>
										<LayoutDashboardIcon />
									</Button>
									<Button asChild variant="ghost" size="icon" aria-label="Editar" title="Editar">
										<Link to="/charts/$chartId" params={{ chartId: chart.id }}>
											<PencilIcon />
										</Link>
									</Button>
									<Button
										variant="ghost"
										size="icon"
										aria-label="Excluir"
										onClick={() => removeMutation.mutate(chart.id)}
									>
										<Trash2Icon />
									</Button>
								</div>
							</div>

							<ChartCard spec={chart.chartSpec} rows={chart.rows} height={280} />
						</div>
					))}
				</div>
			)}
		</>
	);
}
