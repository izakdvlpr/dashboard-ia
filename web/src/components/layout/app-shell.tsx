import { Link } from "@tanstack/react-router";
import { BarChart3Icon, LayoutDashboardIcon, MessageSquareIcon, WandSparklesIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils.ts";
import { ThemeToggle } from "./theme-toggle.tsx";

const NAV = [
	{ to: "/", label: "Visão geral", icon: LayoutDashboardIcon },
	{ to: "/chat", label: "Chatbot", icon: MessageSquareIcon },
	{ to: "/charts", label: "Gráficos", icon: BarChart3Icon },
	{ to: "/builder", label: "Construtor", icon: WandSparklesIcon },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-svh">
			<aside className="bg-sidebar text-sidebar-foreground sticky top-0 hidden h-svh w-56 shrink-0 flex-col border-r p-3 md:flex">
				<div className="flex items-center gap-2 px-2 py-3">
					<div className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-md text-xs font-bold">
						IA
					</div>
					<span className="text-sm font-semibold">dashboard-ia</span>
				</div>

				<nav className="mt-4 flex flex-col gap-1">
					{NAV.map(({ to, label, icon: Icon }) => (
						<Link
							key={to}
							to={to}
							activeOptions={{ exact: to === "/" }}
							className={cn(
								"text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
							)}
							activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}
						>
							<Icon className="size-4" />
							{label}
						</Link>
					))}
				</nav>

				<div className="mt-auto flex items-center justify-between px-2">
					<span className="text-muted-foreground text-xs">Vercel AI Gateway</span>
					<ThemeToggle />
				</div>
			</aside>

			<div className="flex min-w-0 flex-1 flex-col">
				<header className="bg-background/80 sticky top-0 z-10 flex items-center gap-2 border-b px-4 py-2 backdrop-blur md:hidden">
					<span className="text-sm font-semibold">dashboard-ia</span>
					<nav className="ml-auto flex gap-1">
						{NAV.map(({ to, icon: Icon, label }) => (
							<Link
								key={to}
								to={to}
								aria-label={label}
								className="text-muted-foreground rounded-md p-2"
								activeProps={{ className: "bg-accent text-accent-foreground" }}
								activeOptions={{ exact: to === "/" }}
							>
								<Icon className="size-4" />
							</Link>
						))}
					</nav>
					<ThemeToggle />
				</header>

				<main className="min-w-0 flex-1">{children}</main>
			</div>
		</div>
	);
}

export function PageHeader({
	title,
	description,
	action,
}: {
	title: string;
	description?: string;
	action?: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-end justify-between gap-3 border-b px-6 py-4">
			<div>
				<h1 className="text-xl font-semibold">{title}</h1>
				{description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
			</div>
			{action}
		</div>
	);
}
