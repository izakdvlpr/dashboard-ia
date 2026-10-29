import type { Dimension, Metric, QuerySpec, QuerySpecInput } from "@dashboard-ia/shared";
import {
	DIMENSION_INFO,
	DIMENSIONS,
	MAX_ROWS,
	METRIC_INFO,
	METRICS,
	ORDER_CHANNELS,
	ORDER_STATUSES,
	PERIOD_LABELS,
	PERIODS,
	querySpecSchema,
} from "@dashboard-ia/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { PlayIcon, XIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { schemaApi } from "@/lib/api.ts";
import { Button } from "../ui/button.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select.tsx";
import { Field } from "./chart-editor.tsx";

export const DEFAULT_QUERY_SPEC: QuerySpecInput = {
	metrics: ["receita"],
	groupBy: ["mes"],
	period: "12m",
	limit: 24,
};

const STATUS_LABEL: Record<(typeof ORDER_STATUSES)[number], string> = {
	PENDING: "Pendente",
	PAID: "Pago",
	SHIPPED: "Enviado",
	DELIVERED: "Entregue",
	CANCELED: "Cancelado",
	REFUNDED: "Estornado",
};

const CHANNEL_LABEL: Record<(typeof ORDER_CHANNELS)[number], string> = {
	WEB: "Web",
	MOBILE: "Mobile",
	MARKETPLACE: "Marketplace",
	IN_STORE: "Loja física",
};

const AUTO_ORDER = "auto";

const inputClass =
	"border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]";

type QuerySpecFormProps = {
	defaultValues?: QuerySpecInput;
	onRun: (spec: QuerySpec) => void;
	isPending: boolean;
	/** Linha de status ao lado do botão (linhas, tempo...). */
	status?: ReactNode;
};

