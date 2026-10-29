import { Prisma } from "@/prisma/generated/client.ts";
import { prisma } from "../db.ts";
import { REVENUE, VALID_ORDER } from "../semantic/registry.ts";

/**
 * Consultas fixas do dashboard, escritas à mão (não passam pela IA nem pelos
 * guardrails): são rápidas, previsíveis e não precisam de sandbox.
 */

export type DateRange = { from: Date; to: Date };

export function defaultRange(months = 12): DateRange {
	const to = new Date();
	const from = new Date(to.getFullYear(), to.getMonth() - months + 1, 1);

	return { from, to };
}

/** Janela imediatamente anterior, do mesmo tamanho — usada para o delta dos KPIs. */
function previousRange({ from, to }: DateRange): DateRange {
	const span = to.getTime() - from.getTime();

	return { from: new Date(from.getTime() - span), to: new Date(from.getTime()) };
}

function delta(current: number, previous: number): number | null {
	if (previous === 0) return null;

	return Number((((current - previous) / previous) * 100).toFixed(1));
}

type Totals = { revenue: number; orders: number; customers: number };

async function totals({ from, to }: DateRange): Promise<Totals> {
	const [row] = await prisma.$queryRaw<Array<{ revenue: number | null; orders: bigint }>>(Prisma.sql`
		SELECT
			COALESCE(${REVENUE}, 0) AS revenue,
			COUNT(DISTINCT o."id") AS orders
		FROM "Order" o
		JOIN "OrderItem" oi ON oi."orderId" = o."id"
		WHERE ${VALID_ORDER} AND o."placedAt" BETWEEN ${from} AND ${to}
	`);

	const [customerRow] = await prisma.$queryRaw<Array<{ customers: bigint }>>(Prisma.sql`
		SELECT COUNT(*) AS customers
		FROM "Customer" c
		WHERE c."signupDate" BETWEEN ${from} AND ${to}
	`);

	return {
		revenue: row?.revenue ?? 0,
		orders: Number(row?.orders ?? 0),
		customers: Number(customerRow?.customers ?? 0),
	};
}

export async function getOverview(range: DateRange) {
	const [current, previous] = await Promise.all([totals(range), totals(previousRange(range))]);

	const aov = current.orders === 0 ? 0 : current.revenue / current.orders;
	const previousAov = previous.orders === 0 ? 0 : previous.revenue / previous.orders;

	return {
		range: { from: range.from.toISOString(), to: range.to.toISOString() },
		kpis: [
			{
				key: "revenue",
				label: "Receita",
				value: Number(current.revenue.toFixed(2)),
				format: "currency" as const,
				delta: delta(current.revenue, previous.revenue),
			},
			{
				key: "orders",
				label: "Pedidos",
				value: current.orders,
				format: "number" as const,
				delta: delta(current.orders, previous.orders),
			},
			{
				key: "aov",
				label: "Ticket médio",
				value: Number(aov.toFixed(2)),
				format: "currency" as const,
				delta: delta(aov, previousAov),
			},
			{
				key: "customers",
				label: "Novos clientes",
				value: current.customers,
				format: "number" as const,
				delta: delta(current.customers, previous.customers),
			},
		],
	};
}

export const SERIES_KEYS = [
	"revenue-monthly",
	"top-products",
	"by-category",
	"by-status",
	"by-region",
	"aov-monthly",
] as const;

export type SeriesKey = (typeof SERIES_KEYS)[number];

