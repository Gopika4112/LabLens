/**
 * LabLens Scene Graph — schema version "1".
 *
 * The Scene Graph is the single contract shared by every part of LabLens:
 *   AI/offline parser  →  Scene Graph  →  engines (mechanics/circuits/optics)
 *                                     →  renderers, builder UI, tutor, narration
 *
 * All quantities are SI (kg, m, s, N, Ω, F, H, V, A). Angles are degrees in the
 * schema (what students read in problems) and converted to radians in engines.
 * Coordinates: x to the right, y UP (physics convention); renderers flip y.
 */
import { z } from "zod";

export const SCENE_VERSION = "1" as const;

const finite = () => z.number().refine(Number.isFinite, "must be a finite number");
const positive = () => finite().refine((v) => v > 0, "must be > 0");
const nonNeg = () => finite().refine((v) => v >= 0, "must be ≥ 0");

export const Vec2 = z.object({ x: finite(), y: finite() });
export type Vec2 = z.infer<typeof Vec2>;

const id = () =>
  z
    .string()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, "ids start with a letter and use letters, digits, _ or -");

/* ───────────────────────────── Mechanics ───────────────────────────── */

export const Body = z.object({
  id: id(),
  label: z.string().max(40).optional(),
  mass: positive(),
  shape: z.enum(["block", "ball"]).default("block"),
  /** Block: side length (m). Ball: diameter (m). Visual + collision size. */
  size: positive().default(0.4),
  position: Vec2,
  velocity: Vec2.default({ x: 0, y: 0 }),
  /** Id of a surface the body starts resting on (sliding contact). */
  onSurface: id().optional(),
  /** Quadratic air-drag coefficient c in F = −c|v|v (kg/m). */
  dragQuadratic: nonNeg().default(0),
  /** Linear drag coefficient b in F = −b v (kg/s). */
  dragLinear: nonNeg().default(0),
  /** Constant applied force (N), e.g. a push. */
  appliedForce: Vec2.optional(),
  /** Whether this body bounces off surfaces it is not resting on and other bodies. */
  collides: z.boolean().default(true),
});
export type Body = z.infer<typeof Body>;

export const Surface = z.object({
  id: id(),
  kind: z.enum(["floor", "incline", "table", "wall", "ramp"]).default("floor"),
  from: Vec2,
  to: Vec2,
  muStatic: nonNeg().default(0),
  muKinetic: nonNeg().default(0),
  /** Coefficient of restitution for bounces (0 = perfectly inelastic, 1 = elastic). */
  restitution: z.number().min(0).max(1).default(0.6),
});
export type Surface = z.infer<typeof Surface>;

export const Pulley = z.object({
  id: id(),
  position: Vec2,
  radius: positive().default(0.15),
});
export type Pulley = z.infer<typeof Pulley>;

/** Where on a pulley the rope leaves/arrives: the tangent point used as a fixed guide. */
export const PulleyPass = z.object({
  pulley: id(),
  side: z.enum(["left", "right", "top", "bottom"]),
});

/** Inextensible, massless rope from bodyA, over 0..n ideal pulleys, to bodyB or a fixed anchor. */
export const Rope = z.object({
  id: id(),
  bodyA: id(),
  bodyB: id().optional(),
  anchorB: Vec2.optional(),
  via: z.array(PulleyPass).default([]),
  /** Total length (m). If omitted, computed from the initial geometry (rope starts taut). */
  length: positive().optional(),
});
export type Rope = z.infer<typeof Rope>;

export const Spring = z.object({
  id: id(),
  bodyA: id(),
  bodyB: id().optional(),
  anchorB: Vec2.optional(),
  k: positive(),
  restLength: nonNeg(),
  /** Linear damping along the spring axis (N·s/m). */
  damping: nonNeg().default(0),
});
export type Spring = z.infer<typeof Spring>;

/** Pendulum string (taut-only) or rigid massless rod from a fixed pivot to a body. */
export const Link = z.object({
  id: id(),
  kind: z.enum(["string", "rod"]).default("string"),
  body: id(),
  pivot: Vec2,
  /** If omitted, computed from initial geometry. */
  length: positive().optional(),
});
export type Link = z.infer<typeof Link>;

