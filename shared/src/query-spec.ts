import { z } from "zod";
import type { ValueFormat } from "./chart-spec.ts";

/**
 * Camada semântica: quem consulta o banco (IA, builder, MCP) só escolhe chaves
 * deste catálogo. O SQL que cada chave representa vive no compilador da API —
 * nenhum texto vindo de fora vira SQL.
 */

/** Teto de linhas devolvidas por qualquer consulta dinâmica. */
export const MAX_ROWS = 500;

export const ORDER_STATUSES = ["PENDING", "PAID", "SHIPPED", "DELIVERED", "CANCELED", "REFUNDED"] as const;
export const ORDER_CHANNELS = ["WEB", "MOBILE", "MARKETPLACE", "IN_STORE"] as const;

export const METRICS = [
	"receita",
	"pedidos",
	"ticket_medio",
	"unidades",
	"clientes",
	"margem",
	"itens_por_pedido",
	"funil",
] as const;

export type Metric = (typeof METRICS)[number];

export const DIMENSIONS = [
	"mes",
	"semana",
	"dia",
	"regiao",
	"categoria",
	"produto",
	"canal",
	"status",
	"cliente",
] as const;

export type Dimension = (typeof DIMENSIONS)[number];

export const PERIODS = ["7d", "30d", "90d", "12m", "ytd", "all", "custom"] as const;

export type Period = (typeof PERIODS)[number];

export const SORT_KEYS = [...METRICS, ...DIMENSIONS] as const;

export const METRIC_INFO: Record<Metric, { label: string; description: string; format: ValueFormat }> = {
	receita: {
		label: "Receita",
		description: "Soma de quantidade × preço unitário − desconto dos itens.",
		format: "currency",
	},
	pedidos: { label: "Pedidos", description: "Quantidade de pedidos distintos.", format: "number" },
	ticket_medio: {
		label: "Ticket médio",
		description: "Receita dividida pelo número de pedidos.",
		format: "currency",
	},
	unidades: { label: "Unidades", description: "Soma das quantidades vendidas.", format: "number" },
	clientes: { label: "Clientes", description: "Clientes distintos que fizeram pedido.", format: "number" },
	margem: {
		label: "Margem",
		description: "Receita menos o custo dos produtos vendidos.",
		format: "currency",
	},
	itens_por_pedido: {
		label: "Itens por pedido",
		description: "Unidades divididas por pedidos.",
		format: "number",
	},
	funil: {
		label: "Funil de pedidos",
		description:
			"Pedidos que chegaram a cada etapa (criado, pago, enviado, entregue). Sempre sozinho, sem agrupamento.",
		format: "number",
	},
};

export const DIMENSION_INFO: Record<Dimension, { label: string; description: string; time: boolean }> = {
	mes: { label: "Mês", description: "Mês do pedido (YYYY-MM).", time: true },
	semana: { label: "Semana", description: "Semana do pedido, pela segunda-feira (YYYY-MM-DD).", time: true },
	dia: { label: "Dia", description: "Dia do pedido (YYYY-MM-DD).", time: true },
	regiao: { label: "Região", description: "Região de entrega do pedido.", time: false },
	categoria: { label: "Categoria", description: "Categoria do produto.", time: false },
	produto: { label: "Produto", description: "Nome do produto.", time: false },
	canal: { label: "Canal", description: "Canal de venda.", time: false },
	status: { label: "Status", description: "Status atual do pedido.", time: false },
	cliente: { label: "Cliente", description: "Nome do cliente.", time: false },
};

export const PERIOD_LABELS: Record<Period, string> = {
	"7d": "últimos 7 dias",
	"30d": "últimos 30 dias",
	"90d": "últimos 90 dias",
	"12m": "últimos 12 meses",
	ytd: "este ano",
	all: "todo o período",
	custom: "período personalizado",
};

const filterValues = z.array(z.string().trim().min(1).max(80)).max(20);

export const queryFiltersSchema = z.object({
	status: z.array(z.enum(ORDER_STATUSES)).max(ORDER_STATUSES.length).optional(),
	canal: z.array(z.enum(ORDER_CHANNELS)).max(ORDER_CHANNELS.length).optional(),
	/** Nomes exatos (sem diferenciar maiúsculas). */
	regiao: filterValues.optional(),
	categoria: filterValues.optional(),
	/** Trecho do nome do produto. */
	produto: filterValues.optional(),
});

