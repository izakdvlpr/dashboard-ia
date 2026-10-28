import type { ChartType, Preset } from "@dashboard-ia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkIcon, StarIcon, Trash2Icon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { type ApiError, presetsApi } from "@/lib/api.ts";
import { cn } from "@/lib/utils.ts";
import { Button } from "../ui/button.tsx";
import { Skeleton } from "../ui/skeleton.tsx";

type PresetBarProps = {
	chartType: ChartType;
	activeId: string | null;
	/** patch atual em edição — vira o conteúdo do preset ao salvar */
	currentPatch: Record<string, unknown>;
	onApply: (preset: Preset | null) => void;
	className?: string;
};

/**
 * Presets são só estilo: aplicar um troca o `optionPatch` mesclado sobre a option base.
 * `chartType: null` no preset = global, aparece para qualquer gráfico.
 */
export function PresetBar({ chartType, activeId, currentPatch, onApply, className }: PresetBarProps) {
	const queryClient = useQueryClient();
	const [naming, setNaming] = useState(false);
	const [name, setName] = useState("");

	const presets = useQuery({
		queryKey: ["presets", chartType],
		queryFn: () => presetsApi.list(chartType),
	});

	const invalidate = () => queryClient.invalidateQueries({ queryKey: ["presets"] });

	const createMutation = useMutation({
		mutationFn: () => presetsApi.create({ name: name.trim(), chartType, optionPatch: currentPatch }),
		onSuccess: (preset) => {
			void invalidate();
			setNaming(false);
			setName("");
			onApply(preset);
			toast.success("Preset salvo", { description: preset.name });
		},
		onError: (error: ApiError) => toast.error("Falha ao salvar preset", { description: error.message }),
	});

	const defaultMutation = useMutation({
		mutationFn: (preset: Preset) =>
			presetsApi.update(preset.id, { isGlobalDefault: !preset.isGlobalDefault }),
		onSuccess: () => invalidate(),
		onError: (error: ApiError) => toast.error("Falha ao marcar padrão", { description: error.message }),
	});

	const removeMutation = useMutation({
		mutationFn: (id: string) => presetsApi.remove(id),
		onSuccess: (_data, id) => {
			void invalidate();
			if (id === activeId) onApply(null);
			toast.success("Preset excluído");
		},
		onError: (error: ApiError) => toast.error("Falha ao excluir preset", { description: error.message }),
	});

	if (presets.isLoading) return <Skeleton className={cn("h-9", className)} />;

	const list = presets.data?.presets ?? [];

	return (
		<div className={cn("flex flex-wrap items-center gap-2", className)}>
			<span className="text-muted-foreground text-xs font-medium">Presets</span>

			{list.map((preset) => (
				<div
					key={preset.id}
					className={cn(
						"flex items-center rounded-md border",
						preset.id === activeId ? "border-primary bg-accent" : "",
					)}
				>
					<button
						type="button"
						onClick={() => onApply(preset.id === activeId ? null : preset)}
						className="px-2.5 py-1 text-xs"
					>
						{preset.name}
						{preset.chartType === null ? <span className="text-muted-foreground"> · global</span> : null}
					</button>
					<Button
						size="icon"
						variant="ghost"
						className="size-6"
						aria-label="Padrão"
						onClick={() => defaultMutation.mutate(preset)}
					>
						<StarIcon className={cn("size-3", preset.isGlobalDefault && "fill-current")} />
					</Button>
					<Button
						size="icon"
						variant="ghost"
						className="size-6"
						aria-label="Excluir preset"
						onClick={() => removeMutation.mutate(preset.id)}
					>
						<Trash2Icon className="size-3" />
					</Button>
				</div>
			))}

			{list.length === 0 ? <span className="text-muted-foreground text-xs">nenhum ainda</span> : null}

			{naming ? (
				<form
					className="flex items-center gap-1"
					onSubmit={(event) => {
						event.preventDefault();
						if (name.trim()) createMutation.mutate();
					}}
				>
					<input
						// biome-ignore lint/a11y/noAutofocus: campo aparece só depois do clique explícito
						autoFocus
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="Nome do preset"
						className="border-input h-7 w-36 rounded-md border bg-transparent px-2 text-xs outline-none"
					/>
					<Button type="submit" size="sm" className="h-7" disabled={createMutation.isPending}>
						Salvar
					</Button>
					<Button
						type="button"
						size="icon"
						variant="ghost"
						className="size-7"
						aria-label="Cancelar"
						onClick={() => setNaming(false)}
					>
						<XIcon />
					</Button>
				</form>
			) : (
				<Button size="sm" variant="ghost" className="h-7" onClick={() => setNaming(true)}>
					<BookmarkIcon />
					Salvar atual
				</Button>
			)}
		</div>
	);
}
