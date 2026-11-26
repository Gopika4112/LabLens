import { useEffect, useRef, useState } from "react";
import { describeScene, type Scene, type SimOutput } from "@lablens/engine";
import { useCanvas, type Camera } from "../lib/useCanvas";
import { drawMechanics, hitBody } from "./render/mechanics";
import { drawCircuit } from "./render/circuits";
import { drawOptics } from "./render/optics";
import { prefersReducedMotion, useSettings } from "../lib/settings";

interface Props {
  scene: Scene;
  output: SimOutput | null;
  frame: number;
  selected: number | null;
  onSelect?: (i: number | null) => void;
  height?: number | string;
  compact?: boolean;
}

/** The live lab bench: dispatches to the domain renderer and owns small ambient animations. */
export function SceneView({ scene, output, frame, selected, onSelect, height = "100%", compact }: Props) {
  const settings = useSettings();
  const cam = useRef<Camera | null>(null);
  const [clock, setClock] = useState(0);
  const [reveal, setReveal] = useState(1);
  const reduced = prefersReducedMotion();
  const matching = output && output.domain === scene.domain ? output : null;

  // ambient clock for circuit current dots
  useEffect(() => {
    if (scene.domain !== "circuits" || reduced || compact) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = () => {
      setClock((performance.now() - t0) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene.domain, reduced, compact]);

  // light "switches on" and propagates when an optics scene appears
  const opticsKey = scene.domain === "optics" ? scene.id + (scene.template ? JSON.stringify(scene.template.args) : "") : "";
  const lastOpticsId = useRef("");
  useEffect(() => {
    if (scene.domain !== "optics" || !matching) return;
    const firstShow = lastOpticsId.current !== scene.id;
    lastOpticsId.current = scene.id;
    if (reduced || compact || !firstShow) {
      setReveal(1);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = () => {
      const u = Math.min(1, (performance.now() - t0) / 1100);
      setReveal(1 - (1 - u) ** 3);
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opticsKey, !!matching]);

  const ref = useCanvas(
    (ctx, w, h) => {
      if (scene.domain === "mechanics")
        cam.current = drawMechanics(ctx, w, h, scene, matching?.domain === "mechanics" ? matching.result : null, {
          frame,
          forces: settings.forces && !compact,
          velocity: settings.velocity && !compact,
          selected,
          trail: !compact,
          thumb: compact,
        });
      else if (scene.domain === "circuits")
        cam.current = drawCircuit(ctx, w, h, scene, matching?.domain === "circuits" ? matching.result : null, {
          frame,
          clock,
          reducedMotion: reduced || !!compact,
          thumb: compact,
        });
      else cam.current = drawOptics(ctx, w, h, scene, matching?.domain === "optics" ? matching.result : null, { reveal, verification: matching?.verification });
    },
    [scene, matching, frame, selected, settings.forces, settings.velocity, settings.theme, clock, reveal, compact],
  );

  return (
    <canvas
      ref={ref}
      style={{ width: "100%", height, display: "block", touchAction: "manipulation" }}
      role="img"
      aria-label={compact ? scene.title : `Simulation view. ${describeScene(scene)}`}
      onPointerDown={(e) => {
        if (!onSelect || scene.domain !== "mechanics" || !cam.current) return;
        const r = e.currentTarget.getBoundingClientRect();
        onSelect(hitBody(scene, matching?.domain === "mechanics" ? matching.result : null, frame, cam.current, e.clientX - r.left, e.clientY - r.top));
      }}
    />
  );
}
