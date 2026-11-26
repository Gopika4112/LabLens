# How LabLens works

This document teaches the physics, the numerical methods and the code, so that anyone on the team can explain any part of LabLens to a judge. Each section ends with **"Where in the code"** pointers.

---

## 0. The big picture

```
text / photo ──► Scene Graph ──► engine (worker) ──► frames + events ──► renderer, plots, sound
                     ▲                    │
          parser / AI / builder           └──► analytic layer ──► "simulated vs analytic" + audits
```

1. **Scene Graph** is a typed JSON description of the problem: bodies, surfaces, ropes, circuit components, lenses and so on.
2. **Engines** turn the Scene Graph into a *trajectory*. That is a list of frames sampled at 60 Hz for mechanics and about 600 samples for circuits, or a list of ray paths for optics.
3. The **analytic layer** works out which textbook problem this is, computes the textbook answer *without* using the engine, then **measures** the same quantity from the trajectory and compares the two.
4. The **UI** draws the frames, plots them, plays them as sound and narrates the events.

All physics runs in a **Web Worker** (`apps/web/src/worker/sim.worker.ts`), so the page stays responsive while it computes.

---

## 1. The Scene Graph (`packages/engine/src/schema/`)

- `scene.ts` defines the schema with **Zod**. Zod is a library that checks a JS object against a declared shape at runtime and gives TypeScript types for free.
- `validate.ts` checks in two stages:
  1. **Structural:** `Scene.safeParse(input)` checks types, ranges and required fields, for example "mass must be > 0".
  2. **Semantic:** `semanticIssues()` checks things a schema can't express, for example "rope `bodyB` refers to a body that exists" or "the circuit's ground is one of its nodes".
- `params[]` drives the sliders. Each param has a dotted `path` into the scene, such as `mechanics.bodies.0.mass`. `setPath()` writes a new value *immutably* (it copies along the path), which is why React notices the change.
- **Templates** (`templates/index.ts`) are functions that build a whole consistent scene from a few numbers, for example `inclinePulley({m1, m2, angle, muS, muK})`. When a param's path is `template.args.angle`, `applyParam()` (in `params.ts`) **rebuilds** the scene, so the incline, the pulley and the blocks all move together.

**Explain it in one line:** "The Scene Graph is the contract. The AI, the offline parser and the builder all have to produce something that passes the same validator before anything is simulated."

---

## 2. Mechanics engine (`packages/engine/src/mechanics/engine.ts`)

### 2.1 State
Each body is a **point mass** with position `q = (x, y)` and velocity `v`. For N bodies these are stored in flat `Float64Array`s of length 2N.

### 2.2 Forces you can write down directly
- gravity `F = (0, −m g)`
- springs: Hooke's law `F = k (d − L₀)` along the spring, plus damping `c · v_rel`
- drag: linear `−b v` and quadratic `−c |v| v`
- applied forces

### 2.3 Constraints: the clever part
A rope, a surface or a pendulum string is not a force you know in advance. It is a **rule**:
- a block on a surface: its distance from the surface line equals half its size, `C = n·(p − p₀) − h = 0`
- a rope over pulleys: total length stays `L`, `C = L − (|p_A − g_A| + middle + |p_B − g_B|) = 0`
- a pendulum string: `C = L − |p − pivot| = 0`

If `C(q) = 0` must hold at all times, its second time derivative must also be zero:

`C̈ = J·a + J̇·v = 0`, where `J = ∂C/∂q` is the **Jacobian**, which says which direction each body would have to move to change C.

The constraint pushes or pulls with a force `λ·J` (λ is the **Lagrange multiplier**: the normal force, or the tension). Newton's law with that force added is `a = M⁻¹(F_ext + Σ λₖ Jₖ)`. Substituting gives a small linear system, one equation per constraint:

```
Σₖ (Jᵢ M⁻¹ Jₖ) λₖ = −Jᵢ M⁻¹ F_ext − J̇ᵢ v
```

We solve it with our own **Gaussian elimination with partial pivoting** (`math/linalg.ts`). The λ values that come out *are* the physical tension and normal force, which is why the free-body diagram and the tension plot are exact.

**Unilateral constraints.** A rope can pull but not push, and a surface can push but not pull. After solving, if any λ has the wrong sign (for example negative tension), that constraint is released and the system is solved again. This is called an **active-set** loop. It is how a rope goes slack, or a ball leaves a curved surface.

