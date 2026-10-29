import type { Dimension, Metric } from "@dashboard-ia/shared";
import { Prisma } from "@/prisma/generated/client.ts";

/**
 * Único lugar onde nomes de tabela e coluna aparecem para consultas dinâmicas.
 * Tudo aqui é escrito à mão; o spec só escolhe chaves destes mapas.
 *
 * Aliases: `o` Order, `oi` OrderItem, `p` Product, `c` Category, `r` Region,
 * `cu` Customer, `e` OrderEvent (só no funil).
 */

/** Receita de um item = quantidade * preço unitário - desconto. */
export const REVENUE = Prisma.sql`SUM(oi."quantity" * oi."unitPrice" - oi."discount")::float8`;

/** Pedidos cancelados/estornados não contam como receita. */
export const VALID_ORDER = Prisma.sql`o."status" NOT IN ('CANCELED', 'REFUNDED')`;

export type Join = "items" | "product" | "category" | "region" | "customer";

/** Ordem de emissão: cada join só referencia aliases dos anteriores. */
export const JOINS: ReadonlyArray<{ key: Join; requires: Join[]; sql: Prisma.Sql }> = [
	{ key: "items", requires: [], sql: Prisma.sql`JOIN "OrderItem" oi ON oi."orderId" = o."id"` },
	{ key: "product", requires: ["items"], sql: Prisma.sql`JOIN "Product" p ON p."id" = oi."productId"` },
	{ key: "category", requires: ["product"], sql: Prisma.sql`JOIN "Category" c ON c."id" = p."categoryId"` },
	{ key: "region", requires: [], sql: Prisma.sql`JOIN "Region" r ON r."id" = o."regionId"` },
	{ key: "customer", requires: [], sql: Prisma.sql`JOIN "Customer" cu ON cu."id" = o."customerId"` },
];

type Field = { expression: Prisma.Sql; joins: Join[] };

export const METRIC_SQL: Record<Exclude<Metric, "funil">, Field> = {
	receita: { expression: Prisma.sql`COALESCE(${REVENUE}, 0)`, joins: ["items"] },
	pedidos: { expression: Prisma.sql`COUNT(DISTINCT o."id")::int`, joins: [] },
	ticket_medio: {
		expression: Prisma.sql`(COALESCE(${REVENUE}, 0) / NULLIF(COUNT(DISTINCT o."id"), 0))::float8`,
		joins: ["items"],
	},
	unidades: { expression: Prisma.sql`COALESCE(SUM(oi."quantity"), 0)::int`, joins: ["items"] },
	clientes: { expression: Prisma.sql`COUNT(DISTINCT o."customerId")::int`, joins: [] },
	margem: {
		expression: Prisma.sql`COALESCE(SUM(oi."quantity" * (oi."unitPrice" - p."cost") - oi."discount"), 0)::float8`,
		joins: ["product"],
	},
	itens_por_pedido: {
		expression: Prisma.sql`(COALESCE(SUM(oi."quantity"), 0)::float8 / NULLIF(COUNT(DISTINCT o."id"), 0))::float8`,
		joins: ["items"],
	},
};

export const DIMENSION_SQL: Record<Dimension, Field> = {
	mes: { expression: Prisma.sql`to_char(date_trunc('month', o."placedAt"), 'YYYY-MM')`, joins: [] },
	semana: { expression: Prisma.sql`to_char(date_trunc('week', o."placedAt"), 'YYYY-MM-DD')`, joins: [] },
	dia: { expression: Prisma.sql`to_char(date_trunc('day', o."placedAt"), 'YYYY-MM-DD')`, joins: [] },
	regiao: { expression: Prisma.sql`r."name"`, joins: ["region"] },
	categoria: { expression: Prisma.sql`c."name"`, joins: ["category"] },
	produto: { expression: Prisma.sql`p."name"`, joins: ["product"] },
	canal: { expression: Prisma.sql`o."channel"::text`, joins: [] },
	status: { expression: Prisma.sql`o."status"::text`, joins: [] },
	cliente: { expression: Prisma.sql`cu."name"`, joins: ["customer"] },
};

/** Funil de ciclo de vida: quantos pedidos chegaram a cada etapa. */
export const FUNNEL = {
	from: Prisma.sql`"OrderEvent" e JOIN "Order" o ON o."id" = e."orderId"`,
	stage: Prisma.sql`CASE e."status"
		WHEN 'PENDING' THEN '1. Criado'
		WHEN 'PAID' THEN '2. Pago'
		WHEN 'SHIPPED' THEN '3. Enviado'
		WHEN 'DELIVERED' THEN '4. Entregue'
	END`,
	stageFilter: Prisma.sql`e."status" IN ('PENDING', 'PAID', 'SHIPPED', 'DELIVERED')`,
	count: Prisma.sql`COUNT(DISTINCT e."orderId")::int`,
	/** Coluna de saída do funil: o gráfico mostra "pedidos", não "funil". */
	alias: "pedidos",
	stageAlias: "etapa",
};
