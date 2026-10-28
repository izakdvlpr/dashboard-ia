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
		<details className="group bg-graphite text-graphite-foreground border-graphite-border rounded-xl border">
			<summary className="label-mono text-graphite-muted hover:text-graphite-foreground flex cursor-pointer list-none items-center gap-2 px-3 py-2 transition-colors">
				<ChevronRightIcon className="size-3.5 transition-transform group-open:rotate-90" />
				SQL executado
				{attempts && attempts > 1 ? (
					<span className="text-graphite-warning">· {attempts} tentativas</span>
				) : null}
				<Button
					variant="ghost"
					size="sm"
					aria-label={copied ? "SQL copiado" : "Copiar SQL"}
					className="text-graphite-muted hover:text-graphite-foreground ml-auto h-6 hover:bg-graphite-border"
					onClick={(event) => {
						event.preventDefault();
						void copy();
					}}
				>
					{copied ? <CheckIcon /> : <CopyIcon />}
				</Button>
			</summary>
			<pre className="border-graphite-border overflow-x-auto border-t px-4 py-3 font-mono text-xs leading-relaxed">
				<code>{sql}</code>
			</pre>
		</details>
	);
}