### 2.4 Friction (Coulomb)
- **Kinetic:** the contact force becomes `λ (n − μk · s · t)`, where `t` is the tangent and `s` is the sliding direction. Because the friction term is tied to the same λ as the normal force, friction is exactly `μk · N` even when N itself depends on the rope tension.
- **Static:** if the tangential velocity is about 0, we first add a "stick" constraint (`t·a = 0`) and solve. If the friction needed is no more than `μs · N`, the block stays put. Otherwise it starts sliding in the direction it was being pushed. This is checked once per time step.
- When a sliding block's velocity crosses zero inside a step, we zero it and interpolate the exact stopping time. That is how *"comes to rest at t = 2.039 s"* is accurate to about 1e-12.

### 2.5 Time integration
- **RK4** (default): evaluates the acceleration four times per step and combines them. Error per unit time is ∝ Δt⁴.
- **Velocity Verlet**: second order and *symplectic*, meaning it keeps the energy error bounded over long runs.
- **Semi-implicit Euler**: first order and symplectic. It is included for teaching and for the comparison test.

The **Engine Accuracy** page *measures* these orders. It runs a spring at Δt and Δt/2 and computes `p = log₂(e(Δt)/e(Δt/2))`. The results are 4.000, 2.000 and 1.002.

### 2.6 Keeping constraints exact (projection)
Even RK4 lets C drift by about 1e-12 per step. After every step we **project** positions and velocities back onto the constraints. This is a Newton step `Δq = M⁻¹ Jᵀ (J M⁻¹ Jᵀ)⁻¹ (−C)`, plus the same projection for velocities, in the spirit of the RATTLE algorithm. We do *not* use Baumgarte stabilization, because its fudge factors leak energy.

### 2.7 Collisions and events
Bodies that are not resting on a surface bounce off surface segments with restitution `e`. Body–body impacts use impulse `J = −(1+e) v_rel·n / (1/m₁ + 1/m₂)`, which conserves momentum exactly. The impact time is interpolated back inside the step. Events such as "reaches the pulley", "lifts off" or "comes to rest" become the narration.

### 2.8 Energy audit
Every frame stores KE, PE, energy dissipated by friction/drag/impacts, and work done by applied forces. `residual = KE + PE + dissipated − applied − E₀` should be about 0. Every scene displays the largest residual. This check works even when no textbook formula exists.

**Where in the code:** `MechanicsSim.buildRows` (the constraints), `solveRows` (the active set), `evaluate` (forces and accelerations), `decideFriction`, `rk4/verlet/symplecticEuler`, `projectPositions/projectVelocities`, `collideSurfaces/collideBodies`, `simulateMechanics`.

---

## 3. Circuit engine: Modified Nodal Analysis (`packages/engine/src/circuits/mna.ts`)

### 3.1 The idea
Pick a **ground** node (0 V). The unknowns are every other node's voltage, plus the current through every element whose current can't be written as a function of voltages: voltage sources, inductors and switches. Each component **stamps** numbers into a matrix equation `G x = z`:

| Component | Stamp |
|---|---|
| Resistor R between a, b | `G[a][a] += 1/R; G[b][b] += 1/R; G[a][b] −= 1/R; G[b][a] −= 1/R` (from KCL: current = ΔV/R) |
| Current source | only the right-hand side `z` |
| Voltage source | an extra row and column: `V_a − V_b = E`, and its current enters the KCL rows of a and b |
| Switch | the same extra row: closed means `V_a = V_b`; open means `i = 0`. Both are exact, with no tiny or huge resistors that would wreck precision. |

Then `solveLinear(G, z)` gives every voltage and current at once.

### 3.2 Capacitors and inductors over time (companion models)
`i = C dv/dt` is a differential equation. Integrating one step with the **trapezoidal rule** turns the capacitor into a resistor plus a current source:

```
i_{n+1} = (2C/Δt)(v_{n+1} − v_n) − i_n      →   conductance 2C/Δt  ∥  current source −(2C/Δt · v_n + i_n)
```

An inductor gets the matching branch equation `v_{n+1} = (2L/Δt)(i_{n+1} − i_n) − v_n`. So each time step is just another DC solve. Trapezoidal is second-order accurate. Backward Euler (first order) is also available, and a test shows trapezoidal is more than 20× more accurate at the same step size.

**Switch instants are hit exactly.** The step size shrinks so a step lands exactly on `closeAt`. Then the state is **re-initialized**: capacitors become voltage sources holding their present voltage and inductors become current sources holding their present current. This avoids the well-known trapezoidal "ringing" after a discontinuity, and it gives the *exact* initial current `V/R`.

