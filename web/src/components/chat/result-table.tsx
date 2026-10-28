import type { ChartColumn, QueryRow } from "@dashboard-ia/shared";
import { formatValue } from "@/lib/format.ts";

const PREVIEW_ROWS = 50;

export function ResultTable({ columns, rows }: { columns: ChartColumn[]; rows: QueryRow[] }) {
	const preview = rows.slice(0, PREVIEW_ROWS);

	return (
		<div className="overflow-hidden rounded-md border">
			<div className="max-h-72 overflow-auto">
				<table className="w-full text-sm">
					<thead className="bg-muted/60 sticky top-0">
						<tr>
							{columns.map((column) => (
								<th
									key={column.name}
									className="text-muted-foreground px-3 py-2 text-left font-medium whitespace-nowrap"
								>
									{column.name}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{preview.map((row, index) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: linhas do resultado não têm id
							<tr key={index} className="border-t">
								{columns.map((column) => (
									<td
										key={column.name}
										className={
											column.type === "number"
												? "px-3 py-1.5 text-right tabular-nums whitespace-nowrap"
												: "px-3 py-1.5 whitespace-nowrap"
										}
									>
										{column.type === "number"
											? formatValue(row[column.name], "number")
											: String(row[column.name] ?? "—")}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{rows.length > PREVIEW_ROWS ? (
				<div className="text-muted-foreground border-t px-3 py-1.5 text-xs">
					Mostrando {PREVIEW_ROWS} de {rows.length} linhas.
				</div>
			) : null}
		</div>
	);
}
