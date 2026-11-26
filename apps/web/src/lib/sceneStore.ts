import { useSyncExternalStore } from "react";
import { exampleScene, validateScene, type Scene } from "@lablens/engine";

export interface Understanding {
  source: "example" | "offline" | "ai" | "builder";
  confidence: number;
  found: string[];
  assumed: string[];
  uncertain: string[];
  repaired?: boolean;
  imagePreview?: string;
}

interface State {
  scene: Scene;
  understanding: Understanding | null;
}

const KEY = "lablens:lastScene";

function initial(): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const v = validateScene(JSON.parse(raw));
      if (v.ok) return { scene: v.scene, understanding: null };
    }
  } catch {
    /* ignore */
  }
  return { scene: exampleScene("incline-pulley"), understanding: { source: "example", confidence: 1, found: [], assumed: [], uncertain: [] } };
}

let state: State = initial();
const subs = new Set<() => void>();

export function setScene(scene: Scene, understanding?: Understanding | null) {
  state = { scene, understanding: understanding === undefined ? state.understanding : understanding };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(scene));
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f());
}

export function getScene(): Scene {
  return state.scene;
}

export function useSceneState(): State {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
    () => state,
  );
}
