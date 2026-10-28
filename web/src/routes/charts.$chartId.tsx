import type { ChartSpec, Preset } from "@dashboard-ia/shared";
import { mergeOption } from "@dashboard-ia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	ArrowLeftIcon,
	LayoutDashboardIcon,
	PlayIcon,
	RefreshCwIcon,
	SaveIcon,
	SparklesIcon,
	Trash2Icon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChartCard } from "@/components/charts/chart-card.tsx";
import { ChartEditor, Field } from "@/components/charts/chart-editor.tsx";
import { PresetBar } from "@/components/charts/preset-bar.tsx";
import { StylePanel, type StyleTweakKey, tweaksToPatch } from "@/components/charts/style-panel.tsx";
import { ResultTable } from "@/components/chat/result-table.tsx";
import { PageHeader } from "@/components/layout/app-shell.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { type ApiError, type ChartDto, chartsApi, presetsApi, queryApi } from "@/lib/api.ts";

export const Route = createFileRoute("/charts/$chartId")({ component: ChartDetail });

function ChartDetail() {
	const { chartId } = Route.useParams();
	const chart = useQuery({ queryKey: ["charts", chartId], queryFn: () => chartsApi.get(chartId) });

	if (chart.isLoading) {
		return (
			<>
				<PageHeader title="Gráfico" />
				<div className="space-y-5 px-4 py-6 md:px-8">
					<Skeleton className="h-96" />
					<Skeleton className="h-40" />
				</div>
			</>
		);
	}

	if (chart.isError || !chart.data) {
		return (
			<>
				<PageHeader title="Gráfico" />
				<Card className="m-6">
					<CardContent className="text-muted-foreground py-12 text-center text-sm">
						{(chart.error as ApiError | null)?.message ?? "Gráfico não encontrado."}
					</CardContent>
				</Card>
			</>
		);
	}

	// key: trocar de gráfico recomeça a edição do zero
	return <ChartWorkspace key={chart.data.id} chart={chart.data} />;
}

