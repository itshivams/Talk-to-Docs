import { ChevronDown } from "lucide-react";

import type { SourceReference } from "@/lib/types";

export function SourceReferences({ sources }: { sources: SourceReference[] }) {
  if (!sources?.length) return null;
  return (
    <details className="group mt-4 border-t border-black/10 pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-[var(--muted)] hover:text-black">
        <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
        Sources ({sources.length})
      </summary>
      <div className="pt-1">
        {sources.map((source, index) => (
          <a
            key={`${source.doc_id}-${source.chunk_index}`}
            href={source.source_url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block text-xs leading-5 text-[var(--muted)] hover:text-black"
          >
            <span className="font-semibold text-black">
              Source {index + 1}
              {source.heading ? ` · ${source.heading}` : ""}
            </span>
            <span className="mt-1 block">{source.excerpt}</span>
          </a>
        ))}
      </div>
    </details>
  );
}
