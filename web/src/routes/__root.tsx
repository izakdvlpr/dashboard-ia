import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { AppShell } from "@/components/layout/app-shell.tsx";
import { useTheme } from "@/lib/theme.tsx";

export const Route = createRootRoute({ component: RootLayout });

function RootLayout() {
	const { mode } = useTheme();

	return (
		<AppShell>
			<Outlet />
			<Toaster theme={mode} position="bottom-right" richColors />
		</AppShell>
	);
}
