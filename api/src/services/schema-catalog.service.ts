import { Prisma } from "@/prisma/generated/client.ts";
import { prisma } from "../db.ts";
import { ALLOWED_TABLES } from "../sql-guardrails/allowlist.ts";

export type CatalogColumn = { name: string; type: string; nullable: boolean };
export type CatalogTable = { name: string; columns: CatalogColumn[] };

let cache: CatalogTable[] | null = null;

/** Introspecção real do Postgres, restrita ao allowlist. Cacheada em memória. */
export async function getCatalog(): Promise<CatalogTable[]> {
	if (cache) return cache;

	const rows = await prisma.$queryRaw<
		Array<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>
	>(Prisma.sql`
		SELECT table_name, column_name, data_type, is_nullable
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name IN (${Prisma.join(ALLOWED_TABLES)})
		ORDER BY table_name, ordinal_position
	`);

	const byTable = new Map<string, CatalogColumn[]>();

	for (const row of rows) {
		const columns = byTable.get(row.table_name) ?? [];

		columns.push({
			name: row.column_name,
			type: row.data_type === "USER-DEFINED" ? "enum" : row.data_type,
			nullable: row.is_nullable === "YES",
		});
		byTable.set(row.table_name, columns);
	}

	// mantém a ordem do allowlist, não a alfabética do information_schema
	cache = ALLOWED_TABLES.map((name) => ({ name, columns: byTable.get(name) ?? [] })).filter(
		(table) => table.columns.length > 0,
	);

	return cache;
}

/** Valores possíveis dos enums, para o modelo não inventar status inexistente. */
export async function getEnums(): Promise<Record<string, string[]>> {
	const rows = await prisma.$queryRaw<Array<{ enum_name: string; enum_value: string }>>(Prisma.sql`
		SELECT t.typname AS enum_name, e.enumlabel AS enum_value
		FROM pg_type t
		JOIN pg_enum e ON e.enumtypid = t.oid
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE n.nspname = 'public'
		ORDER BY t.typname, e.enumsortorder
	`);

	const output: Record<string, string[]> = {};

	for (const row of rows) {
		const values = output[row.enum_name] ?? [];

		values.push(row.enum_value);
		output[row.enum_name] = values;
	}

	return output;
}

/** Mapa tabela -> Set(colunas), usado pelo allowlist de colunas do guardrail. */
export async function getColumnMap(): Promise<Map<string, Set<string>>> {
	const catalog = await getCatalog();

	return new Map(catalog.map((table) => [table.name, new Set(table.columns.map((column) => column.name))]));
}

/**
 * Bloco de schema injetado no prompt de NL->SQL.
 * Formato compacto de propósito: cabe em poucos tokens e é fácil do modelo copiar.
 */
export async function buildSchemaBlock(): Promise<string> {
	const [catalog, enums] = await Promise.all([getCatalog(), getEnums()]);

	const tables = catalog
		.map((table) => {
			const columns = table.columns.map((column) => `${column.name} ${column.type}`).join(", ");

			return `  "${table.name}"(${columns})`;
		})
		.join("\n");

	const enumLines = Object.entries(enums)
		.filter(([name]) => name === "OrderStatus" || name === "OrderChannel")
		.map(([name, values]) => `  ${name}: ${values.join(" | ")}`)
		.join("\n");

	return [
		"Tables (identifiers are case-sensitive, always quote them with double quotes):",
		tables,
		"",
		"Enum values:",
		enumLines,
		"",
		"Relationships:",
		'  "Order"."customerId" -> "Customer"."id"',
		'  "Order"."regionId" -> "Region"."id"',
		'  "OrderItem"."orderId" -> "Order"."id"',
		'  "OrderItem"."productId" -> "Product"."id"',
		'  "OrderEvent"."orderId" -> "Order"."id"',
		'  "Product"."categoryId" -> "Category"."id"',
		'  "Customer"."regionId" -> "Region"."id"',
		"",
		"Business rules:",
		'  Revenue is computed from "OrderItem": SUM(oi."quantity" * oi."unitPrice" - oi."discount").',
		'  There is no total column on "Order".',
		"  Exclude orders with status CANCELED or REFUNDED from revenue.",
		'  Order date is "Order"."placedAt".',
	].join("\n");
}
