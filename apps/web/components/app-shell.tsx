"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { NAV } from "./nav";
import { I } from "./icons";
import { CommandPalette } from "./command-palette";
import { WalletButton } from "./wallet-button";
import { CapabilityBadge } from "./badge";
import { getJson, type CapabilitiesResponse } from "@/lib/client/api";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [palette, setPalette] = useState(false);
  const [alerts, setAlerts] = useState(false);
  const [drawer, setDrawer] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const caps = useQuery({ queryKey: ["capabilities"], queryFn: () => getJson<CapabilitiesResponse>("/api/capabilities"), staleTime: 60_000 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    const openPalette = () => setPalette(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("veydara:open-palette", openPalette);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("veydara:open-palette", openPalette);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const cmcLive = caps.data?.capabilities.find((c) => c.id === "cmc.quotes");
  const rwaCap = caps.data?.capabilities.find((c) => c.id === "cmc.rwa.quotes");

  return (
    <div className="grain flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      {/* Desktop sidebar */}
      <aside className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-ink/60 backdrop-blur md:flex ${collapsed ? "w-[68px]" : "w-[232px]"} transition-[width] duration-200`} aria-label="Primary">
        <div className="flex h-16 items-center gap-2 px-4">
          <Mark />
          {!collapsed && <span className="font-display text-[19px] tracking-[0.18em]">VEYDARA</span>}
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            const Icon = n.icon;
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} title={collapsed ? n.label : undefined} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] transition-colors ${active ? "bg-raised text-fg" : "text-muted hover:bg-surface hover:text-fg"}`}>
                <Icon className={active ? "text-mint" : ""} />
                {!collapsed && <span>{n.label}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-1 px-2 pb-4">
          <button type="button" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[12.5px] text-muted hover:bg-surface" aria-label="Toggle colour theme">
            <I.sun />
            {!collapsed && <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
          </button>
          <button type="button" onClick={() => setCollapsed((c) => !c)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[12.5px] text-muted hover:bg-surface" aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>
            <I.panel />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-base/80 px-4 backdrop-blur md:px-6">
          <div className="md:hidden"><Mark /></div>
          <button type="button" onClick={() => setPalette(true)} className="flex h-10 min-w-0 flex-1 items-center gap-3 rounded-xl border border-line bg-surface px-3 text-left text-sm text-faint hover:border-faint md:max-w-md">
            <I.discover />
            <span className="truncate">Search ticker, company, contract…</span>
            <kbd className="ml-auto hidden rounded border border-line px-1.5 text-[10px] text-faint sm:inline">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 lg:flex" aria-label="Data source status">
              {cmcLive && <span className="text-[11px] text-faint">CMC</span>}
              {cmcLive && <CapabilityBadge status={cmcLive.status} title={cmcLive.reason} />}
              {rwaCap && <span className="ml-1 text-[11px] text-faint">RWA</span>}
              {rwaCap && <CapabilityBadge status={rwaCap.status} title={rwaCap.reason} />}
            </div>
            <div className="relative">
              <button type="button" onClick={() => setAlerts((a) => !a)} aria-expanded={alerts} aria-label="Alerts" className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface text-muted hover:text-fg">
                <I.bell />
              </button>
              {alerts && (
                <div className="absolute right-0 top-12 z-40 w-72 rounded-2xl border border-line bg-raised p-4 text-sm shadow-2xl">
                  <p className="eyebrow mb-2">Alert center</p>
                  <p className="text-muted">No alerts. Guardian monitoring is off — nothing is being watched yet, so no alerts can fire.</p>
                  <Link href="/guardian" className="mt-3 inline-block text-xs text-ice" onClick={() => setAlerts(false)}>Guardian status →</Link>
                </div>
              )}
            </div>
            <WalletButton />
            <button type="button" onClick={() => setDrawer((d) => !d)} className="hidden h-10 w-10 place-items-center rounded-xl border border-line bg-surface text-muted hover:text-fg 2xl:grid" aria-label="Toggle insights drawer">
              <I.panel />
            </button>
          </div>
        </header>

        <div className="flex min-w-0 flex-1">
          <main id="main" className="min-w-0 flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-12">{children}</main>
          {drawer && (
            <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-[300px] shrink-0 overflow-y-auto border-l border-line px-5 py-6 2xl:block" aria-label="Source health">
              <p className="eyebrow mb-3">Source health</p>
              {caps.isLoading && <p className="text-xs text-faint">Probing data sources…</p>}
              {caps.error && <p className="text-xs text-danger">Capability check failed.</p>}
              <ul className="space-y-3">
                {caps.data?.capabilities
                  .filter((c) => c.pillar === "discover" || c.id === "aave.oracle")
                  .map((c) => (
                    <li key={c.id} className="text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-fg">{c.label}</span>
                        <CapabilityBadge status={c.status} />
                      </div>
                      <p className="mt-1 leading-4 text-faint">{c.reason}</p>
                    </li>
                  ))}
              </ul>
              <Link href="/proof" className="mt-5 inline-block text-xs text-ice">Full capability matrix &amp; credit ledger →</Link>
            </aside>
          )}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-base/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Primary mobile">
        {[NAV[0], NAV[1], NAV[2], NAV[6], NAV[7]].map((n) => {
          const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-1 py-2.5 text-[10.5px] ${active ? "text-mint" : "text-muted"}`}>
              <Icon />
              {n.short}
            </Link>
          );
        })}
      </nav>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}

function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="var(--color-line)" />
      <path d="M8 9.5 16 24l8-14.5" fill="none" stroke="var(--color-mint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="16" r="2" fill="var(--color-ice)" />
    </svg>
  );
}
