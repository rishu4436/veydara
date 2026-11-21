"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { NAV } from "./nav";

type SearchResult = { kind: string; chain: string; address: string; label: string; issuer?: string | null; underlying?: string | null };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [rwaNote, setRwaNote] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      setRwaNote(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        const j = (await r.json()) as { results: SearchResult[]; rwa: { status: string; reason?: string } | null };
        setResults(j.results ?? []);
        setRwaNote(j.rwa && j.rwa.status !== "ok" ? (j.rwa.reason ?? null) : null);
        setIdx(0);
      } catch {
        /* aborted */
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const items = useMemo(() => {
    const nav = NAV.filter((n) => !q || n.label.toLowerCase().includes(q.toLowerCase())).map((n) => ({ key: n.href, label: n.label, hint: "Go to", go: () => router.push(n.href) }));
    const assets = results.map((r) => ({ key: `${r.chain}:${r.address}`, label: r.label, hint: r.kind === "contract" ? `Research ${r.chain} contract` : `${r.chain}${r.issuer ? " · " + r.issuer : ""}`, go: () => router.push(`/asset/${r.chain}/${r.address}`) }));
    return [...assets, ...nav];
  }, [results, q, router]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      items[idx]?.go();
      onClose();
    } else if (e.key === "Escape") onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/70 px-4 pt-[12vh] backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div role="dialog" aria-modal="true" aria-label="Command palette" className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl" initial={{ y: -8, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -8, scale: 0.98 }} transition={{ duration: 0.16 }} onClick={(e) => e.stopPropagation()}>
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Ticker, company, contract or mint…" aria-label="Search" className="w-full border-b border-line bg-transparent px-5 py-4 text-[15px] outline-none placeholder:text-faint" />
            <ul role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
              {items.map((it, i) => (
                <li key={it.key} role="option" aria-selected={i === idx}>
                  <button type="button" onMouseEnter={() => setIdx(i)} onClick={() => { it.go(); onClose(); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${i === idx ? "bg-raised text-fg" : "text-muted"}`}>
                    <span className="truncate">{it.label}</span>
                    <span className="ml-3 shrink-0 text-[11px] text-faint">{it.hint}</span>
                  </button>
                </li>
              ))}
              {q && results.length === 0 && <li className="px-3 py-2 text-xs text-faint">No verified token matches. Paste an exact contract or mint to research it.</li>}
              {rwaNote && <li className="px-3 py-2 text-xs text-faint">RWA catalogue search: {rwaNote}</li>}
            </ul>
            <div className="flex justify-between border-t border-line px-4 py-2 text-[11px] text-faint">
              <span>↑↓ navigate · ↵ open · esc close</span>
              <span>Identity is resolved by exact contract, never ticker alone</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
