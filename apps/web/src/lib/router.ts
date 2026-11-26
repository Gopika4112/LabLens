import { useSyncExternalStore } from "react";

export type Route = { page: "lab" | "examples" | "build" | "accuracy" | "about"; arg?: string };

function parse(): Route {
  const h = (typeof location !== "undefined" ? location.hash : "").replace(/^#\/?/, "");
  const [page, arg] = h.split("/");
  if (page === "examples" || page === "build" || page === "accuracy" || page === "about") return { page, arg };
  if (page === "lab") return { page: "lab", arg };
  return { page: "lab" };
}

let route = parse();
const subs = new Set<() => void>();
if (typeof window !== "undefined")
  window.addEventListener("hashchange", () => {
    route = parse();
    subs.forEach((f) => f());
  });

export function useRoute(): Route {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => route,
    () => route,
  );
}

export function go(path: string) {
  location.hash = `#/${path}`;
}
