import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyParam, describeMoment, describeScene, exampleScene, fmt, paramValue, type Scene, type SimOutput } from "@lablens/engine";
import { SceneView } from "../components/SceneView";
import { VerificationPanel } from "../components/Verification";
import { Timeline } from "../components/Timeline";
import { Params } from "../components/Params";
import { FreeBody } from "../components/FreeBody";
import { Plot } from "../components/Plot";
import { ProblemInput } from "../components/ProblemInput";
import { Understanding } from "../components/Understanding";
import { EventLog, type LabEvent } from "../components/EventLog";
import { Tutor } from "../components/Tutor";
import { simulate } from "../lib/worker";
import { setScene, useSceneState } from "../lib/sceneStore";
import { prefersReducedMotion, setSettings, useSettings } from "../lib/settings";
import { frameAt, plotsFor, type PlotSpec } from "../lib/series";
import { decodeScene, SHARE_PREFIX, shareUrl } from "../lib/share";
import { earcon, sonify } from "../lib/sonify";
import { Icon } from "../components/Icon";

/** Same structure ⇒ an older result can stay on screen while a slider tweak re-simulates. */
function compatible(a: Scene, b: Scene): boolean {
  if (a.domain !== b.domain || a.id !== b.id) return false;
  if (a.mechanics && b.mechanics)
    return (
      a.mechanics.bodies.length === b.mechanics.bodies.length &&
      a.mechanics.ropes.length === b.mechanics.ropes.length &&
      a.mechanics.links.length === b.mechanics.links.length &&
      a.mechanics.springs.length === b.mechanics.springs.length
    );
  if (a.circuit && b.circuit) return a.circuit.components.length === b.circuit.components.length && a.circuit.nodes.length === b.circuit.nodes.length;
  if (a.optics && b.optics) return a.optics.elements.length === b.optics.elements.length && a.optics.sources.length === b.optics.sources.length;
  return false;
}

function useSimulation(scene: Scene) {
  const [res, setRes] = useState<{ scene: Scene; output: SimOutput; ms: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);
  useEffect(() => {
    const id = ++latest.current;
    const t = setTimeout(() => {
      simulate(scene)
        .then((r) => {
          if (id !== latest.current) return;
          setRes({ scene, output: r.output, ms: r.ms });
          setError(null);
        })
        .catch((e: Error) => id === latest.current && setError(e.message));
    }, 30);
    return () => clearTimeout(t);
  }, [scene]);
  const usable = res && (res.scene === scene || compatible(res.scene, scene)) ? res : null;
  return { output: usable?.output ?? null, ms: usable?.ms, error };
}

function timesOf(out: SimOutput | null): number[] {
  if (!out || out.domain === "optics") return [0];
  return out.result.frames.map((f) => f.t);
}

function eventsOf(out: SimOutput | null): LabEvent[] {
  if (!out) return [];
  if (out.domain === "mechanics") return out.result.events.map((e) => ({ t: e.t, message: e.message }));
  if (out.domain === "circuits") return out.result.events;
  return [];
}

