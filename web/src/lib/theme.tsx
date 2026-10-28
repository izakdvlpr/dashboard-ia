import { createContext, type ReactNode, use, useCallback, useEffect, useState } from "react";
import { registerThemes, THEME_NAMES, type ThemeMode } from "./echarts-theme.ts";

const STORAGE_KEY = "dashboard-ia.theme";

type ThemeContextValue = {
	mode: ThemeMode;
	toggle: () => void;
	/** Nome do tema ECharts registrado. */
	echartsTheme: string;
	/** Muda no toggle e quando as webfonts carregam — `key` para remontar o canvas. */
	chartKey: string;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function initialMode(): ThemeMode {
	const stored = localStorage.getItem(STORAGE_KEY);

	if (stored === "light" || stored === "dark") return stored;

	return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [mode, setMode] = useState<ThemeMode>(initialMode);
	const [fontsReady, setFontsReady] = useState(false);

	useEffect(() => {
		document.documentElement.classList.toggle("dark", mode === "dark");
		localStorage.setItem(STORAGE_KEY, mode);

		// as CSS vars só mudam depois que a classe é aplicada — registra na sequência
		registerThemes();
	}, [mode]);

	// O canvas desenha com a fonte disponível no momento; sem isso o primeiro
	// render fica no fallback do sistema até o próximo toggle.
	useEffect(() => {
		let cancelled = false;

		void document.fonts.ready.then(() => {
			if (cancelled) return;

			registerThemes();
			setFontsReady(true);
		});

		return () => {
			cancelled = true;
		};
	}, []);

	const toggle = useCallback(() => setMode((current) => (current === "dark" ? "light" : "dark")), []);

	const echartsTheme = THEME_NAMES[mode];

	return (
		<ThemeContext
			value={{ mode, toggle, echartsTheme, chartKey: `${echartsTheme}:${fontsReady ? "fonts" : "system"}` }}
		>
			{children}
		</ThemeContext>
	);
}

export function useTheme(): ThemeContextValue {
	const context = use(ThemeContext);

	if (!context) throw new Error("useTheme precisa estar dentro de <ThemeProvider>.");

	return context;
}
