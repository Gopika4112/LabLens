# Devpost submission: copy into each field

## Project name
LabLens

## Tagline (≤ 200 chars)
Photograph a physics problem and get a live, verified lab you can see, hear and question. It runs on our own physics engines and works offline.

## Inspiration
Most physics students meet a pulley as a drawing and an equation. They can compute *a = 3.24 m/s²* but never watch the block accelerate or ask "what if the hanging mass doubles?". In TIMSS 2019, only 36% of fourth-graders internationally attended a school with a science lab, and in South Africa 17.4% of public schools have one. For blind and low-vision students, diagram-heavy physics is closed off almost entirely. Existing simulators offer fixed menus of scenes, so none of them can simulate *the problem on your worksheet*. We wanted the worksheet itself to become the lab.

## What it does
- **Perceive:** photograph a textbook diagram or a hand sketch, or type the problem. LabLens builds a typed Scene Graph using a **free** vision model (Gemini's free tier, or a local Ollama model for offline schools), validated and auto-repaired, or an offline rule-based parser. It then shows *"Did I understand this correctly?"* with what it read, what it assumed, and its confidence.
- **Simulate:** three engines we wrote from scratch. Constrained mechanics (ropes over pulleys, static and kinetic friction, springs, pendulums, collisions, drag); circuits by Modified Nodal Analysis (RC/RL/RLC transients, switches, AC resonance); a ray tracer (Snell's law, total internal reflection, mirrors, thin and thick lenses).
- **Verify:** every recognised problem shows *Simulated a = 3.244 m/s² · Analytic = 3.244 m/s² · error 2e-6%*, the answer key computed two independent ways. Every scene also passes energy, Kirchhoff, Tellegen or Snell audits.
- **Explore:** sliders for every parameter, play/scrub, live plots, force arrows and an automatically generated free-body diagram.
- **Learn:** predict → test → explain. You commit to a prediction, LabLens runs the experiment, and the simulation decides whether you were right. With AI on, a Socratic tutor that sees the live lab proposes experiments.
- **Include everyone:** hear any graph (sonification), live narration for screen readers, full keyboard control, data tables, OpenDyslexic, reduced motion, and an offline PWA.

## How we built it
TypeScript monorepo. `@lablens/engine` is framework-free: Lagrange-multiplier constraint solving with our own Gaussian elimination, RK4/Verlet/symplectic integrators with RATTLE-style projection, Coulomb friction with stick/slip detection, MNA with trapezoidal companion models and a complex AC solver, a 2D ray tracer with Fresnel transmission, and an analytic layer that recognises more than 20 textbook archetypes (including the exact large-angle pendulum period via the elliptic integral K computed with the AGM). The engines run in a Web Worker. The front end is React 19, Vite 8, Tailwind 4 and custom Canvas renderers, with Web Audio for sonification and Workbox for offline use. The AI layer is serverless functions with a provider-agnostic client that defaults to free models (Gemini free tier, or Ollama locally; OpenRouter, Groq and Claude optional) with the Scene Graph's JSON Schema in the prompt, Zod plus semantic validation, and a repair loop. Quality checks: 129 tests, a 39-case closed-form accuracy suite that also runs live in the app, CI (lint, format, types, tests, build), axe and Lighthouse audits.

## Challenges we ran into
- **A pendulum that leaked energy:** RK4's intermediate stage points dipped about 10⁻⁷ m inside the string's circle, so the string was briefly treated as slack. Deciding engagement per step instead of per stage cut the energy error from 0.2% to 10⁻⁸ %.
- **Switches in circuits:** modelling a closed switch as a 1 µΩ resistor broke our Kirchhoff audit. Rewriting switches as exact branch equations, landing time steps exactly on switch instants and re-initializing the state fixed both the audit and the trapezoidal "ringing".
- **Measuring periods honestly:** zero crossings of position are biased for damped motion; velocity zero crossings are not.
- **Making AI output trustworthy:** a schema alone can't catch "this rope connects to a body that doesn't exist", so we added semantic validation and fed the exact errors back to the model.

## Accomplishments that we're proud of
- 39/39 closed-form validation cases pass, most to better than 10⁻⁶ %. Measured integrator orders are 4.000, 2.000 and 1.002.
- Judges can rerun the whole accuracy suite in their own browser in about 2 seconds.
- axe: 0 violations across 7 pages × 2 themes. Lighthouse: accessibility 100, performance 93–97 (mobile, across runs) and 100 (desktop).
- The simulation, not a hard-coded answer key, grades the student's prediction.

## What we learned
Constraint forces are worth computing exactly; they make free-body diagrams honest. Verification needs *independent* code paths. And accessibility features like sonification and narration turned out to be useful to every student, not just the ones we designed them for.

## What's next
Classroom pilots and testing with blind students; a labelled benchmark of real worksheet photos to measure parsing accuracy; rigid-body rotation; diodes and transistors; wave optics; translations; teacher-shareable scene links.

## Built with
typescript, react, vite, tailwindcss, canvas, web-audio-api, web-workers, zod, gemini, ollama, openrouter, vercel, workbox, pwa, vitest, eslint, axe-core, lighthouse

## Categories
Engineering & Scientific Computing · AI & Technology · Education & Accessibility

## Links
- Live demo: _your deployment URL_
- Repository: _your GitHub URL_
- Video: _your video URL_
