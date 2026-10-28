import type { ChartColumn, ChartSpec, ChartType, ColorToken, ValueFormat } from "@dashboard-ia/shared";
import { CHART_TYPES, COLOR_TOKENS, VALUE_FORMATS } from "@dashboard-ia/shared";
import { PlusIcon, XIcon } from "lucide-react";
import { resolveToken } from "@/lib/echarts-theme.ts";
import { cn } from "@/lib/utils.ts";
import { Button } from "../ui/button.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select.tsx";

const TYPE_LABEL: Record<ChartType, string> = {
	line: "Linha",
	area: "Área",
	bar: "Barra",
	pie: "Pizza",
	scatter: "Dispersão",
	funnel: "Funil",
};

const FORMAT_LABEL: Record<ValueFormat, string> = {
	number: "Número",
	currency: "Moeda",
	percent: "Percentual",
	compact: "Compacto",
};

const TOGGLES = [
	{ key: "legend", label: "Legenda" },
	{ key: "grid", label: "Grade" },
	{ key: "smooth", label: "Suavizar" },
	{ key: "horizontal", label: "Horizontal" },
	{ key: "dataLabels", label: "Rótulos" },
	{ key: "donut", label: "Donut" },
] as const;

/** pie/funnel mapeiam categoria+valor; os demais mapeiam eixo X + N séries. */
function isCategorical(type: ChartType): boolean {
	return type === "pie" || type === "funnel";
}

type ChartEditorProps = {
	spec: ChartSpec;
	columns: ChartColumn[];
	onChange: (spec: ChartSpec) => void;
	className?: string;
};

export function ChartEditor({ spec, columns, onChange, className }: ChartEditorProps) {
	const numeric = columns.filter((column) => column.type === "number");
	const categorical = isCategorical(spec.chartType);

	function patch(partial: Partial<ChartSpec>) {
		onChange({ ...spec, ...partial });
	}

	function setEncoding(key: keyof ChartSpec["encoding"], value: string) {
		patch({ encoding: { ...spec.encoding, [key]: value } });
	}

	function setSeries(index: number, partial: Partial<ChartSpec["series"][number]>) {
		patch({
			series: spec.series.map((series, position) =>
				position === index ? { ...series, ...partial } : series,
			),
		});
	}

	function addSeries() {
		const used = new Set(spec.series.map((series) => series.column));
		const next = numeric.find((column) => !used.has(column.name)) ?? numeric[0];

		if (!next) return;

		patch({
			series: [
				...spec.series,
				{
					column: next.name,
					label: next.name,
					colorToken: COLOR_TOKENS[spec.series.length % COLOR_TOKENS.length] as ColorToken,
				},
			],
		});
	}

	return (
		<div className={cn("space-y-4 text-sm", className)}>
			<Field label="Título">
				<input
					value={spec.title}
					onChange={(event) => patch({ title: event.target.value })}
					className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]"
				/>
			</Field>

			<Field label="Tipo">
				<div className="flex flex-wrap gap-1">
					{CHART_TYPES.map((type) => (
						<Button
							key={type}
							size="sm"
							variant={spec.chartType === type ? "default" : "outline"}
							onClick={() => patch({ chartType: type })}
						>
							{TYPE_LABEL[type]}
						</Button>
					))}
				</div>
			</Field>

			{categorical ? (
				<div className="grid grid-cols-2 gap-3">
					<Field label="Categoria">
						<ColumnSelect
							columns={columns}
							value={spec.encoding.category ?? spec.encoding.x ?? ""}
							onChange={(value) => setEncoding("category", value)}
						/>
					</Field>
					<Field label="Valor">
						<ColumnSelect
							columns={numeric}
							value={spec.encoding.value ?? spec.series[0]?.column ?? ""}
							onChange={(value) => {
								onChange({
									...spec,
									encoding: { ...spec.encoding, value },
									series: [{ ...(spec.series[0] ?? fallbackSeries(value)), column: value }],
								});
							}}
						/>
					</Field>
				</div>
			) : (
				<Field label="Eixo X">
					<ColumnSelect
						columns={columns}
						value={spec.encoding.x ?? ""}
						onChange={(value) => setEncoding("x", value)}
					/>
				</Field>
			)}

			{categorical ? null : (
				<Field
					label="Séries"
					action={
						spec.series.length < 5 && numeric.length > 0 ? (
							<Button size="sm" variant="ghost" className="h-6" onClick={addSeries}>
								<PlusIcon />
								Adicionar
							</Button>
						) : null
					}
				>
					<div className="space-y-2">
						{spec.series.map((series, index) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: a série é editada na posição, não reordenada
							<div key={index} className="flex items-center gap-2">
								<ColumnSelect
									columns={numeric}
									value={series.column}
									onChange={(value) => setSeries(index, { column: value, label: series.label || value })}
									className="flex-1"
								/>
								<input
									value={series.label}
									onChange={(event) => setSeries(index, { label: event.target.value })}
									placeholder="Rótulo"
									className="border-input h-9 w-28 rounded-md border bg-transparent px-2 text-sm outline-none"
								/>
								<div className="flex gap-1">
									{COLOR_TOKENS.map((token) => (
										<button
											key={token}
											type="button"
											aria-label={token}
											onClick={() => setSeries(index, { colorToken: token })}
											className={cn(
												"size-5 rounded-full border-2",
												series.colorToken === token ? "border-foreground" : "border-transparent",
											)}
											style={{ background: resolveToken(token) }}
										/>
									))}
								</div>
								{spec.series.length > 1 ? (
									<Button
										size="icon"
										variant="ghost"
										aria-label="Remover série"
										onClick={() => patch({ series: spec.series.filter((_, position) => position !== index) })}
									>
										<XIcon />
									</Button>
								) : null}
							</div>
						))}
					</div>
				</Field>
			)}

			<Field label="Opções">
				<div className="flex flex-wrap gap-1">
					{TOGGLES.map(({ key, label }) => (
						<Button
							key={key}
							size="sm"
							variant={spec.options[key] ? "default" : "outline"}
							aria-pressed={spec.options[key]}
							onClick={() => patch({ options: { ...spec.options, [key]: !spec.options[key] } })}
						>
							{label}
						</Button>
					))}
				</div>
			</Field>

			<Field label="Formato dos valores">
				<Select
					value={spec.options.valueFormat}
					onValueChange={(value) =>
						patch({ options: { ...spec.options, valueFormat: value as ValueFormat } })
					}
				>
					<SelectTrigger className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{VALUE_FORMATS.map((format) => (
							<SelectItem key={format} value={format}>
								{FORMAT_LABEL[format]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
		</div>
	);
}

function fallbackSeries(column: string): ChartSpec["series"][number] {
	return { column, label: column, colorToken: "chart-1" };
}

export function Field({
	label,
	action,
	children,
}: {
	label: string;
	action?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between">
				<span className="text-muted-foreground text-xs font-medium">{label}</span>
				{action}
			</div>
			{children}
		</div>
	);
}

function ColumnSelect({
	columns,
	value,
	onChange,
	className,
}: {
	columns: ChartColumn[];
	value: string;
	onChange: (value: string) => void;
	className?: string;
}) {
	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger className={cn("w-full", className)}>
				<SelectValue placeholder="Escolha a coluna" />
			</SelectTrigger>
			<SelectContent>
				{columns.map((column) => (
					<SelectItem key={column.name} value={column.name}>
						{column.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
