import type { Dimension, Period, QuerySpec } from "@dashboard-ia/shared";
import { DIMENSION_INFO } from "@dashboard-ia/shared";
import { Prisma } from "@/prisma/generated/client.ts";
import { DIMENSION_SQL, FUNNEL, JOINS, type Join, METRIC_SQL, VALID_ORDER } from "./registry.ts";

const PERIOD_SQL: Record<Exclude<Period, "all" | "custom">, Prisma.Sql> = {
	"7d": Prisma.sql`o."placedAt" >= now() - interval '7 days'`,
	"30d": Prisma.sql`o."placedAt" >= now() - interval '30 days'`,
	"90d": Prisma.sql`o."placedAt" >= now() - interval '90 days'`,
	"12m": Prisma.sql`o."placedAt" >= now() - interval '12 months'`,
	ytd: Prisma.sql`o."placedAt" >= date_trunc('year', now())`,
};

/**
 * Aliases de saída vêm só das chaves do registry (já validadas pelo zod como
 * enum) — nunca de texto livre. Por isso `Prisma.raw` é seguro aqui.
 */
function ident(alias: string): Prisma.Sql {
	return Prisma.raw(`"${alias}"`);
}

function escapeLike(value: string): string {
	return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/** Inclui as dependências e emite na ordem do registry. `Prisma.join([])` lança, daí o `empty`. */
function resolveJoins(needed: Set<Join>): Prisma.Sql {
	for (const join of [...JOINS].reverse()) {
		if (needed.has(join.key)) for (const dependency of join.requires) needed.add(dependency);
	}

	const emitted = JOINS.filter((join) => needed.has(join.key)).map((join) => join.sql);

	return emitted.length > 0 ? Prisma.join(emitted, " ") : Prisma.empty;
}

/**
 * Filtros de categoria/produto entram via join com os itens: com métricas de
 * item, isso restringe a soma àqueles itens; com contagens, conta os pedidos
 * que contêm algum item que casa.
 */
function buildWhere(spec: QuerySpec, joins: Set<Join>, funnel: boolean): Prisma.Sql[] {
	const conditions: Prisma.Sql[] = [];
	const { filters } = spec;

	if (funnel) {
		conditions.push(FUNNEL.stageFilter);
	} else if (filters.status && filters.status.length > 0) {
		conditions.push(Prisma.sql`o."status"::text = ANY(${filters.status}::text[])`);
	} else if (!spec.includeCanceled) {
		conditions.push(VALID_ORDER);
	}

	if (filters.canal && filters.canal.length > 0) {
		conditions.push(Prisma.sql`o."channel"::text = ANY(${filters.canal}::text[])`);
	}

	if (filters.regiao && filters.regiao.length > 0) {
		joins.add("region");
		conditions.push(Prisma.sql`r."name" ILIKE ANY(${filters.regiao.map(escapeLike)}::text[])`);
	}

	if (filters.categoria && filters.categoria.length > 0) {
		joins.add("category");
		conditions.push(Prisma.sql`c."name" ILIKE ANY(${filters.categoria.map(escapeLike)}::text[])`);
	}

	if (filters.produto && filters.produto.length > 0) {
		joins.add("product");
		const patterns = filters.produto.map((value) => `%${escapeLike(value)}%`);
		conditions.push(Prisma.sql`p."name" ILIKE ANY(${patterns}::text[])`);
	}

	if (spec.period === "custom") {
		// fim inclusivo: o dia inteiro de `dateTo` entra
		conditions.push(
			Prisma.sql`o."placedAt" >= ${spec.dateFrom}::date AND o."placedAt" < ${spec.dateTo}::date + 1`,
		);
	} else if (spec.period !== "all") {
		conditions.push(PERIOD_SQL[spec.period]);
	}

	return conditions;
}

function where(conditions: Prisma.Sql[]): Prisma.Sql {
	return conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
}

function compileFunnel(spec: QuerySpec): Prisma.Sql {
	const joins = new Set<Join>();
	const conditions = buildWhere(spec, joins, true);

	return Prisma.sql`
		SELECT ${FUNNEL.stage} AS ${ident(FUNNEL.stageAlias)}, ${FUNNEL.count} AS ${ident(FUNNEL.alias)}
		FROM ${FUNNEL.from}
		${resolveJoins(joins)}
		${where(conditions)}
		GROUP BY 1
		ORDER BY 1
		LIMIT ${spec.limit}
	`;
}

/** Sem `orderBy`: série temporal em ordem cronológica, ranking pela primeira métrica. */
function defaultOrder(spec: QuerySpec): Prisma.Sql {
	const timeDimension = spec.groupBy.find((dimension) => DIMENSION_INFO[dimension].time);

	if (timeDimension) return Prisma.sql`${ident(timeDimension)} ASC`;

	const [metric] = spec.metrics;

	return metric ? Prisma.sql`${ident(metric)} DESC NULLS LAST` : Prisma.sql`1`;
}

/**
 * QuerySpec -> SELECT parametrizado. Valores do spec só entram como parâmetro
 * (`${}`); estrutura só sai dos fragmentos do registry.
 */
export function compileQuery(spec: QuerySpec): Prisma.Sql {
	if (spec.metrics.includes("funil")) return compileFunnel(spec);

	const joins = new Set<Join>();
	const conditions = buildWhere(spec, joins, false);

	const dimensions = spec.groupBy.map((dimension: Dimension) => {
		const field = DIMENSION_SQL[dimension];
		for (const join of field.joins) joins.add(join);

		return Prisma.sql`${field.expression} AS ${ident(dimension)}`;
	});

	const metrics = spec.metrics.flatMap((metric) => {
		if (metric === "funil") return [];

		const field = METRIC_SQL[metric];
		for (const join of field.joins) joins.add(join);

		return [Prisma.sql`${field.expression} AS ${ident(metric)}`];
	});

	const groupBy =
		dimensions.length > 0
			? Prisma.sql`GROUP BY ${Prisma.join(dimensions.map((_, index) => Prisma.raw(String(index + 1))))}`
			: Prisma.empty;

	const orderBy = spec.orderBy
		? Prisma.sql`${ident(spec.orderBy.by)} ${Prisma.raw(spec.orderBy.dir === "asc" ? "ASC" : "DESC")} NULLS LAST`
		: defaultOrder(spec);

	return Prisma.sql`
		SELECT ${Prisma.join([...dimensions, ...metrics])}
		FROM "Order" o
		${resolveJoins(joins)}
		${where(conditions)}
		${groupBy}
		ORDER BY ${orderBy}
		LIMIT ${spec.limit}
	`;
}
