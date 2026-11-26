import { useSyncExternalStore } from "react";

export interface Settings {
  theme: "system" | "light" | "dark";
  font: "default" | "dyslexic";
  motion: "system" | "reduced";
  size: "normal" | "large";
  narration: boolean;
  forces: boolean;
  velocity: boolean;
}

const KEY = "lablens:settings";
const DEFAULTS: Settings = { theme: "system", font: "default", motion: "system", size: "normal", narration: true, forces: true, velocity: false };

function load(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const subs = new Set<() => void>();

function apply(s: Settings) {
  const root = document.documentElement;
  if (s.theme === "system") delete root.dataset.theme;
  else root.dataset.theme = s.theme;
  root.dataset.font = s.font;
  root.dataset.motion = s.motion;
  root.dataset.size = s.size;
}
if (typeof document !== "undefined") apply(current);

export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode: settings just won't persist */
  }
  apply(current);
  subs.forEach((f) => f());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => current,
    () => DEFAULTS,
  );
}

export function prefersReducedMotion(): boolean {
  if (current.motion === "reduced") return true;
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