export const querySpecSchema = z
	.object({
		metrics: z.array(z.enum(METRICS)).min(1).max(3),
		groupBy: z.array(z.enum(DIMENSIONS)).max(2).default([]),
		filters: queryFiltersSchema.default({}),
		period: z.enum(PERIODS).default("12m"),
		dateFrom: z.iso.date().optional(),
		dateTo: z.iso.date().optional(),
		/** Por padrão pedidos cancelados/estornados ficam de fora. Filtro de status explícito ignora isto. */
		includeCanceled: z.boolean().default(false),
		orderBy: z.object({ by: z.enum(SORT_KEYS), dir: z.enum(["asc", "desc"]) }).optional(),
		limit: z.number().int().min(1).max(MAX_ROWS).default(100),
	})
	.superRefine((spec, ctx) => {
		if (new Set(spec.metrics).size !== spec.metrics.length) {
			ctx.addIssue({ code: "custom", path: ["metrics"], message: "Métrica repetida." });
		}

		if (new Set(spec.groupBy).size !== spec.groupBy.length) {
			ctx.addIssue({ code: "custom", path: ["groupBy"], message: "Agrupamento repetido." });
		}

		if (spec.metrics.includes("funil") && (spec.metrics.length > 1 || spec.groupBy.length > 0)) {
			ctx.addIssue({
				code: "custom",
				path: ["metrics"],
				message: "O funil não combina com outras métricas nem com agrupamento.",
			});
		}

		if (spec.period === "custom") {
			if (!spec.dateFrom || !spec.dateTo) {
				ctx.addIssue({
					code: "custom",
					path: ["dateFrom"],
					message: "Período personalizado exige início e fim.",
				});
			} else if (spec.dateFrom > spec.dateTo) {
				ctx.addIssue({ code: "custom", path: ["dateTo"], message: "O fim vem antes do início." });
			}
		}

		const by = spec.orderBy?.by;

		if (by && !(spec.metrics as string[]).includes(by) && !(spec.groupBy as string[]).includes(by)) {
			ctx.addIssue({
				code: "custom",
				path: ["orderBy", "by"],
				message: "Só dá para ordenar por uma métrica ou agrupamento da consulta.",
			});
		}
	});

export type QuerySpec = z.infer<typeof querySpecSchema>;
export type QuerySpecInput = z.input<typeof querySpecSchema>;
export type QueryFilters = z.infer<typeof queryFiltersSchema>;

/** O que o builder e o MCP mostram para quem vai montar a consulta. */
export type SemanticCatalog = {
	metrics: Array<{ key: Metric; label: string; description: string; format: ValueFormat }>;
	dimensions: Array<{ key: Dimension; label: string; description: string; time: boolean }>;
	periods: Array<{ key: Period; label: string }>;
	filterValues: {
		status: readonly string[];
		canal: readonly string[];
		regiao: string[];
		categoria: string[];
	};
};

/** Resumo legível do spec: "Receita", "por Mês", "últimos 12 meses"... */
export function describeQuerySpec(spec: QuerySpec): string[] {
	const parts = [spec.metrics.map((metric) => METRIC_INFO[metric].label).join(", ")];

	if (spec.groupBy.length > 0) {
		parts.push(`por ${spec.groupBy.map((dimension) => DIMENSION_INFO[dimension].label).join(" e ")}`);
	}

	parts.push(spec.period === "custom" ? `${spec.dateFrom} a ${spec.dateTo}` : PERIOD_LABELS[spec.period]);

	for (const [key, values] of Object.entries(spec.filters)) {
		if (values && values.length > 0) parts.push(`${key}: ${values.join(", ")}`);
	}

	if (spec.includeCanceled) parts.push("inclui cancelados");
	if (spec.orderBy) parts.push(`ordem: ${spec.orderBy.by} ${spec.orderBy.dir}`);

	parts.push(`até ${spec.limit} linhas`);

	return parts;
}