export function Lab({ exampleId }: { exampleId?: string }) {
  const { scene, understanding } = useSceneState();
  const settings = useSettings();
  const { output, ms, error } = useSimulation(scene);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState<number | null>(0);
  const [announce, setAnnounce] = useState("");
  const [fullText, setFullText] = useState(false);
  const [notice, setNotice] = useState("");
  const [pinned, setPinned] = useState<{ key: string; values: Record<string, number>; plots: PlotSpec[] } | null>(null);
  useEffect(() => {
    if (!notice) return;
    setAnnounce(notice);
    const id = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(id);
  }, [notice]);
  const share = async () => {
    try {
      const url = await shareUrl(scene);
      history.replaceState(null, "", url);
      loadedExample.current = location.hash.replace(/^#\/lab\//, "");
      await navigator.clipboard.writeText(url);
      setNotice("Link copied. Anyone who opens it gets this exact lab, with your slider values.");
    } catch {
      setNotice("Couldn't copy automatically. The link is now in the address bar; copy it from there.");
    }
  };
  const loadedExample = useRef<string | undefined>(undefined);

  // deep link: #/lab/<example-id>
  useEffect(() => {
    if (exampleId && exampleId !== loadedExample.current) {
      loadedExample.current = exampleId;
      if (exampleId.startsWith(SHARE_PREFIX)) {
        // a shared lab: the scene travels inside the link
        decodeScene(exampleId)
          .then((sc) => {
            setScene(sc, { source: "example", confidence: 1, found: [], assumed: [], uncertain: [] });
            setNotice(`Opened a shared lab: ${sc.title}.`);
          })
          .catch((e: Error) => setNotice(e.message));
        return;
      }
      try {
        setScene(exampleScene(exampleId), { source: "example", confidence: 1, found: [], assumed: [], uncertain: [] });
      } catch {
        /* unknown id: keep current scene */
      }
    }
  }, [exampleId]);

  const matching = output;
  const times = useMemo(() => timesOf(matching), [matching]);
  const duration = times[times.length - 1] ?? 0;
  const frame = frameAt(times, t);
  const events = useMemo(() => eventsOf(matching), [matching]);
  const plots = useMemo(() => (matching ? plotsFor(scene, matching) : []), [scene, matching]);
  // circuits run in micro/milliseconds: play the whole run in ~6 s of wall time
  const timeScale = scene.domain === "circuits" && duration > 0 ? duration / 6 : 1;

  // restart playback when a different scene (not a slider tweak) arrives
  const sceneKey = scene.id + scene.domain;
  useEffect(() => {
    setT(0);
    setPlaying(true);
    setSelected(scene.domain === "mechanics" ? 0 : null);
    setPinned(null);
  }, [sceneKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep the playhead inside a shorter run after parameter changes
  useEffect(() => {
    if (t > duration) setT(duration);
  }, [duration]); // eslint-disable-line react-hooks/exhaustive-deps

  // animation loop
  useEffect(() => {
    if (!playing || !matching || matching.domain === "optics") return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setT((prev) => {
        const next = prev + dt * speed * timeScale;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, matching, speed, timeScale, duration]);

  // narration: announce events as the playhead passes them
  const lastT = useRef(0);
  useEffect(() => {
    if (settings.narration) {
      const passed = events.filter((e) => e.t > lastT.current + 1e-12 && e.t <= t + 1e-12);
      if (passed.length) {
        setAnnounce(passed.map((e) => `${e.message} at t = ${fmt(e.t, "s")}`).join(". "));
        earcon("event");
      }
    }
    lastT.current = t;
  }, [t, events, settings.narration]);

  const pinnedHere = pinned && pinned.key === sceneKey ? pinned : null;
  const changed = pinnedHere
    ? scene.params
        .map((p) => ({ label: p.label, unit: p.unit ?? "", was: pinnedHere.values[p.id], now: paramValue(scene, p.id) ?? NaN }))
        .filter((c) => Number.isFinite(c.was) && Number.isFinite(c.now) && Math.abs(c.was - c.now) > 1e-12 * Math.max(1, Math.abs(c.was)))
    : [];
  const pin = () => {
    setPinned({ key: sceneKey, values: Object.fromEntries(scene.params.map((p) => [p.id, paramValue(scene, p.id) ?? NaN])), plots });
    setAnnounce("Run pinned. Its graphs stay as dashed lines while you change the sliders.");
  };

  const onParam = useCallback(
    (id: string, v: number) => {
      try {
        setScene(applyParam(scene, id, v));
      } catch (e) {
        setAnnounce(`Couldn't apply that value: ${(e as Error).message}`);
      }
    },
    [scene],
  );

  // keyboard shortcuts (ignored while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const step = times.length > 1 ? times[1] - times[0] : 0.016;
      if (e.key === " ") {
        e.preventDefault();
        if (t >= duration) setT(0);
        setPlaying((p) => !p);
      } else if (e.key === "ArrowRight") {
        setPlaying(false);
        setT((x) => Math.min(duration, x + step * (e.shiftKey ? 10 : 1)));
      } else if (e.key === "ArrowLeft") {
        setPlaying(false);
        setT((x) => Math.max(0, x - step * (e.shiftKey ? 10 : 1)));
      } else if (e.key === "Home") setT(0);
      else if (e.key === "End") setT(duration);
      else if (e.key.toLowerCase() === "f") setSettings({ forces: !settings.forces });
      else if (e.key.toLowerCase() === "v") setSettings({ velocity: !settings.velocity });
      else if (e.key.toLowerCase() === "d" && matching) setAnnounce(describeMoment(scene, matching, frame));
      else if (e.key.toLowerCase() === "s") setAnnounce(describeScene(scene));
      else if (e.key.toLowerCase() === "l" && plots[0]) {
        const s = plots[0].series[plots[0].listenIndex];
        setAnnounce(`Playing ${s.label} as sound. Low pitch is low value; it pans left to right over time.`);
        sonify(s.ys);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [t, duration, times, settings.forces, settings.velocity, matching, scene, frame, plots]);

  const seek = (x: number) => {
    setPlaying(false);
    setT(Math.max(0, Math.min(duration, x)));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_360px] items-start">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </div>

      {/* Below lg the three columns dissolve (display: contents) and the cards reorder so the
          sliders sit right under the bench on a phone; from lg up each column is its own stack. */}
      {/* left: input + understanding + sliders */}
      <div className="contents lg:grid lg:gap-4 lg:order-1">
        <div id="problem" className="order-5 lg:order-none grid scroll-mt-20">
          <ProblemInput />
        </div>
        {understanding && (
          <div className="order-2 lg:order-none grid">
            <Understanding scene={scene} u={understanding} />
          </div>
        )}
        <section className="card p-4 grid gap-3 order-4 lg:order-none" aria-labelledby="params-h">
          <h2 id="params-h" className="font-display text-xl">
            What if…?
          </h2>
          <Params scene={scene} onChange={onParam} />
        </section>
      </div>

      {/* centre: the bench */}
      <div className="contents lg:grid lg:gap-4 lg:order-2 lg:min-w-0">
        <section className="card overflow-hidden order-1 lg:order-none min-w-0" aria-labelledby="bench-h">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 px-4 pt-3">
            <div className="min-w-0">
              <h1 id="bench-h" className="font-display text-2xl sm:text-3xl leading-tight">
                {scene.title}
              </h1>
              {scene.problemText && (
                <p className="text-sm text-muted mt-1 max-w-[70ch]">
                  <span className={fullText ? "" : "line-clamp-2"}>{scene.problemText}</span>
                  {scene.problemText.length > 120 && (
                    <button
                      className="text-ink underline decoration-line hover:decoration-ink font-medium"
                      aria-expanded={fullText}
                      onClick={() => setFullText((f) => !f)}
                    >
                      {fullText ? "Show less" : "Read the full problem"}
                    </button>
                  )}
                </p>
              )}
              <a
                href="#problem"
                className="lg:hidden inline-flex items-center gap-1.5 mt-2 text-sm font-medium text-signal"
                onClick={(e) => {
                  e.preventDefault();
                  const el = document.getElementById("problem");
                  el?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
                  el?.querySelector<HTMLElement>("textarea, [role=tab][aria-selected=true]")?.focus({ preventScroll: true });
                }}
              >
                <Icon name="edit" size={15} /> Try your own problem
              </a>
            </div>
            <div className="flex gap-1.5 shrink-0 flex-wrap sm:justify-end">
              <button className="chip !py-1 hover:!border-ink hover:!text-ink" onClick={() => void share()} title="Copy a link to this exact lab">
                <Icon name="link" size={14} /> Share
              </button>
              {scene.domain === "mechanics" && (
                <div className="flex gap-1.5" role="group" aria-label="Overlays">
                  <button
                    className={`chip !py-1 ${settings.forces ? "!border-ink !text-ink" : ""}`}
                    aria-pressed={settings.forces}
                    onClick={() => setSettings({ forces: !settings.forces })}
                  >
                    Forces (F)
                  </button>
                  <button
                    className={`chip !py-1 ${settings.velocity ? "!border-ink !text-ink" : ""}`}
                    aria-pressed={settings.velocity}
                    onClick={() => setSettings({ velocity: !settings.velocity })}
                  >
                    Velocity (V)
                  </button>
                </div>
              )}
            </div>
          </div>
          {notice && (
            <p role="status" className="mx-4 mt-2 rounded-lg bg-ink text-paper text-sm px-3 py-2 settle">
              {notice}
            </p>
          )}
          <div className="relative aspect-[4/3] sm:aspect-auto sm:h-[52vh] sm:min-h-[300px] sm:max-h-[560px]">
            <SceneView scene={scene} output={matching} frame={frame} selected={selected} onSelect={(i) => i !== null && setSelected(i)} />
            {error && (
              <div role="alert" className="absolute inset-x-4 bottom-4 card p-3 text-sm text-bad">
                Simulation error: {error}
              </div>
            )}
          </div>
          {scene.domain !== "optics" && (
            <div className="px-4 pb-4">
              <Timeline
                t={t}
                duration={duration}
                playing={playing}
                speed={speed}
                disabled={!matching}
                onToggle={() => {
                  if (t >= duration) setT(0);
                  setPlaying((p) => !p);
                }}
                onSeek={seek}
                onSpeed={setSpeed}
                onRestart={() => {
                  setT(0);
                  setPlaying(true);
                }}
                scaleNote={timeScale < 0.5 ? `slow motion ×${fmt(1 / timeScale, "", 2)}` : undefined}
              />
            </div>
          )}
        </section>

        <div className="order-3 lg:order-none grid">
          <VerificationPanel v={matching?.verification ?? null} ms={ms} />
        </div>

        {plots.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 order-6 lg:order-none">
            <div className="md:col-span-2 card px-4 py-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
              {pinnedHere ? (
                <p className="min-w-0">
                  <span className="font-semibold">Comparing with your pinned run</span>{" "}
                  <span className="text-muted">
                    {changed.length
                      ? `(dashed lines): ${changed.map((c) => `${c.label} was ${fmt(c.was, c.unit)}`).join(", ")}`
                      : "(dashed lines). Move a slider to see the difference."}
                  </span>
                </p>
              ) : (
                <p className="text-muted min-w-0">Pin this run, then move a slider to compare the graphs before and after.</p>
              )}
              <button className="btn !min-h-9 !px-3 text-sm shrink-0" aria-pressed={!!pinnedHere} onClick={() => (pinnedHere ? setPinned(null) : pin())}>
                <Icon name={pinnedHere ? "x" : "pin"} size={16} /> {pinnedHere ? "Unpin" : "Pin this run"}
              </button>
            </div>
            {plots.map((p, i) => (
              <Plot
                key={p.id}
                ghost={pinnedHere ? pinnedHere.plots.find((g) => g.id === p.id) : undefined}
                spec={p}
                cursorX={p.logX ? undefined : t}
                onSeek={p.logX ? undefined : seek}
                className={plots.length % 2 === 1 && i === plots.length - 1 ? "md:col-span-2" : ""}
              />
            ))}
          </div>
        )}

        {matching?.domain === "optics" && (
          <section className="card p-4 order-6 lg:order-none" aria-labelledby="rays-h">
            <h2 id="rays-h" className="font-display text-lg mb-2">
              What the light did
            </h2>
            <ul className="text-sm grid gap-1 num">
              {matching.result.events
                .filter((e) => e.kind === "refraction" || e.kind === "tir")
                .slice(0, 8)
                .map((e, i) => (
                  <li key={i}>
                    ray {e.rayIndex + 1}: {e.kind === "tir" ? "total internal reflection" : "refraction"} · n {e.n1} → {e.n2} · θ₁ {e.thetaIn?.toFixed(2)}°
                    {e.thetaOut !== undefined ? ` · θ₂ ${e.thetaOut.toFixed(2)}°` : ""}
                  </li>
                ))}
              {matching.result.events.every((e) => e.kind !== "refraction" && e.kind !== "tir") && (
                <li>{matching.result.rays.length} rays traced through ideal elements.</li>
              )}
            </ul>
          </section>
        )}
      </div>

      {/* right: free-body diagram, events, tutor */}
      <div className="grid gap-4 order-7 lg:order-3 lg:col-span-2 xl:col-span-1 md:grid-cols-2 xl:grid-cols-1 items-start">
        {scene.domain === "mechanics" && selected !== null && (
          <section className="card p-4" aria-labelledby="fbd-h">
            <h2 id="fbd-h" className="font-display text-xl mb-1">
              Free-body diagram
            </h2>
            <p className="text-xs text-muted mb-2">Generated from the scene graph at t = {fmt(t, "s")}. Tap a body on the bench to switch.</p>
            <FreeBody scene={scene} output={matching} frame={frame} selected={Math.min(selected, scene.mechanics!.bodies.length - 1)} onSelect={setSelected} />
          </section>
        )}
        {scene.domain !== "optics" && (
          <section className="card p-4" aria-labelledby="events-h">
            <h2 id="events-h" className="font-display text-xl mb-2">
              Timeline of events
            </h2>
            <EventLog events={events} t={t} onSeek={seek} />
          </section>
        )}
        <Tutor scene={scene} output={matching} frame={frame} events={events.map((e) => `${fmt(e.t, "s")}: ${e.message}`)} onApply={onParam} />
      </div>
    </div>
  );
}