export const MechanicsScene = z.object({
  gravity: nonNeg().default(9.81),
  bodies: z.array(Body).min(1).max(12),
  surfaces: z.array(Surface).default([]),
  pulleys: z.array(Pulley).default([]),
  ropes: z.array(Rope).default([]),
  springs: z.array(Spring).default([]),
  links: z.array(Link).default([]),
  integrator: z.enum(["rk4", "verlet", "symplectic-euler"]).default("rk4"),
  /** Internal timestep (s). Output is sampled at 60 Hz. */
  dt: positive().default(1 / 1200),
});
export type MechanicsScene = z.infer<typeof MechanicsScene>;

/* ───────────────────────────── Circuits ───────────────────────────── */

export const CircuitNode = z.object({
  id: id(),
  /** Grid position for the schematic (arbitrary units, ~1 per component length). */
  position: Vec2.optional(),
  /** Extra points of the same node; the renderer joins them with wire. */
  extra: z.array(Vec2).max(8).default([]),
});

const twoTerminal = {
  id: id(),
  label: z.string().max(40).optional(),
  /** Current is defined flowing from node a → node b through the component. */
  a: id(),
  b: id(),
};

export const Component = z.discriminatedUnion("type", [
  z.object({ ...twoTerminal, type: z.literal("resistor"), resistance: positive() }),
  z.object({
    ...twoTerminal,
    type: z.literal("capacitor"),
    capacitance: positive(),
    initialVoltage: finite().default(0),
  }),
  z.object({
    ...twoTerminal,
    type: z.literal("inductor"),
    inductance: positive(),
    initialCurrent: finite().default(0),
  }),
  /** Voltage source: V(a) − V(b) = voltage (+ amplitude·sin(2πft) if AC). */
  z.object({
    ...twoTerminal,
    type: z.literal("voltageSource"),
    voltage: finite(),
    acAmplitude: nonNeg().default(0),
    frequency: nonNeg().default(0),
  }),
  /** Current source pushing `current` from a → b through the source (into node b). */
  z.object({ ...twoTerminal, type: z.literal("currentSource"), current: finite() }),
  /** Ideal switch, closed for t ≥ closeAt (s), open before. Modeled as tiny/huge R. */
  z.object({
    ...twoTerminal,
    type: z.literal("switch"),
    closeAt: nonNeg().default(0),
  }),
  /** Lamp = resistor that glows in the renderer. */
  z.object({ ...twoTerminal, type: z.literal("lamp"), resistance: positive() }),
]);
export type Component = z.infer<typeof Component>;

export const CircuitScene = z.object({
  nodes: z.array(CircuitNode).min(2).max(40),
  components: z.array(Component).min(1).max(40),
  ground: id(),
  method: z.enum(["trapezoidal", "backward-euler"]).default("trapezoidal"),
  dt: positive().optional(),
  /** Optional AC sweep for frequency response (Hz). */
  acSweep: z.object({ source: id(), probe: id(), fStart: positive(), fStop: positive(), points: z.number().int().min(10).max(2000).default(400) }).optional(),
});
export type CircuitScene = z.infer<typeof CircuitScene>;

/* ───────────────────────────── Optics ───────────────────────────── */

export const OpticalElement = z.discriminatedUnion("type", [
  /** Ideal thin lens centred at `position`, its plane perpendicular to the axis at `angle`. */
  z.object({
    id: id(),
    type: z.literal("thinLens"),
    position: Vec2,
    focalLength: finite().refine((f) => f !== 0, "focal length cannot be 0"),
    height: positive().default(1),
    /** Direction of the optical axis in degrees (0 = +x). */
    axisAngle: finite().default(0),
  }),
  z.object({
    id: id(),
    type: z.literal("planeMirror"),
    from: Vec2,
    to: Vec2,
  }),
  /** Spherical mirror: arc of radius R centred on `vertex + R·axis`; concave faces −axis… see docs. */
  z.object({
    id: id(),
    type: z.literal("sphericalMirror"),
    vertex: Vec2,
    radius: positive(),
    concave: z.boolean().default(true),
    height: positive().default(1),
    /** Direction the mirror faces (towards incoming light), degrees. 180 = facing −x. */
    facingAngle: finite().default(180),
  }),
  /** Closed polygon of transparent material (glass block, prism, water tank). */
  z.object({
    id: id(),
    type: z.literal("block"),
    vertices: z.array(Vec2).min(3).max(16),
    refractiveIndex: z.number().min(1).max(4),
  }),
  /** Biconvex/biconcave thick lens built from two spherical surfaces. */
  z.object({
    id: id(),
    type: z.literal("sphericalLens"),
    position: Vec2,
    /** Signed radii (Gullstrand convention): R1 > 0 & R2 < 0 = biconvex. */
    r1: finite(),
    r2: finite(),
    thickness: positive(),
    height: positive().default(1),
    refractiveIndex: z.number().min(1).max(4),
  }),
  /** Semicircular glass block: flat face on the `angle` side. */
  z.object({
    id: id(),
    type: z.literal("semicircle"),
    center: Vec2,
    radius: positive(),
    /** Orientation of the flat face's outward normal, degrees. */
    flatNormalAngle: finite().default(180),
    refractiveIndex: z.number().min(1).max(4),
  }),
  z.object({
    id: id(),
    type: z.literal("screen"),
    from: Vec2,
    to: Vec2,
  }),
]);
export type OpticalElement = z.infer<typeof OpticalElement>;