const seriesQueries: Record<SeriesKey, (range: DateRange) => Promise<Array<Record<string, unknown>>>> = {
	"revenue-monthly": ({ from, to }) =>
		prisma.$queryRaw(Prisma.sql`
		SELECT
			to_char(date_trunc('month', o."placedAt"), 'YYYY-MM') AS mes,
			COALESCE(${REVENUE}, 0) AS receita
		FROM "Order" o
		JOIN "OrderItem" oi ON oi."orderId" = o."id"
		WHERE ${VALID_ORDER} AND o."placedAt" BETWEEN ${from} AND ${to}
		GROUP BY 1
		ORDER BY 1
	`),

	"aov-monthly": ({ from, to }) =>
		prisma.$queryRaw(Prisma.sql`
		SELECT
			to_char(date_trunc('month', o."placedAt"), 'YYYY-MM') AS mes,
			(COALESCE(${REVENUE}, 0) / NULLIF(COUNT(DISTINCT o."id"), 0))::float8 AS ticket_medio
		FROM "Order" o
		JOIN "OrderItem" oi ON oi."orderId" = o."id"
		WHERE ${VALID_ORDER} AND o."placedAt" BETWEEN ${from} AND ${to}
		GROUP BY 1
		ORDER BY 1
	`),

	"top-products": ({ from, to }) =>
		prisma.$queryRaw(Prisma.sql`
		SELECT
			p."name" AS produto,
			COALESCE(${REVENUE}, 0) AS receita
		FROM "OrderItem" oi
		JOIN "Order" o ON o."id" = oi."orderId"
		JOIN "Product" p ON p."id" = oi."productId"
		WHERE ${VALID_ORDER} AND o."placedAt" BETWEEN ${from} AND ${to}
		GROUP BY p."name"
		ORDER BY receita DESC
		LIMIT 10
	`),

	"by-category": ({ from, to }) =>
		prisma.$queryRaw(Prisma.sql`
		SELECT
			c."name" AS categoria,
			COALESCE(${REVENUE}, 0) AS receita
		FROM "OrderItem" oi
		JOIN "Order" o ON o."id" = oi."orderId"
		JOIN "Product" p ON p."id" = oi."productId"
		JOIN "Category" c ON c."id" = p."categoryId"
		WHERE ${VALID_ORDER} AND o."placedAt" BETWEEN ${from} AND ${to}
		GROUP BY c."name"
		ORDER BY receita DESC
	`),

	"by-region": ({ from, to }) =>
		prisma.$queryRaw(Prisma.sql`
		SELECT
			r."name" AS regiao,
			COALESCE(${REVENUE}, 0) AS receita
		FROM "Order" o
		JOIN "OrderItem" oi ON oi."orderId" = o."id"
		JOIN "Region" r ON r."id" = o."regionId"
		WHERE ${VALID_ORDER} AND o."placedAt" BETWEEN ${from} AND ${to}
		GROUP BY r."name"
		ORDER BY receita DESC
	`),

	// funil de ciclo de vida: quantos pedidos chegaram a cada etapa
	"by-status": ({ from, to }) =>
		prisma.$queryRaw(Prisma.sql`
		SELECT
			etapa,
			COUNT(DISTINCT e."orderId")::int AS pedidos
		FROM "OrderEvent" e
		JOIN "Order" o ON o."id" = e."orderId"
		CROSS JOIN LATERAL (
			SELECT CASE e."status"
				WHEN 'PENDING' THEN '1. Criado'
				WHEN 'PAID' THEN '2. Pago'
				WHEN 'SHIPPED' THEN '3. Enviado'
				WHEN 'DELIVERED' THEN '4. Entregue'
			END AS etapa
		) AS s
		WHERE e."status" IN ('PENDING', 'PAID', 'SHIPPED', 'DELIVERED')
			AND o."placedAt" BETWEEN ${from} AND ${to}
		GROUP BY etapa
		ORDER BY etapa
	`),
};

export async function getSeries(key: SeriesKey, range: DateRange) {
	const rows = await seriesQueries[key](range);

	return { key, rows: rows.map(normalizeRow) };
}

/** BigInt e Decimal não são serializáveis em JSON — normaliza para number/string. */
export function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
	const output: Record<string, unknown> = {};

	for (const [column, value] of Object.entries(row)) {
		if (typeof value === "bigint") {
			output[column] = Number(value);
		} else if (value instanceof Date) {
			output[column] = value.toISOString();
		} else if (value !== null && typeof value === "object" && "toNumber" in value) {
			output[column] = (value as { toNumber: () => number }).toNumber();
		} else {
			output[column] = value;
		}
	}

	return output;
}