/** Monta o QuerySpec por escolha de catálogo — o mesmo contrato que a IA e o MCP usam. */
export function QuerySpecForm({
	defaultValues = DEFAULT_QUERY_SPEC,
	onRun,
	isPending,
	status,
}: QuerySpecFormProps) {
	const catalog = useQuery({
		queryKey: ["schema"],
		queryFn: schemaApi.catalog,
		staleTime: Number.POSITIVE_INFINITY,
	});

	const form = useForm<QuerySpecInput, unknown, QuerySpec>({
		resolver: zodResolver(querySpecSchema),
		defaultValues,
	});

	const metrics = form.watch("metrics");
	const groupBy = form.watch("groupBy") ?? [];
	const period = form.watch("period");
	const orderBy = form.watch("orderBy");
	const isFunnel = metrics.includes("funil");

	/** Tirar a métrica/dimensão da consulta solta a ordenação que dependia dela. */
	function dropStaleOrder(nextMetrics: readonly string[], nextGroupBy: readonly string[]) {
		const by = form.getValues("orderBy")?.by;

		if (by && !nextMetrics.includes(by) && !nextGroupBy.includes(by)) form.setValue("orderBy", undefined);
	}

	function toggleMetric(metric: Metric) {
		let next: Metric[];

		if (metric === "funil") next = isFunnel ? ["receita"] : ["funil"];
		else if (metrics.includes(metric)) next = metrics.filter((item) => item !== metric);
		else next = [...metrics.filter((item) => item !== "funil"), metric];

		const nextGroupBy = next.includes("funil") ? [] : groupBy;

		form.setValue("metrics", next, { shouldValidate: form.formState.isSubmitted });
		form.setValue("groupBy", nextGroupBy);
		dropStaleOrder(next, nextGroupBy);
	}

	function toggleDimension(dimension: Dimension) {
		const next = groupBy.includes(dimension)
			? groupBy.filter((item) => item !== dimension)
			: [...groupBy, dimension];

		form.setValue("groupBy", next, { shouldValidate: form.formState.isSubmitted });
		dropStaleOrder(metrics, next);
	}

	const sortOptions = [...metrics, ...groupBy];
	const errors = collectErrors(form.formState.errors);

	return (
		<form className="space-y-4" onSubmit={form.handleSubmit(onRun)}>
			<Field label="Métricas (até 3)">
				<div className="flex flex-wrap gap-1">
					{METRICS.map((metric) => {
						const active = metrics.includes(metric);

						return (
							<Button
								key={metric}
								type="button"
								size="sm"
								variant={active ? "default" : "outline"}
								aria-pressed={active}
								title={METRIC_INFO[metric].description}
								disabled={!active && metric !== "funil" && metrics.length >= 3 && !isFunnel}
								onClick={() => toggleMetric(metric)}
							>
								{METRIC_INFO[metric].label}
							</Button>
						);
					})}
				</div>
			</Field>

			<Field label="Agrupar por (até 2)">
				<div className="flex flex-wrap gap-1">
					{DIMENSIONS.map((dimension) => {
						const active = groupBy.includes(dimension);

						return (
							<Button
								key={dimension}
								type="button"
								size="sm"
								variant={active ? "default" : "outline"}
								aria-pressed={active}
								title={DIMENSION_INFO[dimension].description}
								disabled={isFunnel || (!active && groupBy.length >= 2)}
								onClick={() => toggleDimension(dimension)}
							>
								{DIMENSION_INFO[dimension].label}
							</Button>
						);
					})}
				</div>
			</Field>

			<div className="grid gap-4 sm:grid-cols-3">
				<Field label="Período">
					<Controller
						control={form.control}
						name="period"
						render={({ field }) => (
							<Select value={field.value} onValueChange={field.onChange}>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PERIODS.map((key) => (
										<SelectItem key={key} value={key}>
											{PERIOD_LABELS[key]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					/>
				</Field>
				{period === "custom" ? (
					<>
						<Field label="De">
							<Controller
								control={form.control}
								name="dateFrom"
								render={({ field }) => (
									<input
										type="date"
										value={field.value ?? ""}
										onChange={(event) => field.onChange(event.target.value || undefined)}
										className={inputClass}
									/>
								)}
							/>
						</Field>
						<Field label="Até">
							<Controller
								control={form.control}
								name="dateTo"
								render={({ field }) => (
									<input
										type="date"
										value={field.value ?? ""}
										onChange={(event) => field.onChange(event.target.value || undefined)}
										className={inputClass}
									/>
								)}
							/>
						</Field>
					</>
				) : null}
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Status">
					<Controller
						control={form.control}
						name="filters.status"
						render={({ field }) => (
							<MultiPick
								options={ORDER_STATUSES}
								labels={STATUS_LABEL}
								value={field.value ?? []}
								onChange={(next) => field.onChange(next.length > 0 ? next : undefined)}
								placeholder="Todos (exceto cancelados)"
							/>
						)}
					/>
				</Field>
				<Field label="Canal">
					<Controller
						control={form.control}
						name="filters.canal"
						render={({ field }) => (
							<MultiPick
								options={ORDER_CHANNELS}
								labels={CHANNEL_LABEL}
								value={field.value ?? []}
								onChange={(next) => field.onChange(next.length > 0 ? next : undefined)}
								placeholder="Todos"
							/>
						)}
					/>
				</Field>
				<Field label="Região">
					<Controller
						control={form.control}
						name="filters.regiao"
						render={({ field }) => (
							<MultiPick
								options={catalog.data?.filterValues.regiao ?? []}
								value={field.value ?? []}
								onChange={(next) => field.onChange(next.length > 0 ? next : undefined)}
								placeholder={catalog.isLoading ? "Carregando…" : "Todas"}
							/>
						)}
					/>
				</Field>
				<Field label="Categoria">
					<Controller
						control={form.control}
						name="filters.categoria"
						render={({ field }) => (
							<MultiPick
								options={catalog.data?.filterValues.categoria ?? []}
								value={field.value ?? []}
								onChange={(next) => field.onChange(next.length > 0 ? next : undefined)}
								placeholder={catalog.isLoading ? "Carregando…" : "Todas"}
							/>
						)}
					/>
				</Field>
			</div>

			<Field label="Produto contém">
				<Controller
					control={form.control}
					name="filters.produto"
					render={({ field }) => <TermsInput value={field.value ?? []} onChange={field.onChange} />}
				/>
			</Field>

			<div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_7rem]">
				<Field label="Ordenar por">
					<Select
						value={orderBy?.by ?? AUTO_ORDER}
						onValueChange={(by) =>
							form.setValue(
								"orderBy",
								by === AUTO_ORDER
									? undefined
									: { by: by as (typeof sortOptions)[number], dir: orderBy?.dir ?? "desc" },
							)
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={AUTO_ORDER}>Automático</SelectItem>
							{sortOptions.map((key) => (
								<SelectItem key={key} value={key}>
									{key in METRIC_INFO
										? METRIC_INFO[key as Metric].label
										: DIMENSION_INFO[key as Dimension].label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
				<Field label="Direção">
					<div className="flex gap-1">
						{(["asc", "desc"] as const).map((dir) => (
							<Button
								key={dir}
								type="button"
								size="sm"
								className="h-9"
								variant={orderBy?.dir === dir ? "default" : "outline"}
								aria-pressed={orderBy?.dir === dir}
								disabled={!orderBy}
								onClick={() => orderBy && form.setValue("orderBy", { ...orderBy, dir })}
							>
								{dir === "asc" ? "Crescente" : "Decrescente"}
							</Button>
						))}
					</div>
				</Field>
				<Field label="Limite">
					<input
						type="number"
						min={1}
						max={MAX_ROWS}
						{...form.register("limit", { valueAsNumber: true })}
						className={inputClass}
					/>
				</Field>
			</div>

			<Controller
				control={form.control}
				name="includeCanceled"
				render={({ field }) => (
					<Button
						type="button"
						size="sm"
						variant={field.value ? "default" : "outline"}
						aria-pressed={Boolean(field.value)}
						onClick={() => field.onChange(!field.value)}
					>
						Incluir cancelados e estornados
					</Button>
				)}
			/>

			{errors.length > 0 ? (
				<ul className="text-destructive space-y-0.5 text-xs" role="alert">
					{errors.map((message) => (
						<li key={message}>{message}</li>
					))}
				</ul>
			) : null}

			<div className="flex items-center gap-2 border-t pt-4">
				<Button size="sm" type="submit" disabled={isPending}>
					<PlayIcon />
					Executar
				</Button>
				{status ? (
					<span className="text-muted-foreground font-mono text-xs tabular-nums">{status}</span>
				) : null}
			</div>
		</form>
	);
}

/** Select que acumula valores em chips — cabe 27 regiões sem virar parede de botões. */
function MultiPick<T extends string>({
	options,
	labels,
	value,
	onChange,
	placeholder,
}: {
	options: readonly T[];
	labels?: Record<T, string>;
	value: readonly T[];
	onChange: (next: T[]) => void;
	placeholder: string;
}) {
	const remaining = options.filter((option) => !value.includes(option));
	const label = (option: T) => labels?.[option] ?? option;

	return (
		<div className="space-y-1.5">
			<Select
				value=""
				onValueChange={(option) => onChange([...value, option as T])}
				disabled={remaining.length === 0}
			>
				<SelectTrigger className="w-full">
					<SelectValue placeholder={value.length > 0 ? "Adicionar…" : placeholder} />
				</SelectTrigger>
				<SelectContent>
					{remaining.map((option) => (
						<SelectItem key={option} value={option}>
							{label(option)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{value.length > 0 ? (
				<div className="flex flex-wrap gap-1">
					{value.map((option) => (
						<Button
							key={option}
							type="button"
							size="sm"
							variant="secondary"
							className="h-6 px-2 text-xs"
							aria-label={`Remover ${label(option)}`}
							onClick={() => onChange(value.filter((item) => item !== option))}
						>
							{label(option)}
							<XIcon />
						</Button>
					))}
				</div>
			) : null}
		</div>
	);
}

/** Texto livre separado por vírgula; só vira array ao sair do campo para não comer a vírgula digitada. */
function TermsInput({
	value,
	onChange,
}: {
	value: string[];
	onChange: (next: string[] | undefined) => void;
}) {
	const [text, setText] = useState(value.join(", "));

	return (
		<input
			value={text}
			onChange={(event) => setText(event.target.value)}
			onBlur={() => {
				const terms = text
					.split(",")
					.map((term) => term.trim())
					.filter(Boolean);

				setText(terms.join(", "));
				onChange(terms.length > 0 ? terms : undefined);
			}}
			placeholder="ex.: fone, notebook"
			className={inputClass}
		/>
	);
}

/** O zod do superRefine aponta para caminhos aninhados; aqui só interessa a lista de mensagens. */
function collectErrors(node: unknown): string[] {
	if (!node || typeof node !== "object") return [];

	const messages: string[] = [];

	if ("message" in node && typeof node.message === "string" && node.message) messages.push(node.message);

	for (const [key, child] of Object.entries(node)) {
		if (key !== "ref" && key !== "message" && key !== "type") messages.push(...collectErrors(child));
	}

	return [...new Set(messages)];
}
