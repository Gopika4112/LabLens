import { useEffect, useRef, useState } from "react";
import { setSettings, useSettings, type Settings } from "../lib/settings";
import type { Route } from "../lib/router";
import { Icon } from "./Icon";
import { openKeyboardHelp } from "./KeyboardHelp";

const NAV: { page: Route["page"]; label: string }[] = [
  { page: "lab", label: "Lab" },
  { page: "examples", label: "Examples" },
  { page: "build", label: "Builder" },
  { page: "accuracy", label: "Engine accuracy" },
  { page: "about", label: "About" },
];

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start justify-between gap-3 py-1.5 cursor-pointer">
      <span>
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="mt-1 w-5 h-5 accent-[var(--signal)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Header({ route }: { route: Route }) {
  const s = useSettings();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    panel.current?.querySelector<HTMLElement>("select, input")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings({ [k]: v } as Partial<Settings>);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
      <div className="max-w-[1600px] mx-auto px-4 h-16 flex items-center gap-4">
        <a href="#/" className="flex items-center gap-2 shrink-0" aria-label="LabLens home">
          <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden>
            <rect width="64" height="64" rx="14" fill="var(--ink)" />
            <circle cx="32" cy="32" r="17" fill="none" stroke="var(--paper)" strokeWidth="4" />
            <circle cx="32" cy="32" r="6" fill="var(--signal)" />
            <path d="M44 44l9 9" stroke="var(--paper)" strokeWidth="5" strokeLinecap="round" />
          </svg>
          <span className="font-display text-xl font-semibold tracking-tight">LabLens</span>
        </a>
        <nav aria-label="Main" className="hidden md:flex items-center gap-1">
          {NAV.map((n) => (
            <a
              key={n.page}
              href={`#/${n.page}`}
              aria-current={route.page === n.page ? "page" : undefined}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${route.page === n.page ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <button className="btn !min-h-10 text-sm" aria-expanded={open} aria-controls="a11y-panel" onClick={() => setOpen((o) => !o)}>
              <Icon name="contrast" size={16} /> Accessibility
            </button>
            {open && (
              <div
                ref={panel}
                id="a11y-panel"
                role="dialog"
                aria-label="Accessibility and display settings"
                className="absolute right-0 mt-2 w-[min(92vw,340px)] card p-4 grid gap-1 z-40"
              >
                <label className="flex items-center justify-between gap-3 py-1.5 text-sm font-medium">
                  Theme
                  <select className="field !py-1 w-auto" value={s.theme} onChange={(e) => set("theme", e.target.value as Settings["theme"])}>
                    <option value="system">Match system</option>
                    <option value="light">Light (paper)</option>
                    <option value="dark">Dark (instrument)</option>
                  </select>
                </label>
                <Toggle
                  label="Dyslexia-friendly font"
                  hint="OpenDyslexic with wider spacing"
                  checked={s.font === "dyslexic"}
                  onChange={(v) => set("font", v ? "dyslexic" : "default")}
                />
                <Toggle label="Larger text" checked={s.size === "large"} onChange={(v) => set("size", v ? "large" : "normal")} />
                <Toggle
                  label="Reduce motion"
                  hint="No ray reveal or flowing current; also follows your OS"
                  checked={s.motion === "reduced"}
                  onChange={(v) => set("motion", v ? "reduced" : "system")}
                />
                <Toggle
                  label="Narrate events"
                  hint="Screen readers hear “block reaches the pulley at t = 1.42 s”"
                  checked={s.narration}
                  onChange={(v) => set("narration", v)}
                />
                <button
                  className="btn !min-h-10 text-sm mt-2"
                  onClick={() => {
                    setOpen(false);
                    openKeyboardHelp();
                  }}
                >
                  <Icon name="keyboard" size={17} /> Keyboard shortcuts <kbd>?</kbd>
                </button>
              </div>
            )}
          </div>
          <button className="btn !min-h-10 md:hidden" aria-expanded={menu} aria-controls="mobile-nav" onClick={() => setMenu((m) => !m)} aria-label="Menu">
            <Icon name={menu ? "x" : "menu"} />
          </button>
        </div>
      </div>
      {menu && (
        <nav id="mobile-nav" aria-label="Main" className="md:hidden border-t border-line px-4 py-2 grid gap-1">
          {NAV.map((n) => (
            <a
              key={n.page}
              href={`#/${n.page}`}
              onClick={() => setMenu(false)}
              aria-current={route.page === n.page ? "page" : undefined}
              className={`px-3 py-2.5 rounded-lg font-medium ${route.page === n.page ? "bg-ink text-paper" : ""}`}
            >
              {n.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