export const LightSource = z.discriminatedUnion("type", [
  z.object({
    id: id(),
    type: z.literal("ray"),
    origin: Vec2,
    angle: finite(),
    color: z.string().default("#ffb300"),
  }),
  z.object({
    id: id(),
    type: z.literal("beam"),
    origin: Vec2,
    angle: finite(),
    width: positive(),
    count: z.number().int().min(2).max(60).default(9),
    color: z.string().default("#ffb300"),
  }),
  z.object({
    id: id(),
    type: z.literal("point"),
    origin: Vec2,
    /** Central direction and full spread, degrees. */
    angle: finite().default(0),
    spread: positive().default(20),
    count: z.number().int().min(2).max(80).default(11),
    color: z.string().default("#ffb300"),
  }),
]);
export type LightSource = z.infer<typeof LightSource>;

export const OpticsScene = z.object({
  elements: z.array(OpticalElement).max(20).default([]),
  sources: z.array(LightSource).min(1).max(10),
  environmentIndex: z.number().min(1).max(4).default(1),
  maxBounces: z.number().int().min(1).max(64).default(24),
  /** Half-extent of the world box (m); rays stop when they leave it. */
  worldSize: positive().default(4),
});
export type OpticsScene = z.infer<typeof OpticsScene>;

/* ───────────────────────────── Scene ───────────────────────────── */

export const Param = z.object({
  id: id(),
  label: z.string().min(1).max(60),
  /** Dotted path into the scene, e.g. "mechanics.bodies.0.mass". */
  path: z.string().min(1).max(120),
  min: finite(),
  max: finite(),
  step: positive(),
  unit: z.string().max(12).default(""),
});
export type Param = z.infer<typeof Param>;

export const Scene = z
  .object({
    version: z.literal(SCENE_VERSION),
    id: id(),
    title: z.string().min(1).max(100),
    /** The original problem statement, if any. */
    problemText: z.string().max(2000).optional(),
    /** What the problem asks for, e.g. "acceleration of the system". */
    question: z.string().max(300).optional(),
    domain: z.enum(["mechanics", "circuits", "optics"]),
    /** Simulated time span (s). Ignored by optics. */
    duration: positive().default(4),
    params: z.array(Param).max(16).default([]),
    /**
     * Optional parametric template this scene was generated from. Params whose path starts
     * with "template.args." regenerate the whole scene (e.g. an incline angle moves the
     * surface, the pulley and the blocks together).
     */
    template: z.object({ name: z.string().max(40), args: z.record(z.string(), finite()) }).optional(),
    mechanics: MechanicsScene.optional(),
    circuit: CircuitScene.optional(),
    optics: OpticsScene.optional(),
  })
  .superRefine((s, ctx) => {
    if (s.domain === "mechanics" && !s.mechanics)
      ctx.addIssue({ code: "custom", path: ["mechanics"], message: "domain is mechanics but `mechanics` is missing" });
    if (s.domain === "circuits" && !s.circuit) ctx.addIssue({ code: "custom", path: ["circuit"], message: "domain is circuits but `circuit` is missing" });
    if (s.domain === "optics" && !s.optics) ctx.addIssue({ code: "custom", path: ["optics"], message: "domain is optics but `optics` is missing" });
  });

export type Scene = z.infer<typeof Scene>;
export type SceneInput = z.input<typeof Scene>;