### 3.3 AC analysis
Replace `d/dt` with `jω`. Capacitors become admittance `jωC` and inductors impedance `jωL`, and we solve the same stamped system with **complex numbers** (`solveComplex`). Sweeping frequency gives the frequency-response plot. **Golden-section search** on the magnitude then finds the resonant peak to about 1e-8 relative accuracy.

### 3.4 Audits
- **KCL residual:** the currents into every node sum to zero, to better than 10⁻⁹ of the largest current.
- **Tellegen's theorem:** Σ v·i over all components = 0 at every instant, meaning power delivered equals power absorbed.
- **Energy:** ∫P_sources dt = ∫P_resistors dt + ΔE_stored.

**Where in the code:** `Circuit.solve` (the stamps), `readout`, `acProbe`, `simulateCircuit` (time stepping with exact switch handling), `findResonance`.

---

## 4. Optics: 2D ray tracer (`packages/engine/src/optics/tracer.ts`)

- The geometry is built from **primitives**: line segments and circular arcs. Each has a role: mirror, refracting boundary, ideal thin lens, screen or absorber.
- For each ray we find the **nearest intersection**. Ray–segment intersection solves a 2×2 system. Ray–circle intersection solves a quadratic, and an `accept()` test keeps only the part of the circle that is actually the surface.
- **Which media?** We test whether a point just *before* and just *after* the hit lies inside each glass shape. That gives n₁ and n₂ for any shape without bookkeeping.
- **Refraction**, using Snell's law in vector form: `d' = η d + (η cosθᵢ − √k) n` with `η = n₁/n₂` and `k = 1 − η²(1 − cos²θᵢ)`. If `k < 0`, the result is **total internal reflection**.
- **Fresnel equations** give how much light is transmitted at each interface, which sets the brightness of each ray segment.
- **Ideal thin lens:** the slope map `tanθ' = tanθ − h/f`, which sends every ray from a point to the same image point.
- **Thick lens:** two real spherical surfaces with real refraction. The focal length is then *measured*, not assumed.

### Measuring answers from rays
- **Image location:** the least-squares point closest to all outgoing rays (`leastSquaresMeet`, a 2×2 normal equation).
- **Paraxial focus:** spherical aberration makes edge rays focus closer. We fit `x(h) = a + b h² + c h⁴` to where each ray crosses the axis and take `a`, the h → 0 limit.
- **Critical angle:** **bisection**, which repeatedly asks the tracer "does a ray at this angle totally reflect?"

**Where in the code:** `buildGeometry`, `intersect`, `traceRay`, `fresnelT`, `leastSquaresMeet`, `analytic/optics.ts`.

---

## 5. The analytic layer: how we know it's right (`packages/engine/src/analytic/`)

The analytic layer looks at the **structure** of the Scene Graph. For example, "two bodies, one rope over a pulley, neither on a surface" is an **Atwood machine**. For that it computes `a = |m₂−m₁| g/(m₁+m₂)`, `T = 2m₁m₂g/(m₁+m₂)` using pure formulas.

It then **measures** the same quantity from the simulation, independently:
- acceleration: a least-squares line fit to velocity vs. time
- period: the times between zero crossings of the *velocity*, which stay exact even for damped motion
- tension: from the constraint multipliers λ
- RC time constant: the moment V_C passes 63.2% of the way to its final value

Because the two numbers come from **different code paths**, agreement to 10⁻⁶–10⁻¹⁴ % is real evidence of correctness. The `validation/cases.ts` suite gates CI and also powers the in-app **Engine Accuracy** page.

Archetypes covered: Atwood, incline/table + pulley (with static/kinetic friction), block on an incline, sliding to a stop, the pendulum (exact large-angle period through the **complete elliptic integral K**, computed with the arithmetic–geometric mean), spring and damped spring, projectile, terminal velocity, 1-D elastic collision, RC charge/discharge, RL, series RLC (resonance and ringing period), divider, parallel resistors, Wheatstone bridge (Thevenin), Snell + slab shift, total internal reflection, thin lens (distance + magnification), concave mirror, and thick lens (lensmaker / back focal distance).

---

## 6. Perception: from text or photo to Scene Graph

### 6.1 Offline parser (`packages/engine/src/parse/offline.ts`)
1. `quantities()` pulls out every number with its unit, using regexes, and converts to SI (`4.7 kΩ → 4700 Ω`, `220 µF → 2.2e-4 F`, `30 cm → 0.3 m`).
2. Keyword rules choose a template. For example "pulley" plus two masses plus "incline" picks `inclinePulley`. "Hangs" near a mass picks which mass is the hanging one.
3. Values that weren't found fall back to template defaults. Those are listed as **assumptions** and lower the confidence score.

