import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { type ApiError, chatApi } from "@/lib/api.ts";
import { cn } from "@/lib/utils.ts";
import { Button } from "../ui/button.tsx";
import { Skeleton } from "../ui/skeleton.tsx";

const STAMP = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
});

type ConversationListProps = {
	activeId: string | null;
	onSelect: (id: string) => void;
	onNew: () => void;
	/** a conversa aberta sumiu (excluída) — o chat volta ao estado vazio */
	onRemoved: (id: string) => void;
};

export function ConversationList({ activeId, onSelect, onNew, onRemoved }: ConversationListProps) {
	const queryClient = useQueryClient();
	const conversations = useQuery({ queryKey: ["conversations"], queryFn: chatApi.conversations });

	const removeMutation = useMutation({
		mutationFn: chatApi.removeConversation,
		onSuccess: (_data, id) => {
			void queryClient.invalidateQueries({ queryKey: ["conversations"] });
			if (id === activeId) onRemoved(id);
			toast.success("Conversa excluída");
		},
		onError: (error: ApiError) => toast.error("Falha ao excluir", { description: error.message }),
	});

	const list = conversations.data?.conversations ?? [];

	return (
		<aside className="hidden w-64 shrink-0 flex-col border-r lg:flex">
			<div className="flex items-center justify-between gap-2 border-b px-3 py-2">
				<span className="text-muted-foreground text-xs font-medium">Histórico</span>
				<Button size="sm" variant="ghost" className="h-7" onClick={onNew}>
					<MessageSquarePlusIcon />
					Nova
				</Button>
			</div>

			<div className="flex-1 space-y-1 overflow-y-auto p-2">
				{conversations.isLoading ? (
					<>
						<Skeleton className="h-10" />
						<Skeleton className="h-10" />
					</>
				) : list.length === 0 ? (
					<p className="text-muted-foreground px-2 py-4 text-xs">Nenhuma conversa ainda.</p>
				) : (
					list.map((conversation) => (
						<div
							key={conversation.id}
							className={cn(
								"group hover:bg-accent flex items-start gap-1 rounded-md px-2 py-1.5",
								conversation.id === activeId && "bg-accent",
							)}
						>
							<button
								type="button"
								onClick={() => onSelect(conversation.id)}
								className="min-w-0 flex-1 text-left"
							>
								<span className="line-clamp-2 text-xs">{conversation.title}</span>
								<span className="text-muted-foreground text-[10px]">
									{STAMP.format(new Date(conversation.updatedAt))}
								</span>
							</button>
							<Button
								size="icon"
								variant="ghost"
								className="size-6 opacity-0 group-hover:opacity-100"
								aria-label="Excluir conversa"
								onClick={() => removeMutation.mutate(conversation.id)}
							>
								<Trash2Icon className="size-3" />
							</Button>
						</div>
					))
				)}
			</div>
		</aside>
	);
}
