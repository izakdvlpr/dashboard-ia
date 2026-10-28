import type { ValueFormat } from "@dashboard-ia/shared";

const currency = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
	maximumFractionDigits: 2,
});

const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

export function formatValue(value: unknown, format: ValueFormat = "number"): string {
	if (value === null || value === undefined) return "—";
	if (typeof value !== "number") return String(value);

	switch (format) {
		case "currency":
			return currency.format(value);
		case "compact":
			return compact.format(value);
		case "percent":
			return percent.format(value > 1 ? value / 100 : value);
		default:
			return decimal.format(value);
	}
}

/** Eixos e rótulos ficam ilegíveis com valores longos — encurta mantendo a unidade. */
export function formatAxisValue(value: unknown, format: ValueFormat = "number"): string {
	if (typeof value !== "number") return String(value ?? "");

	if (format === "currency") return `R$ ${compact.format(value)}`;
	if (format === "percent") return percent.format(value > 1 ? value / 100 : value);

	return compact.format(value);
}

export function formatDelta(delta: number | null): string {
	if (delta === null) return "—";

	return `${delta > 0 ? "+" : ""}${decimal.format(delta)}%`;
}

/** "2025-03" → "mar/25" */
export function formatMonthLabel(value: unknown): string {
	if (typeof value !== "string") return String(value ?? "");

	const match = /^(\d{4})-(\d{2})/.exec(value);

	if (!match) return value;

	const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
	const month = date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");

	return `${month}/${String(date.getFullYear()).slice(2)}`;
}
