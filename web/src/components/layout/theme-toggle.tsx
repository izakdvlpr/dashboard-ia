import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "@/lib/theme.tsx";
import { Button } from "../ui/button.tsx";

export function ThemeToggle() {
	const { mode, toggle } = useTheme();

	return (
		<Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema">
			{mode === "dark" ? <SunIcon /> : <MoonIcon />}
		</Button>
	);
}
