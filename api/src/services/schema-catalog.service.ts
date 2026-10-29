import type { SemanticCatalog } from "@dashboard-ia/shared";
import {
	DIMENSION_INFO,
	DIMENSIONS,
	METRIC_INFO,
	METRICS,
	ORDER_CHANNELS,
	ORDER_STATUSES,
	PERIOD_LABELS,
	PERIODS,
} from "@dashboard-ia/shared";
import { prisma } from "../db.ts";

let cache: SemanticCatalog | null = null;

/**
 * Catálogo semântico: métricas, dimensões e os valores reais dos filtros.
 * Regiões e categorias vêm do banco para o modelo não inventar nome. Cacheado em memória.
 */
export async function getSemanticCatalog(): Promise<SemanticCatalog> {
	if (cache) return cache;

	const [regions, categories] = await Promise.all([
		prisma.region.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
		prisma.category.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
	]);

	cache = {
		metrics: METRICS.map((key) => ({ key, ...METRIC_INFO[key] })),
		dimensions: DIMENSIONS.map((key) => ({ key, ...DIMENSION_INFO[key] })),
		periods: PERIODS.map((key) => ({ key, label: PERIOD_LABELS[key] })),
		filterValues: {
			status: ORDER_STATUSES,
			canal: ORDER_CHANNELS,
			regiao: regions.map((region) => region.name),
			categoria: categories.map((category) => category.name),
		},
	};

	return cache;
}
