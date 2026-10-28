import type { ChartColumn, ColumnType, QueryRow } from "@dashboard-ia/shared";
import pg from "pg";
import { readonlyPool } from "../db-readonly.ts";
import { getColumnMap } from "../services/schema-catalog.service.ts";
import { MAX_ROWS } from "./allowlist.ts";
import { validateSql } from "./validator.ts";

// numeric/int8 chegam como string no driver pg — converte para number.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number.parseFloat(value));
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number.parseInt(value, 10));

const NUMERIC_OIDS = new Set<number>([
	pg.types.builtins.INT2,
	pg.types.builtins.INT4,
	pg.types.builtins.INT8,
	pg.types.builtins.FLOAT4,
	pg.types.builtins.FLOAT8,
	pg.types.builtins.NUMERIC,
	pg.types.builtins.MONEY,
]);

const DATE_OIDS = new Set<number>([
	pg.types.builtins.DATE,
	pg.types.builtins.TIMESTAMP,
	pg.types.builtins.TIMESTAMPTZ,
]);

function columnType(dataTypeID: number): ColumnType {
	if (NUMERIC_OIDS.has(dataTypeID)) return "number";
	if (DATE_OIDS.has(dataTypeID)) return "date";
	if (dataTypeID === pg.types.builtins.BOOL) return "boolean";

	return "string";
}

/** JSON/array/interval chegam como objeto — vira string para caber em QueryRow. */
function normalizeCell(value: unknown): string | number | boolean | null {
	if (value === null || value === undefined) return null;
	if (value instanceof Date) return value.toISOString();
	if (typeof value === "bigint") return Number(value);
	if (typeof value === "object") return JSON.stringify(value);
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;

	return String(value);
}

export type QueryResult = {
	sql: string;
	columns: ChartColumn[];
	rows: QueryRow[];
	rowCount: number;
	durationMs: number;
};

/**
 * Valida e executa. A conexão usa a role `dashboard_ro`; a transação é
 * explicitamente read-only e tem statement_timeout próprio, de modo que uma
 * falha nos guardrails ainda não resulta em escrita nem em leitura indevida.
 */
export async function runGuardedQuery(input: string): Promise<QueryResult> {
	const columnMap = await getColumnMap();
	const { sql } = validateSql(input, columnMap);

	const client = await readonlyPool.connect();
	const startedAt = Date.now();

	try {
		await client.query("BEGIN READ ONLY");
		await client.query("SET LOCAL statement_timeout = '5s'");

		const result = await client.query({ text: sql, rowMode: "array" });

		await client.query("COMMIT");

		const columns: ChartColumn[] = result.fields.map((field) => ({
			name: field.name,
			type: columnType(field.dataTypeID),
		}));

		const rows: QueryRow[] = (result.rows as unknown[][]).slice(0, MAX_ROWS).map((values) => {
			const row: QueryRow = {};

			for (const [index, column] of columns.entries()) {
				const value = values[index];

				row[column.name] = normalizeCell(value);
			}

			return row;
		});

		return { sql, columns, rows, rowCount: rows.length, durationMs: Date.now() - startedAt };
	} catch (error) {
		await client.query("ROLLBACK").catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}
