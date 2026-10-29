import type { ChartSpec, Preset, QuerySpec } from "@dashboard-ia/shared";
import { mergeOption } from "@dashboard-ia/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DatabaseIcon, SaveIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChartCard } from "@/components/charts/chart-card.tsx";
import { ChartEditor } from "@/components/charts/chart-editor.tsx";
import { PresetBar } from "@/components/charts/preset-bar.tsx";
import { QuerySpecForm } from "@/components/charts/query-spec-form.tsx";
import { StylePanel, type StyleTweakKey, tweaksToPatch } from "@/components/charts/style-panel.tsx";
import { ResultTable } from "@/components/chat/result-table.tsx";
import { PageHeader } from "@/components/layout/app-shell.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { type ApiError, chartsApi, type QueryResult, queryApi } from "@/lib/api.ts";
import { heuristicSpec } from "@/lib/heuristic-spec.ts";

export const Route = createFileRoute("/builder")({ component: BuilderPage });

function BuilderPage() {
	// Spec que gerou `result` — é o que fica salvo no gráfico para reexecutar depois.
	const [executed, setExecuted] = useState<{ spec: QuerySpec; result: QueryResult } | null>(null);
	const result = executed?.result ?? null;
	const [spec, setSpec] = useState<ChartSpec | null>(null);
	const [preset, setPreset] = useState<Preset | null>(null);
	const [tweaks, setTweaks] = useState<ReadonlySet<StyleTweakKey>>(new Set());

	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const optionPatch = useMemo(
		() => mergeOption(preset?.optionPatch ?? {}, tweaksToPatch(tweaks)),
		[preset, tweaks],
	);

	const runMutation = useMutation({
		mutationFn: async (querySpec: QuerySpec) => ({ spec: querySpec, result: await queryApi.run(querySpec) }),
		onSuccess: (data) => {
			setExecuted(data);
			setSpec((current) =>
				current && sameColumns(current, data.result)
					? current
					: heuristicSpec(data.result.columns, "Novo gráfico"),
			);
		},
		onError: (error: ApiError) => toast.error("Consulta rejeitada", { description: error.message }),
	});

	const saveMutation = useMutation({
		mutationFn: () => {
			if (!spec || !executed) throw new Error("Nada para salvar.");

			return chartsApi.create({
				title: spec.title,
				source: "MANUAL",
				querySpec: executed.spec,
				chartSpec: spec,
				columns: executed.result.columns,
				rows: executed.result.rows,
				presetId: preset?.id ?? null,
			});
		},
		onSuccess: (chart) => {
			void queryClient.invalidateQueries({ queryKey: ["charts"] });
			toast.success("Gráfico salvo", { description: chart.title });
			void navigate({ to: "/charts/$chartId", params: { chartId: chart.id } });
		},
		onError: (error: ApiError) => toast.error("Falha ao salvar", { description: error.message }),
	});

	function toggleTweak(key: StyleTweakKey) {
		setTweaks((current) => {
			const next = new Set(current);
			if (next.has(key)) next.delete(key);
			else next.add(key);

			return next;
		});
	}

	return (
		<>
			<PageHeader
				title="Construtor"
				description="Escolha métricas e agrupamentos, mapeie as colunas e salve o gráfico com o estilo do design system."
				action={
					<Button
						size="sm"
						disabled={!spec || !result || saveMutation.isPending}
						onClick={() => saveMutation.mutate()}
					>
						<SaveIcon />
						Salvar gráfico
					</Button>
				}
			/>

			<div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-4 py-6 md:px-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="space-y-4">
					<Card>
						<CardContent>
							<QuerySpecForm
								onRun={(querySpec) => runMutation.mutate(querySpec)}
								isPending={runMutation.isPending}
								status={
									result
										? `${result.rowCount} linhas · ${result.durationMs} ms`
										: "Consulta somente leitura sobre o catálogo semântico."
								}
							/>
						</CardContent>
					</Card>

					{spec && result ? (
						<>
							<ChartCard spec={spec} rows={result.rows} optionPatch={optionPatch} height={340} />
							<ResultTable columns={result.columns} rows={result.rows} />
						</>
					) : (
						<Card>
							<CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-sm">
								<DatabaseIcon className="size-5" />
								Execute uma consulta para começar.
							</CardContent>
						</Card>
					)}
				</div>

				<div className="space-y-4">
					{spec && result ? (
						<Card>
							<CardContent className="space-y-4">
								<ChartEditor spec={spec} columns={result.columns} onChange={setSpec} />
								<div className="space-y-2 border-t pt-4">
									<span className="label-mono text-muted-foreground">Estilo</span>
									<StylePanel active={tweaks} onToggle={toggleTweak} />
									<PresetBar
										chartType={spec.chartType}
										activeId={preset?.id ?? null}
										currentPatch={optionPatch}
										onApply={setPreset}
										className="pt-2"
									/>
								</div>
							</CardContent>
						</Card>
					) : null}
				</div>
			</div>
		</>
	);
}

/** Trocar de dataset descarta o mapeamento antigo; mesma forma preserva a edição. */
function sameColumns(spec: ChartSpec, result: QueryResult): boolean {
	const names = new Set(result.columns.map((column) => column.name));
	const referenced = [spec.encoding.x, spec.encoding.value, ...spec.series.map((series) => series.column)];

	return referenced.every((name) => !name || names.has(name));
}
