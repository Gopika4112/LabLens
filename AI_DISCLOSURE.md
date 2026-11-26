# AI disclosure

## 1. How AI was used to build LabLens
- **Tool:** Claude Code (Anthropic), running the Claude Opus 5.5 model, used as a pair programmer and technical writer.
- **What it did:** drafted the architecture plan, the engine code (mechanics, MNA circuits, ray tracer, analytic layer), the React UI, tests, the scripts that capture screenshots and audits, and the first drafts of this documentation.
- **How the work was checked:**
  - Every physics result is checked by code, not by trust. 111 automated tests, a 39-case closed-form validation suite, measured convergence orders, and energy, KCL, Tellegen and Snell audits all run in CI.
  - The app was run in a real browser after each milestone. Several bugs were found that way and fixed; they are logged in DECISIONS.md (#10, #14, #15, #30, #31).
  - axe and Lighthouse audits were run on the built app (`docs/audits/`).
- **What the team must do (and has committed to do) before submitting:** read [HOW_IT_WORKS.md](HOW_IT_WORKS.md), step through the core modules, and be able to explain constraints and Lagrange multipliers, MNA stamps, companion models, Snell's law in vector form, and the repair loop. _Team members: record here who reviewed which module, and when:_

| Module | Reviewed by | Date |
|---|---|---|
| mechanics/engine.ts | | |
| circuits/mna.ts | | |
| optics/tracer.ts | | |
| analytic/* | | |
| api/* (AI proxy) | | |
| apps/web | | |

## 2. How the product uses AI
| Feature | AI? | Without AI |
|---|---|---|
| Physics engines, verification, plots, sonification, narration | **No.** Deterministic code. | Fully works. |
| Typed problem → scene | Optional | The offline rule-based parser handles common textbook problems. |
| Photo / sketch → scene | Yes (free vision LLM: Gemini free tier by default, or a local Ollama model) | Unavailable; the user is told to type the problem or use an example or the builder. |
| Predict → test → explain experiments | **No** | Fully works. The simulation grades the prediction. |
| Free-form tutor chat | Yes | Replies offline with the next built-in experiment. |

### Which models, and what they cost
LabLens defaults to **free** models: Google Gemini's free tier (`gemini-3.5-flash-lite`), or a local **Ollama** model that is free, unlimited, private and works offline. OpenRouter `:free` models and Groq's free tier are also supported, and Claude is an optional paid upgrade. **Privacy note:** Google's pricing page says content sent on the *free* tier is used to improve its products. For student data, prefer Ollama on a school server or a paid tier. The UI only sends a problem photo/text and the lab state, never names or accounts.

## 3. Safeguards
- **The key never reaches the browser.** Calls go through `api/*` serverless functions.
- **Nothing the AI returns is trusted.** Every scene passes Zod structural validation and semantic checks before simulation. Failures go back to the model with exact error messages (up to 3 attempts). If all attempts fail, the user sees a clear error and offline options.
- **Transparency:** the *"Did I understand this correctly?"* card shows what was read, what was assumed, what was uncertain, the confidence, and whether a repair happened. A value the model says it assumed is never ticked as "read". Any value can be edited.
- **Tutor output is cleaned:** free models sometimes wrap replies in stray tags or LaTeX, so the proxy extracts the JSON defensively, never shows raw JSON to the student, and converts LaTeX to plain text.
- **The AI never computes the answer.** Answers come from our engines and closed-form formulas, so a model can't hallucinate a result.
- **Tutor guardrails:** a Socratic system prompt (predict first, use only the numbers provided). Actions are filtered to real parameters and clamped to slider ranges, and the student must click to run them.
- **Abuse limits:** request size limits and a per-IP rate limit (best effort on serverless). When a free quota runs out, the user is told to try later or use the offline parser.
- **Privacy:** no accounts and no server storage. Photos are resized on the device (EXIF stripped) and sent only when the user asks for AI parsing. The About page states this.
