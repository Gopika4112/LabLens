import { useEffect, useRef } from "react";
import { Icon } from "./Icon";

const GROUPS: { title: string; keys: [string[], string][] }[] = [
  {
    title: "Playback",
    keys: [
      [["Space"], "Play or pause"],
      [["←", "→"], "Step one frame (hold Shift for ×10)"],
      [["Home", "End"], "Jump to the start or end"],
    ],
  },
  {
    title: "See and hear",
    keys: [
      [["F"], "Show or hide force arrows"],
      [["V"], "Show or hide velocity arrows"],
      [["L"], "Listen to the first graph as sound"],
    ],
  },
  {
    title: "Screen reader",
    keys: [
      [["S"], "Describe the whole scene"],
      [["D"], "Describe this moment"],
    ],
  },
  { title: "Anywhere", keys: [[["?"], "Open this list"]] },
];

const OPEN_EVENT = "lablens:keyboard-help";
export const openKeyboardHelp = () => window.dispatchEvent(new Event(OPEN_EVENT));

/** The shortcut sheet: a native <dialog>, so focus trapping and Escape come from the browser. */
export function KeyboardHelp() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const open = () => ref.current && !ref.current.open && ref.current.showModal();
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?") {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener(OPEN_EVENT, open);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, open);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="keys-h"
      className="card m-auto p-0 w-[min(92vw,440px)] text-ink backdrop:bg-ink/45"
      onClick={(e) => e.target === ref.current && ref.current.close()}
    >
      <div className="p-5 grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="keys-h" className="font-display text-xl">
            Keyboard shortcuts
          </h2>
          <button className="btn btn-ghost !min-h-9 !w-9 !px-0" onClick={() => ref.current?.close()} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <p className="text-sm text-muted -mt-2">They work on the lab page whenever you're not typing in a box.</p>
        {GROUPS.map((g) => (
          <section key={g.title} className="grid gap-1.5">
            <h3 className="text-sm font-semibold">{g.title}</h3>
            <dl className="grid gap-1.5">
              {g.keys.map(([keys, what]) => (
                <div key={what} className="flex items-center justify-between gap-4 text-sm">
                  <dt className="text-muted">{what}</dt>
                  <dd className="flex gap-1 shrink-0">
                    {keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  );
}
