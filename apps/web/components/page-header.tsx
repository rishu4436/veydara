import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, sub, right }: { eyebrow: string; title: string; sub?: string; right?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 font-display text-[34px] leading-[1.1] tracking-[-0.01em] md:text-[42px]">{title}</h1>
        {sub && <p className="mt-3 text-[14.5px] leading-6 text-muted">{sub}</p>}
      </div>
      {right}
    </header>
  );
}
