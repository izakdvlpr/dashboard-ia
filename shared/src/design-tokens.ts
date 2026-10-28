/**
 * Nomes canônicos das CSS custom properties do design system.
 * O web resolve estes tokens em tempo de render; a IA só escolhe entre COLOR_TOKENS.
 */

export const COLOR_TOKENS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];

export const STRUCTURAL_TOKENS = [
	"background",
	"foreground",
	"muted-foreground",
	"border",
	"card",
	"popover",
	"popover-foreground",
	"radius",
	"font-sans",
	"font-display",
	"font-mono",
] as const;

export type StructuralToken = (typeof STRUCTURAL_TOKENS)[number];

export function cssVar(token: ColorToken | StructuralToken): string {
	return `--${token}`;
}

export function isColorToken(value: unknown): value is ColorToken {
	return typeof value === "string" && (COLOR_TOKENS as readonly string[]).includes(value);
}
