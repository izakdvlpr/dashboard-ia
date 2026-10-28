import { createContext, type ReactNode, use, useCallback, useEffect, useState } from "react";
import { registerThemes, THEME_NAMES, type ThemeMode } from "./echarts-theme.ts";

const STORAGE_KEY = "dashboard-ia.theme";

type ThemeContextValue = {
	mode: ThemeMode;
	toggle: () => void;
	/** Nome do tema ECharts registrado — serve também de `key` para remontar. */
	echartsTheme: string;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function initialMode(): ThemeMode {
	const stored = localStorage.getItem(STORAGE_KEY);

	if (stored === "light" || stored === "dark") return stored;

	return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [mode, setMode] = useState<ThemeMode>(initialMode);

	useEffect(() => {
		document.documentElement.classList.toggle("dark", mode === "dark");
		localStorage.setItem(STORAGE_KEY, mode);

		// as CSS vars só mudam depois que a classe é aplicada — registra na sequência
		registerThemes();
	}, [mode]);

	const toggle = useCallback(() => setMode((current) => (current === "dark" ? "light" : "dark")), []);

	return <ThemeContext value={{ mode, toggle, echartsTheme: THEME_NAMES[mode] }}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
	const context = use(ThemeContext);

	if (!context) throw new Error("useTheme precisa estar dentro de <ThemeProvider>.");

	return context;
}
