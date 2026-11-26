# LabLens — Build Plan

> Turn any sketch of a physics problem into a live, explorable, *verified* simulation lab.

## 1. Architecture

```
┌────────────── apps/web (Vite + React + TS) ──────────────┐
│  Lab view · Builder · Examples · Engine Accuracy · About │
│   │  canvas renderers (mechanics / circuit / optics)     │
│   │  plots (custom canvas) · sonification (Web Audio)    │
│   │  narration (aria-live) · tutor panel                 │
│   └──► Web Worker ──► @lablens/engine (pure TS)          │
└────────────────────────────┬─────────────────────────────┘
                             │ fetch (optional)
                ┌────────────▼────────────┐
                │ api/ (serverless proxy) │  parse.ts  tutor.ts
                │ Claude (vision) + Zod   │  key never in client
                └─────────────────────────┘

packages/engine  (framework-free, zero runtime deps except zod)
  schema/      Scene Graph v1 (Zod) — the backbone
  math/        dense linear solver (real + complex), stats, AGM/elliptic K
  mechanics/   constrained particle dynamics (Lagrange multipliers),
               RK4 / velocity-Verlet / semi-implicit Euler, friction,
               ropes over pulleys, springs, pendulums, collisions, drag,
               energy audit, events
  circuits/    Modified Nodal Analysis: DC, transient (trapezoidal / BE
               companion models), AC sweep (complex MNA), power audit
  optics/      2D ray tracer: Snell refraction, TIR, Fresnel-free,
               plane/spherical mirrors, ideal thin lenses, thick lenses
  analytic/    archetype detection + closed-form answers + measurement
               of the same quantity from the simulated trajectory
  validation/  benchmark cases shared by Vitest AND the in-app page
  parse/       offline rule-based text → Scene Graph parser (no AI)
  tutor/       offline Socratic predict→observe→explain script engine
  describe/    scene → plain-language description for screen readers
```

## 2. Scene Graph (v1) — summary
`{ version: "1", id, title, problemText?, domain, params[], duration, mechanics? | circuit? | optics? }`
- `params[]` are the exposed sliders: `{ id, label, path, min, max, step, unit }` where
  `path` is a dotted path into the scene (e.g. `mechanics.bodies.0.mass`). The UI,
  the AI tutor's `setParam` actions and the parser all speak this.
- Full documentation: `packages/engine/src/schema/README.md` and HOW_IT_WORKS.md.

## 3. Milestones (always demoable)
1. Scaffold, CI, schema, deploy config.
2. Mechanics + analytic + tests → Atwood & incline in UI. **First slice.**
3. 12+ example scenes, builder, auto free-body diagrams.
4. AI perception (proxy, Zod validation, repair loop, confirmation UI) + offline parser.
5. Circuits (MNA) + renderer + tests.
6. Optics tracer + renderer + tests.
7. Tutor (offline script engine + Claude state-aware tutor with actions).
8. Accessibility: sonification, narration, keyboard, reduced motion, dyslexia font. axe audit.
9. Engine Accuracy page, PWA/offline, perf.
10. Docs & submission package. 11. Clean-clone verification + strict self-review.

## 4. Risks & mitigations
| Risk | Mitigation |
|---|---|
| AI mis-parses a sketch | Zod validation + semantic checks + repair loop; editable confirmation UI; offline parser + builder as fallback |
| No API key at judging time | Everything except photo parsing & free-form tutor works offline; 12+ examples; offline tutor script |
| Constraint drift / instability | Baumgarte stabilisation + RK4; energy audit displayed for every scene; tests on drift |
| Friction stick/slip discontinuity | Explicit stick test (λ_t ≤ μs·N) each step; unit tests vs closed form |
| Engine scope creep | Optics is lowest priority per brief; tests and a11y never cut |
| Deployment needs accounts we don't have | Static build works on any host; vercel.json + GitHub Pages workflow shipped; honest README |
