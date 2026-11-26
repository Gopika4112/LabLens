/**
 * Plain-language descriptions for screen readers and the AI tutor.
 * Generated deterministically from the Scene Graph and simulation state — no AI needed.
 */
import type { Scene, Component, OpticalElement } from "./schema/scene";
import type { SimOutput } from "./run";
import { fmt } from "./format";

const angleOf = (from: { x: number; y: number }, to: { x: number; y: number }) =>
  Math.round((Math.atan2(Math.abs(to.y - from.y), Math.abs(to.x - from.x)) * 180) / Math.PI);

function componentPhrase(c: Component): string {
  switch (c.type) {
    case "resistor":
      return `a ${fmt(c.resistance, "Ω")} resistor${c.label ? ` (${c.label})` : ""}`;
    case "lamp":
      return `a ${fmt(c.resistance, "Ω")} lamp`;
    case "capacitor":
      return `a ${fmt(c.capacitance, "F")} capacitor${c.initialVoltage ? ` charged to ${fmt(c.initialVoltage, "V")}` : ""}`;
    case "inductor":
      return `a ${fmt(c.inductance, "H")} inductor`;
    case "voltageSource":
      return c.acAmplitude > 0 ? `an AC source (${fmt(c.acAmplitude, "V")}, ${fmt(c.frequency, "Hz")})` : `a ${fmt(c.voltage, "V")} battery`;
    case "currentSource":
      return `a ${fmt(c.current, "A")} current source`;
    case "switch":
      return c.closeAt > 0 ? `a switch that closes at ${fmt(c.closeAt, "s")}` : "a closed switch";
  }
}

function elementPhrase(e: OpticalElement): string {
  switch (e.type) {
    case "thinLens":
      return `a ${e.focalLength > 0 ? "converging" : "diverging"} lens with focal length ${fmt(Math.abs(e.focalLength), "m")} at x = ${fmt(e.position.x)} m`;
    case "planeMirror":
      return "a flat mirror";
    case "sphericalMirror":
      return `a ${e.concave ? "concave" : "convex"} mirror of radius ${fmt(e.radius, "m")}`;
    case "block":
      return `a ${e.vertices.length === 3 ? "triangular prism" : "block"} of material with refractive index ${e.refractiveIndex}`;
    case "sphericalLens":
      return `a glass lens (n = ${e.refractiveIndex}) with surface radii ${e.r1} m and ${e.r2} m`;
    case "semicircle":
      return `a semicircular glass block (n = ${e.refractiveIndex})`;
    case "screen":
      return "a screen";
  }
}

export function describeScene(scene: Scene): string {
  const out: string[] = [`${scene.title}.`];
  const m = scene.mechanics;
  if (m) {
    const name = (id: string) => {
      const b = m.bodies.find((x) => x.id === id);
      return b?.label ? `the ${b.label.toLowerCase()}` : id;
    };
    for (const b of m.bodies) {
      let s = `${b.label ?? b.id}: a ${fmt(b.mass, "kg")} ${b.shape}`;
      if (b.onSurface) {
        const surf = m.surfaces.find((x) => x.id === b.onSurface)!;
        const ang = angleOf(surf.from, surf.to);
        s += ang > 0 ? ` resting on a ${ang}° ${surf.kind}` : ` on a flat ${surf.kind}`;
        if (surf.muKinetic > 0) s += ` with friction coefficient ${surf.muKinetic}`;
      }
      const sp = Math.hypot(b.velocity.x, b.velocity.y);
      if (sp > 0) s += `, moving at ${fmt(sp, "m/s")}`;
      if (b.dragQuadratic > 0) s += `, with air resistance`;
      out.push(s + ".");
    }
    for (const r of m.ropes) {
      const over = r.via.length ? ` over ${r.via.length === 1 || new Set(r.via.map((v) => v.pulley)).size === 1 ? "a pulley" : `${r.via.length} pulleys`}` : "";
      out.push(`A rope runs from ${name(r.bodyA)}${over} to ${r.bodyB ? name(r.bodyB) : "a fixed point"}.`);
    }
    for (const s of m.springs)
      out.push(`A spring (k = ${fmt(s.k, "N/m")}) connects ${name(s.bodyA)} to ${s.bodyB ? name(s.bodyB) : "a wall"}${s.damping ? " with some damping" : ""}.`);
    for (const l of m.links) out.push(`${name(l.body)} hangs from a fixed pivot on a ${l.kind}${l.length ? ` ${fmt(l.length, "m")} long` : ""}.`);
    out.push(`Gravity is ${fmt(m.gravity, "m/s²")}.`);
  }
  const c = scene.circuit;
  if (c) {
    const parts = c.components.map(componentPhrase);
    out.push(`The circuit contains ${parts.slice(0, -1).join(", ")}${parts.length > 1 ? " and " : ""}${parts[parts.length - 1]}.`);
    for (const k of c.components) out.push(`${k.label ?? k.id} connects node ${k.a} to node ${k.b}.`);
  }
  const o = scene.optics;
  if (o) {
    out.push(`The optical bench has ${o.elements.map(elementPhrase).join(", ") || "no elements"}.`);
    for (const s of o.sources)
      out.push(
        s.type === "point"
          ? `A point light source at (${fmt(s.origin.x)}, ${fmt(s.origin.y)}) m sends ${s.count} rays.`
          : s.type === "beam"
            ? `A parallel beam of ${s.count} rays travels at ${s.angle}°.`
            : `A single ray starts at (${fmt(s.origin.x)}, ${fmt(s.origin.y)}) m heading at ${s.angle}°.`,
      );
  }
  if (scene.question) out.push(`The problem asks for the ${scene.question}.`);
  return out.join(" ");
}

/** A short status sentence for the current instant (spoken on demand, key "D"). */
export function describeMoment(scene: Scene, out: SimOutput, frameIndex: number): string {
  if (out.domain === "mechanics") {
    const f = out.result.frames[Math.min(frameIndex, out.result.frames.length - 1)];
    const parts = scene.mechanics!.bodies.map((b, i) => {
      const s = Math.hypot(f.bodies[i].vx, f.bodies[i].vy);
      return `${b.label ?? b.id} ${s < 1e-3 ? "is at rest" : `moves at ${fmt(s, "m/s")}`}`;
    });
    const T = f.ropeTension.length ? `, rope tension ${fmt(f.ropeTension[0], "N")}` : "";
    return `At t = ${fmt(f.t, "s")}: ${parts.join("; ")}${T}.`;
  }
  if (out.domain === "circuits") {
    const f = out.result.frames[Math.min(frameIndex, out.result.frames.length - 1)];
    const parts = scene
      .circuit!.components.filter((c) => c.type !== "switch")
      .map((c) => {
        const k = scene.circuit!.components.indexOf(c);
        return `${c.label ?? c.id}: ${fmt(Math.abs(f.compV[k]), "V")}, ${fmt(Math.abs(f.compI[k]), "A")}`;
      });
    return `At t = ${fmt(f.t, "s")}: ${parts.join("; ")}.`;
  }
  const tir = out.result.events.filter((e) => e.kind === "tir").length;
  const refr = out.result.events.filter((e) => e.kind === "refraction").length;
  return `${out.result.rays.length} rays traced: ${refr} refractions${tir ? `, ${tir} total internal reflections` : ""}.`;
}