### 6.2 AI parser (`api/parse.ts`, `api/_lib/llm.ts`)

`llm.ts` is a small provider layer. Every free provider (Gemini, Ollama, OpenRouter, Groq) speaks the **OpenAI Chat Completions protocol**, so one `fetch` call covers all of them: images are sent as `data:` URLs, the key as a bearer token. Claude uses its own Messages API. The first configured *free* provider wins; `LLM_PROVIDER` / `LLM_MODEL` override. Small local models get a compact prompt (template catalog only, no full JSON Schema) because their context windows are short. Weaker free models make more mistakes, which is exactly what the validation and repair loop below exists for.

1. A vision LLM gets a system prompt. By default this is Google Gemini's **free tier** (`gemini-3.5-flash-lite`); a local Ollama model, an OpenRouter `:free` model, Groq or Claude can be swapped in with environment variables (`api/_lib/llm.ts`). The prompt containing the template catalog and the **full JSON Schema** of the Scene Graph, which is generated from the Zod schema with `z.toJSONSchema`. It replies with JSON in *template mode* (preferred) or *scene mode*.
2. The server validates the reply: JSON parse → Zod → template exists and its args are valid → semantic checks.
3. **Repair loop:** if validation fails, the exact issues (for example `- mechanics.ropes.0.bodyB: unknown body "ghost"`) are sent back to the model. Up to 3 attempts are made, and each repair lowers the reported confidence.
4. The student sees **"Did I understand this correctly?"**, listing what was read, what was assumed, what was unclear, and the confidence.

The API key lives only on the server. Photos are resized to at most 1600 px on the device, which also strips EXIF metadata, before upload.

---

## 7. The tutor

### 7.1 Offline Socratic engine (`packages/engine/src/tutor/experiments.ts`)
Each template has hand-written experiments, for example "If you double μk, what happens to the acceleration?". The flow is:
1. The student picks a prediction: more than double / double / up / same / down / halve.
2. The app applies the change and **re-simulates**.
3. `classifyChange(before, after)` turns the *measured* ratio into a category. **The simulation decides which answer is right.** Nothing is hard-coded.
4. A reflection question is shown. It asks *why*; it doesn't tell.

### 7.2 AI tutor (`api/tutor.ts`)
The request carries the scene description, the current parameter values with their ranges, the verified results, the current instant and the events. The system prompt enforces Socratic rules: predict first, one question at a time, use only the numbers given. Replies may include `setParam` actions. The server **drops actions for parameters that don't exist and clamps values to the slider range**. The UI shows each action as a button, and the student chooses to run it.

---

## 8. Accessibility layer (`apps/web/src/lib/sonify.ts`, `describe.ts`)

- **Sonification:** a Web Audio oscillator whose frequency follows the value on a log scale (220–880 Hz, two octaves), with a `StereoPannerNode` sweeping left → right as time advances. Short clicks are scheduled at zero crossings. Low and high reference tones play first so the listener knows the scale.
- **Narration:** `describeScene()` and `describeMoment()` build sentences from the Scene Graph and the current frame. No AI is involved, so the sentences are always accurate. They are read through `aria-live` regions.
- Canvas drawings have `role="img"` and a text description. Every plot has a data table. The free-body diagram is also a list.

---

## 9. Web app structure (`apps/web/src/`)

| File | Job |
|---|---|
| `worker/sim.worker.ts`, `lib/worker.ts` | Runs the engines off the main thread. Uses promise-based messages; the latest request wins. |
| `pages/Lab.tsx` | Main page: simulation hook, playback loop, keyboard shortcuts, narration. |
| `components/render/*.ts` | Pure Canvas-2D drawing for each domain (camera fit, arrows, symbols, rays). |
| `components/Plot.tsx` | Custom canvas plots with a "Listen" button and a data table. |
| `components/Verification.tsx` | The instrument strip showing simulated vs. analytic. |
| `components/Tutor.tsx` | Predict → test → explain, plus AI chat. |
| `pages/Build.tsx` | Builder: every `{x, y}` in the scene is a drag handle, plus a generic inspector and a JSON editor with live validation. |
| `pages/Accuracy.tsx` | Streams validation cases from the worker. |
| `lib/settings.ts`, `lib/sceneStore.ts`, `lib/router.ts` | Tiny stores built on `useSyncExternalStore`, plus hash routing (works on any static host). |

---

## 10. Questions you should be ready for

See [JUDGE_QA.md](JUDGE_QA.md). The short version: *the engines are ours, the answers are checked two independent ways, and the AI is only the front door.*
