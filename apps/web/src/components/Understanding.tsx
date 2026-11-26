import { useState } from "react";
import type { Scene } from "@lablens/engine";
import type { Understanding as U } from "../lib/sceneStore";
import { go } from "../lib/router";
import { Icon } from "./Icon";

/** "Did I understand this correctly?" — what was read, what was assumed, and how to fix it. */
export function Understanding({ scene, u }: { scene: Scene; u: U }) {
  const [dismissed, setDismissed] = useState(false);
  if (u.source === "example" || dismissed) return null;
  const pct = Math.round(u.confidence * 100);
  return (
    <section className="card p-4 grid gap-3 border-signal/40" aria-labelledby="understand-h">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="understand-h" className="font-display text-lg">
          Did I understand this correctly?
        </h2>
        <span className="chip">{u.source === "ai" ? "AI vision" : u.source === "offline" ? "offline parser" : "builder"}</span>
      </div>
      {u.imagePreview && <img src={u.imagePreview} alt="The photo that was read" className="max-h-28 rounded-lg border border-line justify-self-start" />}
      <p className="text-sm">
        I built: <strong>{scene.title}</strong>.
      </p>
      {scene.question && (
        <p className="text-sm">
          <span className="text-muted">Question:</span> {/[.?!]\s*$/.test(scene.question) ? scene.question : `${scene.question}.`}
        </p>
      )}
      <div className="grid gap-1">
        <div className="flex justify-between text-xs text-muted">
          <span>Confidence</span>
          <span className="num">{pct}%</span>
        </div>
        <div
          className="h-2 rounded-full bg-line overflow-hidden"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Parser confidence"
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: pct >= 75 ? "var(--ok)" : pct >= 50 ? "var(--f-friction)" : "var(--bad)" }}
          />
        </div>
      </div>
      {u.found.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-muted mb-1">Read from your problem</h3>
          <ul className="flex flex-wrap gap-1.5">
            {u.found.map((f) => (
              <li key={f} className="chip !text-ink">
                <Icon name="check" size={13} className="text-ok" /> {f}
              </li>
            ))}
          </ul>
        </div>
      )}
      {u.assumed.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-muted mb-1">Assumed (not in the problem)</h3>
          <ul className="text-sm list-disc pl-5 grid gap-0.5">
            {u.assumed.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      {u.uncertain.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-bad mb-1">Not sure about</h3>
          <ul className="text-sm list-disc pl-5">
            {u.uncertain.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      {u.repaired && <p className="text-xs text-muted">The first AI draft failed validation and was automatically repaired.</p>}
      <p className="text-xs text-muted">Anything wrong? Drag the sliders, or open the scene in the builder.</p>
      <div className="flex gap-2 flex-wrap">
        <button className="btn btn-primary !min-h-10 text-sm" onClick={() => setDismissed(true)}>
          Yes, looks right
        </button>
        <button className="btn !min-h-10 text-sm" onClick={() => go("build")}>
          Fix it in the builder
        </button>
      </div>
    </section>
  );
}
