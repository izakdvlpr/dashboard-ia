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
			<aside className="bg-sidebar text-sidebar-foreground border-sidebar-border sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r px-3 py-4 md:flex">
				<Wordmark className="px-2" />

				<nav className="mt-8 flex flex-col gap-0.5">
					{NAV.map(({ to, label, icon: Icon }) => (
						<Link
							key={to}
							to={to}
							activeOptions={{ exact: to === "/" }}
							className={cn(
								"text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors",
								// tick cobalto de 2px marca o item ativo — o único sinal de cor da sidebar
								"before:bg-primary before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:opacity-0 data-[status=active]:before:opacity-100",
							)}
							activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}
						>
							<Icon className="size-4" />
							{label}
						</Link>
					))}
				</nav>

				<div className="border-sidebar-border mt-auto flex items-center justify-between gap-2 border-t px-2 pt-3">
					<span className="label-mono text-muted-foreground flex min-w-0 items-center gap-2">
						<span aria-hidden className="bg-success size-1.5 shrink-0 rounded-full" />
						<span className="truncate">Vercel AI Gateway</span>
					</span>
					<ThemeToggle />
				</div>
			</aside>

			<div className="flex min-w-0 flex-1 flex-col">
				<header className="bg-background/90 sticky top-0 z-10 flex items-center gap-2 border-b px-4 py-2 backdrop-blur-sm md:hidden">
					<Wordmark />
					<nav className="ml-auto flex gap-0.5">
						{NAV.map(({ to, icon: Icon, label }) => (
							<Link
								key={to}
								to={to}
								aria-label={label}
								className="text-muted-foreground hover:text-foreground rounded-md p-2 transition-colors"
								activeProps={{ className: "bg-accent text-primary" }}
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
		<div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b px-4 pt-8 pb-5 md:px-8">
			<div className="min-w-0 space-y-1">
				<h1 className="text-2xl leading-tight font-semibold">{title}</h1>
				{description ? <p className="text-muted-foreground max-w-prose text-sm">{description}</p> : null}
			</div>
			{action}
		</div>
	);
}

function Wordmark({ className }: { className?: string }) {
	return (
		<Link to="/" className={cn("flex shrink-0 items-center gap-2.5 rounded-md whitespace-nowrap", className)}>
			<span className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-md font-mono text-[11px] font-medium">
				IA
			</span>
			{/* em 320px o header mobile não comporta wordmark + 4 ícones + toggle */}
			<span className="font-display text-[15px] font-semibold tracking-tight max-[359px]:sr-only">
				dashboard-ia
			</span>
		</Link>
	);
}
