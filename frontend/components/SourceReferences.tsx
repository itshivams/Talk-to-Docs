import type { SourceReference } from "@/lib/types";

export function SourceReferences({ sources }: { sources: SourceReference[] }) {
  if (!sources?.length) return null;
  return (
    <div className="mt-4 border-t border-black/10 pt-3">
      <p className="text-xs font-semibold text-[var(--muted)]">Sources</p>
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
  );
}
