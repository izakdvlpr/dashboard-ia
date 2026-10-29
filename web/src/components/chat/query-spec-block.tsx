import type { QuerySpec } from "@dashboard-ia/shared";
import { describeQuerySpec } from "@dashboard-ia/shared";
import { ChevronRightIcon } from "lucide-react";

/** O que a IA pediu ao banco, em termos do catálogo — não há SQL para mostrar. */
export function QuerySpecBlock({ spec, attempts }: { spec: QuerySpec; attempts?: number }) {
	return (
		<details className="group bg-graphite text-graphite-foreground border-graphite-border rounded-xl border">
			<summary className="label-mono text-graphite-muted hover:text-graphite-foreground flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2 transition-colors">
				<ChevronRightIcon className="size-3.5 transition-transform group-open:rotate-90" />
				Consulta
				{attempts && attempts > 1 ? (
					<span className="text-graphite-warning">· {attempts} tentativas</span>
				) : null}
				<span className="flex flex-wrap gap-1 normal-case">
					{describeQuerySpec(spec).map((part) => (
						<span key={part} className="border-graphite-border rounded-md border px-1.5 py-0.5">
							{part}
						</span>
					))}
				</span>
			</summary>
			<pre className="border-graphite-border overflow-x-auto border-t px-4 py-3 font-mono text-xs leading-relaxed">
				<code>{JSON.stringify(spec, null, 2)}</code>
			</pre>
		</details>
	);
}
