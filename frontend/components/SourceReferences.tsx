import type { SourceReference } from "@/lib/types";

export function SourceReferences({ sources }: { sources: SourceReference[] }) {
  if (!sources?.length) return null;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-black/45">Sources</p>
      {sources.map((source) => (
        <a
          key={`${source.doc_id}-${source.chunk_index}`}
          href={source.source_url}
          target="_blank"
          rel="noreferrer"
          className="block rounded-2xl border border-black/10 bg-white/50 p-3 text-xs hover:bg-white"
        >
          <span className="font-bold">
            Chunk {source.chunk_index}
            {source.heading ? ` · ${source.heading}` : ""}
          </span>
          <span className="mt-1 block text-black/55">{source.excerpt}</span>
        </a>
      ))}
    </div>
  );
}
