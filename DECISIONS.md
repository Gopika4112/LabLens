# Decision log

Each choice made during the build, with its reason. Newest decisions are at the bottom of each section.

## Architecture
| # | Decision | Why |
|---|---|---|
| 1 | npm workspaces monorepo: `packages/engine`, `apps/web`, `api` | The engine stays framework-free and testable in Node, and the browser, worker and serverless functions can all import it. |
| 2 | Engines are pure TypeScript, and their only dependency is Zod | The brief requires engines written from scratch. Zod is used only for the schema. |
| 3 | Physics runs in a Web Worker, and the *whole run* is precomputed (≤ ~20k steps, typically 20–130 ms), then played back | This allows instant scrubbing and pausing, deterministic plots, and the ability to seek to events. The UI never blocks. |
| 4 | Hash routing (`#/lab/...`) instead of a router library | Works on any static host (GitHub Pages, artifact hosting) with no rewrites, and keeps the bundle smaller. |
| 5 | Parametric **templates** plus a free-form Scene Graph | Templates make slider changes (e.g. incline angle) rebuild consistent geometry. They also make AI parsing more reliable: the model chooses a template and fills in numbers, and free-form scenes are the fallback. |
| 6 | Builder edits make a scene leave its template, and sliders are regenerated as direct-path params | Otherwise a template slider would overwrite a hand edit. |

## Physics and numerics
| # | Decision | Why |
|---|---|---|
| 7 | Point masses + Lagrange-multiplier constraints, solved with our own Gaussian elimination | The multipliers *are* the tension and normal forces, so free-body diagrams are exact, not estimated. |
| 8 | Kinetic friction folded into the contact force column (`n − μk s t`) | Gives exact `μk·N` even when N depends on other constraints, and closed-form agreement reaches about 1e-7 %. |
| 9 | Static friction handled as a "stick" row plus a check against μs·N once per step, not per RK stage | Prevents chattering within a step. |
| 10 | Rope and string engagement decided per *step*, not per RK stage | Found by testing: RK stage points dip about 1e-7 m inside a pendulum's circle, which wrongly marked the string as slack and lost 0.2% energy. After this fix the energy residual is about 1e-8 %. |
| 11 | Post-step position and velocity projection (RATTLE-style) instead of Baumgarte stabilization | No tuning constants and no artificial energy drain. |
| 12 | Position fixes (push-out, snapping) booked in a separate "corrections" energy ledger | Keeps the energy audit honest: it measures integration error, and geometric fixes are reported separately. |
| 13 | RK4 as the default integrator; Verlet and symplectic Euler kept for teaching | RK4 gives the best accuracy per step on short runs. Verlet's bounded energy error is shown in a test. |
| 14 | MNA with exact ideal switches as branch equations, not tiny/huge resistors | The first version used R_on = 1e-6 Ω and failed the KCL audit at 1e-9 A. The branch formulation is exact. |
| 15 | Steps land exactly on switch instants and the state is re-initialized | Removes trapezoidal ringing and the timing bias of up to Δt. The RC τ error dropped from 0.11% to 5e-4%. |
| 16 | Period measured from zero crossings of *velocity* (or current) | Crossings of position about its mean are biased for damped or offset motion. Velocity zeros are exactly Td/2 apart. |
| 17 | Mirror and thick-lens focus measured by extrapolating to the paraxial limit (fit in h², h⁴) | Wide beams show real spherical aberration. Extrapolating separates physics from the measurement method (error 0.14% → 9e-8%). |
| 18 | Optics events carry the surface normal | Lets the renderer draw the normal and the angle labels without re-deriving geometry. |

## AI
| # | Decision | Why |
|---|---|---|
| 19 | ~~Claude only~~ → **provider-agnostic layer defaulting to free models**: Gemini free tier (`gemini-3.5-flash-lite`), Ollama (local), OpenRouter `:free`, Groq; Claude optional | The team wants zero running cost. All free providers share the OpenAI Chat Completions protocol, so one ~150-line `fetch` client covers them, with no SDK dependency. `gemini-3.5-flash-lite` was chosen because Google's pricing page lists it as free with image input, without an end date (`gemini-3.8-flash` is free only through 31 Dec 2026). Ollama is the privacy and offline option for schools. |
| 20 | JSON in plain text + our own Zod/semantic validation + a repair loop, instead of provider-specific structured outputs (Gemini's OpenAI endpoint doesn't document `json_object`) | The Scene Graph has discriminated unions and cross-references that a JSON-schema constraint can't fully express. The repair loop feeds back *semantic* errors too, and it is tested with the model mocked. Live runs on free models also showed why our own JSON extraction must be tolerant: one Gemini tutor reply carried an extra `}` and a stray `</thought>` tag, so `extractJson` scans for a balanced object instead of trusting the first `{` and last `}`. |
| 21 | Prompt includes the template catalog and `z.toJSONSchema(Scene)` | One source of truth. The schema in the prompt can't drift from the validator. |
| 22 | Tutor actions are shown as **buttons**, not applied automatically | The student stays in control, which fits the predict-first pedagogy. Actions are filtered and clamped on the server. |
| 23 | Photos are resized on the device (≤ 1600 px JPEG) | Faster on low bandwidth, lower cost, and EXIF and location data are stripped. |
| 24 | Without an API key, AI features degrade, not break: health check → offline parser → clear message | Demo mode can't fail. |

| 24b | Small local models get a compact prompt (templates only) | A ~5k-token JSON Schema can overflow the default context of small Ollama models. |

## UX, accessibility, performance
| # | Decision | Why |
|---|---|---|
| 25 | "Lab notebook" paper theme + "instrument panel" dark readouts; Fraunces / IBM Plex Sans / Plex Mono | A distinctive look, tabular numbers for readouts, and a self-hosted font subset for offline use. |
| 26 | OpenDyslexic for the dyslexia toggle | It's what the brief asks for, under the OFL license. |
| 27 | Static first-paint "pitch" line in `index.html` | Mobile Lighthouse performance went from 83 to 95–96 by giving the browser real content before JS runs. It also states the pitch immediately. |
| 28 | Latin-only font subsets declared by hand | Render-blocking CSS went from 40 KB to 30 KB. |
| 29 | Secondary pages lazy-loaded | The initial JS is about 158 KB gzip, with the engine in its own worker chunk. |
| 30 | Simulation results are tagged with the scene that produced them | Found by browser testing: switching examples briefly paired the new scene with stale frames and crashed. There is now also a defensive guard in the renderers. |
| 31 | Optics view frames the actual ray paths | The TIR screenshot showed the reflected ray clipped. |

## Scope
| # | Decision | Why |
|---|---|---|
| 32 | Kept all three engines; skipped rotation and rolling | Rigid-body rotation would add little for the target problems and would risk depth elsewhere. |
| 33 | No learning-outcome claims | We haven't run studies. The roadmap says so. |
| 34 | Not deployed or pushed by the build agent | Needs the team's accounts. Deployment configs (Vercel, GitHub Pages) are included. |
