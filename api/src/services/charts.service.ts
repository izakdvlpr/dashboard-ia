import type { ChartColumn, ChartSpec, QueryRow } from "@dashboard-ia/shared";
import { chartRecordSchema, chartSpecSchema } from "@dashboard-ia/shared";
import { z } from "zod";
import type { Prisma } from "@/prisma/generated/client.ts";
import { prisma } from "../db.ts";
import { errors } from "../errors.ts";
import { runGuardedQuery } from "../sql-guardrails/executor.ts";

export const createChartSchema = z.object({
	title: z.string().min(1).max(120),
	description: z.string().max(500).nullable().optional(),
	source: z.enum(["AI", "MANUAL"]).default("MANUAL"),
	sqlQuery: z.string().min(1).max(10_000).nullable().optional(),
	chartSpec: chartSpecSchema,
	columns: z.array(z.object({ name: z.string(), type: z.enum(["string", "number", "date", "boolean"]) })),
	rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
	presetId: z.string().nullable().optional(),
	isPinned: z.boolean().optional(),
	pinnedOrder: z.number().int().nullable().optional(),
	/** 1 = metade da linha na visão geral, 2 = linha inteira */
	layoutSpan: z.number().int().min(1).max(2).optional(),
});

export const updateChartSchema = createChartSchema.partial().omit({ source: true });

export type CreateChartInput = z.infer<typeof createChartSchema>;
export type UpdateChartInput = z.infer<typeof updateChartSchema>;

type ChartRow = {
	id: string;
	title: string;
	description: string | null;
	chartType: string;
	spec: Prisma.JsonValue;
	source: string;
	sqlQuery: string | null;
	presetId: string | null;
	isPinned: boolean;
	pinnedOrder: number | null;
	layoutSpan: number;
	datasetCacheAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

export type ChartDto = {
	id: string;
	title: string;
	description: string | null;
	chartType: string;
	source: string;
	sqlQuery: string | null;
	presetId: string | null;
	isPinned: boolean;
	pinnedOrder: number | null;
	layoutSpan: number;
	chartSpec: ChartSpec;
	columns: ChartColumn[];
	rows: QueryRow[];
	datasetCacheAt: string | null;
	createdAt: string;
	updatedAt: string;
};

/** `spec` é Json no banco; só sai daqui depois de passar pelo zod. */
function toDto(chart: ChartRow): ChartDto {
	const record = chartRecordSchema.parse(chart.spec);

	return {
		id: chart.id,
		title: chart.title,
		description: chart.description,
		chartType: chart.chartType,
		source: chart.source,
		sqlQuery: chart.sqlQuery,
		presetId: chart.presetId,
		isPinned: chart.isPinned,
		pinnedOrder: chart.pinnedOrder,
		layoutSpan: chart.layoutSpan,
		chartSpec: record.chartSpec,
		columns: record.columns,
		rows: record.rows,
		datasetCacheAt: chart.datasetCacheAt?.toISOString() ?? null,
		createdAt: chart.createdAt.toISOString(),
		updatedAt: chart.updatedAt.toISOString(),
	};
}

/** `pinned` filtra os que aparecem na visão geral; no Postgres `asc` já joga NULL para o fim. */
export async function listCharts(options: { pinned?: boolean } = {}): Promise<ChartDto[]> {
	const charts = await prisma.chart.findMany({
		where: options.pinned ? { isPinned: true } : undefined,
		orderBy: [{ isPinned: "desc" }, { pinnedOrder: "asc" }, { updatedAt: "desc" }],
	});

	return charts.map(toDto);
}

/** Próxima posição livre na visão geral. */
async function nextPinnedOrder(): Promise<number> {
	const last = await prisma.chart.aggregate({
		where: { isPinned: true },
		_max: { pinnedOrder: true },
	});

	return (last._max.pinnedOrder ?? -1) + 1;
}

/**
 * Fixar sem posição explícita entra no fim; desafixar libera a posição.
 * Assim a lista nunca tem empate nem buraco entre os índices.
 */
async function resolvePinning(
	isPinned: boolean,
	requested: number | null | undefined,
	current: number | null,
): Promise<number | null> {
	if (!isPinned) return null;
	if (requested !== undefined && requested !== null) return requested;
	if (current !== null) return current;

	return nextPinnedOrder();
}

export async function getChart(id: string): Promise<ChartDto> {
	const chart = await prisma.chart.findUnique({ where: { id } });

	if (!chart) throw errors.notFound("Gráfico");

	return toDto(chart);
}

export async function createChart(input: CreateChartInput): Promise<ChartDto> {
	const isPinned = input.isPinned ?? false;

	const chart = await prisma.chart.create({
		data: {
			title: input.title,
			description: input.description ?? null,
			chartType: input.chartSpec.chartType,
			source: input.source,
			sqlQuery: input.sqlQuery ?? null,
			presetId: input.presetId ?? null,
			isPinned,
			pinnedOrder: await resolvePinning(isPinned, input.pinnedOrder, null),
			layoutSpan: input.layoutSpan ?? 1,
			datasetCacheAt: new Date(),
			spec: { chartSpec: input.chartSpec, columns: input.columns, rows: input.rows },
		},
	});

	return toDto(chart);
}

export async function updateChart(id: string, input: UpdateChartInput): Promise<ChartDto> {
	const current = await getChart(id);

	const chartSpec = input.chartSpec ?? current.chartSpec;
	const columns = input.columns ?? current.columns;
	const rows = input.rows ?? current.rows;
	const isPinned = input.isPinned ?? current.isPinned;

	const chart = await prisma.chart.update({
		where: { id },
		data: {
			title: input.title ?? current.title,
			description: input.description === undefined ? current.description : input.description,
			chartType: chartSpec.chartType,
			sqlQuery: input.sqlQuery === undefined ? current.sqlQuery : input.sqlQuery,
			presetId: input.presetId === undefined ? current.presetId : input.presetId,
			isPinned,
			pinnedOrder: await resolvePinning(isPinned, input.pinnedOrder, current.pinnedOrder),
			layoutSpan: input.layoutSpan ?? current.layoutSpan,
			spec: { chartSpec, columns, rows },
		},
	});

	return toDto(chart);
}

/**
 * Grava a ordem da visão geral de uma vez. A posição é o índice no array —
 * um update parcial deixaria dois cards com o mesmo `pinnedOrder`.
 */
export async function reorderPinned(ids: string[]): Promise<ChartDto[]> {
	const found = await prisma.chart.findMany({ where: { id: { in: ids } }, select: { id: true } });

	if (found.length !== ids.length) throw errors.notFound("Gráfico");

	await prisma.$transaction(
		ids.map((id, index) =>
			prisma.chart.update({ where: { id }, data: { isPinned: true, pinnedOrder: index } }),
		),
	);

	return listCharts({ pinned: true });
}

export async function deleteChart(id: string): Promise<void> {
	await getChart(id);
	await prisma.chart.delete({ where: { id } });
}

/**
 * Reexecuta o SELECT salvo e atualiza o cache de linhas — o que persiste é a
 * consulta, não o dado, então reabrir um gráfico traz números frescos.
 */
export async function runChart(id: string): Promise<ChartDto> {
	const chart = await getChart(id);

	if (!chart.sqlQuery) throw errors.validation("Este gráfico não tem consulta associada.");

	const result = await runGuardedQuery(chart.sqlQuery);

	const updated = await prisma.chart.update({
		where: { id },
		data: {
			sqlQuery: result.sql,
			datasetCacheAt: new Date(),
			spec: { chartSpec: chart.chartSpec, columns: result.columns, rows: result.rows },
		},
	});

	return toDto(updated);
}