function ChartWorkspace({ chart }: { chart: ChartDto }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const [spec, setSpec] = useState<ChartSpec>(chart.chartSpec);
	const [preset, setPreset] = useState<Preset | null>(null);
	const [tweaks, setTweaks] = useState<ReadonlySet<StyleTweakKey>>(new Set());
	const [description, setDescription] = useState(chart.description ?? "");
	const [sql, setSql] = useState(chart.sqlQuery ?? "");
	const [isPinned, setIsPinned] = useState(chart.isPinned);
	const [layoutSpan, setLayoutSpan] = useState(chart.layoutSpan);
	// Dataset local: executar o SQL troca o preview antes de salvar.
	const [dataset, setDataset] = useState({ columns: chart.columns, rows: chart.rows });
	const [datasetDirty, setDatasetDirty] = useState(false);

	const presets = useQuery({
		queryKey: ["presets", spec.chartType],
		queryFn: () => presetsApi.list(spec.chartType),
	});

	// O preset salvo no gráfico só existe como id; resolve assim que a lista chega.
	useEffect(() => {
		if (preset || !chart.presetId) return;

		const found = presets.data?.presets.find((item) => item.id === chart.presetId);
		if (found) setPreset(found);
	}, [preset, chart.presetId, presets.data]);

	const optionPatch = useMemo(
		() => mergeOption(preset?.optionPatch ?? {}, tweaksToPatch(tweaks)),
		[preset, tweaks],
	);

	const dirty =
		spec !== chart.chartSpec ||
		(preset?.id ?? null) !== chart.presetId ||
		description !== (chart.description ?? "") ||
		sql !== (chart.sqlQuery ?? "") ||
		isPinned !== chart.isPinned ||
		layoutSpan !== chart.layoutSpan ||
		datasetDirty;

	function adopt(updated: ChartDto) {
		queryClient.setQueryData(["charts", chart.id], updated);
		void queryClient.invalidateQueries({ queryKey: ["charts"] });
		setSql(updated.sqlQuery ?? "");
		setDataset({ columns: updated.columns, rows: updated.rows });
		setDatasetDirty(false);
	}

	const runMutation = useMutation({
		mutationFn: () => chartsApi.run(chart.id),
		onSuccess: (updated) => {
			adopt(updated);
			toast.success("Dados atualizados", { description: `${updated.rows.length} linhas do banco.` });
		},
		onError: (error: ApiError) => toast.error("Falha ao reexecutar", { description: error.message }),
	});

	/** Testa o SQL editado pelos mesmos guardrails do construtor, sem gravar nada. */
	const sqlMutation = useMutation({
		mutationFn: () => queryApi.run(sql),
		onSuccess: (result) => {
			setDataset({ columns: result.columns, rows: result.rows });
			setDatasetDirty(true);
			toast.success("Consulta executada", {
				description: `${result.rows.length} linhas. Salve para gravar.`,
			});
		},
		onError: (error: ApiError) => toast.error("Consulta rejeitada", { description: error.message }),
	});

	const saveMutation = useMutation({
		mutationFn: () =>
			chartsApi.update(chart.id, {
				// `spec.title` é o nome do gráfico — sem enviar aqui, a galeria fica com o nome antigo.
				title: spec.title,
				description: description.trim() || null,
				chartSpec: spec,
				presetId: preset?.id ?? null,
				sqlQuery: sql.trim() || null,
				columns: dataset.columns,
				rows: dataset.rows,
				isPinned,
				layoutSpan,
			}),
		onSuccess: (updated) => {
			adopt(updated);
			toast.success("Alterações salvas");
		},
		onError: (error: ApiError) => toast.error("Falha ao salvar", { description: error.message }),
	});

	const removeMutation = useMutation({
		mutationFn: () => chartsApi.remove(chart.id),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["charts"] });
			toast.success("Gráfico excluído");
			void navigate({ to: "/charts" });
		},
		onError: (error: ApiError) => toast.error("Falha ao excluir", { description: error.message }),
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
				title={spec.title}
				description={description || undefined}
				action={
					<div className="flex items-center gap-2">
						<Badge variant={chart.source === "AI" ? "default" : "secondary"}>
							{chart.source === "AI" ? <SparklesIcon /> : null}
							{chart.source === "AI" ? "IA" : "Manual"}
						</Badge>
						<Button asChild size="sm" variant="ghost">
							<Link to="/charts">
								<ArrowLeftIcon />
								Voltar
							</Link>
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={!chart.sqlQuery || runMutation.isPending}
							onClick={() => runMutation.mutate()}
						>
							<RefreshCwIcon className={runMutation.isPending ? "animate-spin" : undefined} />
							Atualizar dados
						</Button>
						<Button
							size="sm"
							disabled={!dirty || saveMutation.isPending}
							onClick={() => saveMutation.mutate()}
						>
							<SaveIcon />
							Salvar
						</Button>
						<Button
							size="sm"
							variant="ghost"
							aria-label="Excluir"
							onClick={() => removeMutation.mutate()}
							disabled={removeMutation.isPending}
						>
							<Trash2Icon />
						</Button>
					</div>
				}
			/>

			<div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-4 py-6 md:px-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="space-y-4">
					<ChartCard spec={spec} rows={dataset.rows} optionPatch={optionPatch} height={420} />

					<Card>
						<CardContent className="space-y-2">
							<div className="flex items-center justify-between">
								<span className="label-mono text-muted-foreground">Consulta SQL</span>
								<Button
									size="sm"
									variant="outline"
									disabled={!sql.trim() || sqlMutation.isPending}
									onClick={() => sqlMutation.mutate()}
								>
									<PlayIcon />
									Executar
								</Button>
							</div>
							<textarea
								value={sql}
								onChange={(event) => setSql(event.target.value)}
								spellCheck={false}
								rows={8}
								placeholder="SELECT ... — somente leitura, passa pelos guardrails."
								className="border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent p-3 font-mono text-xs outline-none focus-visible:ring-[3px]"
							/>
							{datasetDirty ? (
								<p className="text-muted-foreground text-xs">
									Preview com os dados da última execução. Salve para gravar.
								</p>
							) : null}
						</CardContent>
					</Card>

					<ResultTable columns={dataset.columns} rows={dataset.rows} />

					<p className="text-muted-foreground font-mono text-xs tabular-nums">
						{dataset.rows.length} linhas · criado em {formatStamp(chart.createdAt)}
						{chart.datasetCacheAt ? ` · dados de ${formatStamp(chart.datasetCacheAt)}` : ""}
					</p>
				</div>

				<Card>
					<CardContent className="space-y-4">
						<ChartEditor spec={spec} columns={dataset.columns} onChange={setSpec} />

						<div className="space-y-4 border-t pt-4">
							<Field label="Descrição">
								<textarea
									value={description}
									onChange={(event) => setDescription(event.target.value)}
									rows={2}
									placeholder="Aparece na galeria e na visão geral."
									className="border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
								/>
							</Field>

							<Field label="Visão geral">
								<div className="flex flex-wrap gap-1">
									<Button
										size="sm"
										variant={isPinned ? "default" : "outline"}
										onClick={() => setIsPinned((current) => !current)}
									>
										<LayoutDashboardIcon />
										{isPinned ? "Visível" : "Mostrar"}
									</Button>
									<Button
										size="sm"
										variant={layoutSpan === 2 ? "default" : "outline"}
										disabled={!isPinned}
										onClick={() => setLayoutSpan((current) => (current === 2 ? 1 : 2))}
									>
										{layoutSpan === 2 ? "Linha inteira" : "Meia linha"}
									</Button>
								</div>
							</Field>
						</div>

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
			</div>
		</>
	);
}

const STAMP = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function formatStamp(iso: string): string {
	return STAMP.format(new Date(iso));
}
