import type { ChartSpec, Preset } from "@dashboard-ia/shared";
import { mergeOption } from "@dashboard-ia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DatabaseIcon, PlayIcon, SaveIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChartCard } from "@/components/charts/chart-card.tsx";
import { ChartEditor } from "@/components/charts/chart-editor.tsx";
import { PresetBar } from "@/components/charts/preset-bar.tsx";
import { StylePanel, type StyleTweakKey, tweaksToPatch } from "@/components/charts/style-panel.tsx";
import { ResultTable } from "@/components/chat/result-table.tsx";
import { PageHeader } from "@/components/layout/app-shell.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { type ApiError, chartsApi, type QueryResult, queryApi, schemaApi } from "@/lib/api.ts";
import { heuristicSpec } from "@/lib/heuristic-spec.ts";

export const Route = createFileRoute("/builder")({ component: BuilderPage });

const STARTER_SQL = `SELECT to_char(date_trunc('month', o."placedAt"), 'YYYY-MM') AS mes,
       SUM(i.quantity * i."unitPrice" - i.discount) AS receita
FROM "Order" o
JOIN "OrderItem" i ON i."orderId" = o.id
WHERE o.status NOT IN ('CANCELED', 'REFUNDED')
GROUP BY 1
ORDER BY 1
LIMIT 24`;

function BuilderPage() {
	const [sql, setSql] = useState(STARTER_SQL);
	const [result, setResult] = useState<QueryResult | null>(null);
	const [spec, setSpec] = useState<ChartSpec | null>(null);
	const [preset, setPreset] = useState<Preset | null>(null);
	const [tweaks, setTweaks] = useState<ReadonlySet<StyleTweakKey>>(new Set());

	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const catalog = useQuery({ queryKey: ["schema"], queryFn: schemaApi.catalog });

	const optionPatch = useMemo(
		() => mergeOption(preset?.optionPatch ?? {}, tweaksToPatch(tweaks)),
		[preset, tweaks],
	);

	const runMutation = useMutation({
		mutationFn: () => queryApi.run(sql),
		onSuccess: (data) => {
			setResult(data);
			setSpec((current) =>
				current && sameColumns(current, data) ? current : heuristicSpec(data.columns, "Novo gráfico"),
			);
		},
		onError: (error: ApiError) => toast.error("Consulta rejeitada", { description: error.message }),
	});

	const saveMutation = useMutation({
		mutationFn: () => {
			if (!spec || !result) throw new Error("Nada para salvar.");

			return chartsApi.create({
				title: spec.title,
				source: "MANUAL",
				sqlQuery: result.sql,
				chartSpec: spec,
				columns: result.columns,
				rows: result.rows,
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
				description="Escreva o SELECT, mapeie as colunas e salve o gráfico com o estilo do design system."
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
						<CardContent className="space-y-3">
							<textarea
								value={sql}
								onChange={(event) => setSql(event.target.value)}
								spellCheck={false}
								rows={9}
								className="border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent p-3 font-mono text-xs outline-none focus-visible:ring-[3px]"
							/>
							<div className="flex items-center gap-2">
								<Button size="sm" onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
									<PlayIcon />
									Executar
								</Button>
								<span className="text-muted-foreground font-mono text-xs tabular-nums">
									{result
										? `${result.rowCount} linhas · ${result.durationMs} ms`
										: "Somente SELECT nas tabelas do e-commerce."}
								</span>
							</div>
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

					<Card>
						<CardContent className="space-y-3">
							<span className="label-mono text-muted-foreground">Tabelas disponíveis</span>
							<div className="space-y-2 font-mono text-xs">
								{catalog.data?.tables.map((table) => (
									<details key={table.name}>
										<summary className="cursor-pointer font-medium">{table.name}</summary>
										<ul className="text-muted-foreground mt-1 space-y-0.5 pl-3">
											{table.columns.map((column) => (
												<li key={column.name}>
													{column.name} <span className="opacity-60">{column.type}</span>
												</li>
											))}
										</ul>
									</details>
								))}
							</div>
						</CardContent>
					</Card>
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
