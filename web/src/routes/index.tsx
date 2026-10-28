import type { ChartSpec, QueryRow } from "@dashboard-ia/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChartCard } from "@/components/charts/chart-card.tsx";
import { KpiTile, KpiTileSkeleton } from "@/components/charts/kpi-tile.tsx";
import { PinnedGrid } from "@/components/charts/pinned-grid.tsx";
import { PageHeader } from "@/components/layout/app-shell.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { dashboardApi } from "@/lib/api.ts";
import { formatMonthLabel } from "@/lib/format.ts";

export const Route = createFileRoute("/")({ component: OverviewPage });

/**
 * Specs fixas do overview. Usam o mesmo ChartSpec que a IA produz — o
 * renderizador é um só, então o que aparece aqui já é o resultado final do
 * design system.
 */
const OVERVIEW: Array<{ key: string; spec: ChartSpec; wide?: boolean; monthAxis?: boolean }> = [
	{
		key: "revenue-monthly",
		monthAxis: true,
		wide: true,
		spec: {
			chartType: "area",
			title: "Receita mensal",
			subtitle: "Pedidos válidos (sem cancelados/estornados)",
			encoding: { x: "mes" },
			series: [{ column: "receita", label: "Receita", colorToken: "chart-1" }],
			options: {
				legend: false,
				grid: true,
				smooth: true,
				horizontal: false,
				dataLabels: false,
				donut: false,
				valueFormat: "currency",
			},
		},
	},
	{
		key: "top-products",
		spec: {
			chartType: "bar",
			title: "Top 10 produtos",
			encoding: { x: "produto" },
			series: [{ column: "receita", label: "Receita", colorToken: "chart-2" }],
			options: {
				legend: false,
				grid: true,
				smooth: false,
				horizontal: true,
				dataLabels: false,
				donut: false,
				valueFormat: "currency",
			},
		},
	},
	{
		key: "by-category",
		spec: {
			chartType: "pie",
			title: "Receita por categoria",
			encoding: { category: "categoria", value: "receita" },
			series: [{ column: "receita", label: "Receita", colorToken: "chart-1" }],
			options: {
				legend: true,
				grid: false,
				smooth: false,
				horizontal: false,
				dataLabels: false,
				donut: true,
				valueFormat: "currency",
			},
		},
	},
	{
		key: "by-status",
		spec: {
			chartType: "funnel",
			title: "Funil de ciclo de vida",
			subtitle: "Pedidos que alcançaram cada etapa",
			encoding: { category: "etapa", value: "pedidos" },
			series: [{ column: "pedidos", label: "Pedidos", colorToken: "chart-3" }],
			options: {
				legend: false,
				grid: false,
				smooth: false,
				horizontal: false,
				dataLabels: true,
				donut: false,
				valueFormat: "number",
			},
		},
	},
	{
		key: "by-region",
		spec: {
			chartType: "bar",
			title: "Receita por região",
			encoding: { x: "regiao" },
			series: [{ column: "receita", label: "Receita", colorToken: "chart-4" }],
			options: {
				legend: false,
				grid: true,
				smooth: false,
				horizontal: false,
				dataLabels: false,
				donut: false,
				valueFormat: "currency",
			},
		},
	},
	{
		key: "aov-monthly",
		monthAxis: true,
		spec: {
			chartType: "line",
			title: "Ticket médio mensal",
			encoding: { x: "mes" },
			series: [{ column: "ticket_medio", label: "Ticket médio", colorToken: "chart-5" }],
			options: {
				legend: false,
				grid: true,
				smooth: true,
				horizontal: false,
				dataLabels: false,
				donut: false,
				valueFormat: "currency",
			},
		},
	},
];

const RANGES = [
	{ value: "6", label: "Últimos 6 meses" },
	{ value: "12", label: "Últimos 12 meses" },
	{ value: "24", label: "Últimos 24 meses" },
];

function OverviewPage() {
	const [months, setMonths] = useState("12");
	// modo de edição só da seção "Meus gráficos" — os 6 fixos não se movem
	const [editingLayout, setEditingLayout] = useState(false);
	const range = Number(months);

	const overview = useQuery({
		queryKey: ["overview", range],
		queryFn: () => dashboardApi.overview(range),
	});

	return (
		<>
			<PageHeader
				title="Visão geral"
				description="E-commerce fictício — dados direto do Postgres."
				action={
					<Select value={months} onValueChange={setMonths}>
						<SelectTrigger size="sm" className="w-48">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{RANGES.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				}
			/>

			<div className="space-y-4 p-6">
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
					{overview.isLoading || !overview.data
						? [0, 1, 2, 3].map((index) => <KpiTileSkeleton key={index} />)
						: overview.data.kpis.map((kpi) => <KpiTile key={kpi.key} kpi={kpi} />)}
				</div>

				<div className="grid gap-4 xl:grid-cols-2">
					{OVERVIEW.map((entry) => (
						<SeriesChart key={entry.key} entry={entry} months={range} />
					))}
				</div>

				<PinnedGrid editing={editingLayout} onEditingChange={setEditingLayout} />
			</div>
		</>
	);
}

function SeriesChart({ entry, months }: { entry: (typeof OVERVIEW)[number]; months: number }) {
	const query = useQuery({
		queryKey: ["series", entry.key, months],
		queryFn: () => dashboardApi.series(entry.key, months),
		select: (data): QueryRow[] =>
			(data.rows as QueryRow[]).map((row) =>
				entry.monthAxis ? { ...row, mes: formatMonthLabel(row.mes) } : row,
			),
	});

	return (
		<ChartCard
			className={entry.wide ? "xl:col-span-2" : undefined}
			spec={entry.spec}
			rows={query.data ?? []}
			isLoading={query.isLoading}
			error={query.error as Error | null}
			height={entry.wide ? 320 : 300}
		/>
	);
}
