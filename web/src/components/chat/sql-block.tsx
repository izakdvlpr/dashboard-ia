import { CheckIcon, ChevronRightIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button.tsx";

export function SqlBlock({ sql, attempts }: { sql: string; attempts?: number }) {
	const [copied, setCopied] = useState(false);

	async function copy() {
		await navigator.clipboard.writeText(sql);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}

	return (
		<details className="group bg-muted/40 rounded-md border">
			<summary className="text-muted-foreground flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium">
				<ChevronRightIcon className="size-3.5 transition-transform group-open:rotate-90" />
				SQL executado
				{attempts && attempts > 1 ? (
					<span className="text-amber-600 dark:text-amber-400">({attempts} tentativas)</span>
				) : null}
				<Button
					variant="ghost"
					size="sm"
					className="ml-auto h-6"
					onClick={(event) => {
						event.preventDefault();
						void copy();
					}}
				>
					{copied ? <CheckIcon /> : <CopyIcon />}
				</Button>
			</summary>
			<pre className="overflow-x-auto border-t px-3 py-2 text-xs leading-relaxed">
				<code>{sql}</code>
			</pre>
		</details>
	);
}
