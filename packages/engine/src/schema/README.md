# Scene Graph v1

The single contract between perception (AI, offline parser, builder), the engines, the renderers and the tutor. Source of truth: [`scene.ts`](scene.ts) (Zod). The JSON Schema is generated from it with `z.toJSONSchema(Scene)` and embedded in the AI prompt.

## Conventions
- SI units everywhere (kg, m, s, N, Ω, F, H, V, A). Angles are in **degrees** in the schema; the engines convert them.
- Coordinates are metres, **x right, y up**. Renderers flip y.
- `id`s start with a letter; letters, digits, `_` and `-` only.

## Top level
| Field | Type | Notes |
|---|---|---|
| `version` | `"1"` | |
| `id`, `title` | string | |
| `domain` | `"mechanics" \| "circuits" \| "optics"` | Exactly one payload must match. |
| `duration` | s | Simulated span (ignored for optics). |
| `problemText`, `question` | string? | Original problem and what it asks for. |
| `params[]` | `{id,label,path,min,max,step,unit}` | Sliders. `path` is dotted into the scene; `template.args.*` rebuilds from the template. |
| `template` | `{name, args}`? | The parametric template the scene came from. |

## mechanics
`gravity`, `bodies[]` (mass, shape block/ball, size, position, velocity, `onSurface`, drag, appliedForce, collides), `surfaces[]` (segment `from`→`to`, kind, μs, μk, restitution), `pulleys[]` (position, radius), `ropes[]` (`bodyA` → `via[{pulley, side}]` → `bodyB` or `anchorB`, optional length), `springs[]` (k, restLength, damping, bodyB or anchorB), `links[]` (string or rod pendulum from `pivot`), `integrator`, `dt`.

## circuit
`nodes[]` (id, optional `position` and `extra` points for drawing wires), `components[]` discriminated by `type`: `resistor`, `lamp`, `capacitor` (initialVoltage), `inductor` (initialCurrent), `voltageSource` (DC + optional AC), `currentSource`, `switch` (closeAt). Current is defined from `a` to `b` through the component. `ground` must be a node. Optional `acSweep {source, probe, fStart, fStop, points}`.

## optics
`elements[]` discriminated by `type`: `thinLens`, `planeMirror`, `sphericalMirror`, `block` (polygon + n), `sphericalLens` (r1, r2, thickness, n), `semicircle`, `screen`. `sources[]`: `ray`, `beam`, `point`. Plus `environmentIndex`, `maxBounces` and `worldSize`.

## Validation
`validateScene(input)` returns `{ok, scene, warnings}` or `{ok:false, issues:[{path, message}]}`. Issues are written so a human or an LLM can act on them, for example `mechanics.ropes.0.bodyB: unknown body "ghost"`.
