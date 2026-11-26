# Credits

All physics engines, solvers, the analytic layer, parsers, the tutor engine, renderers and the UI were written for this project. Third-party software used:

## Runtime
| Package | Version | License | Used for |
|---|---|---|---|
| react, react-dom | 19.3.1 | MIT | UI |
| zod | 4.6.7 | MIT | Scene Graph schema and validation |
| workbox-window (via vite-plugin-pwa) | 7.4.1 | MIT | Service worker registration (offline) |

## Fonts (self-hosted, SIL Open Font License 1.1)
| Font | Package | License |
|---|---|---|
| Fraunces | @fontsource-variable/fraunces 5.3.0 | OFL-1.1 |
| IBM Plex Sans | @fontsource/ibm-plex-sans 5.3.0 | OFL-1.1 |
| IBM Plex Mono | @fontsource/ibm-plex-mono 5.3.0 | OFL-1.1 |
| OpenDyslexic | @fontsource/opendyslexic 5.3.0 | OFL-1.1 |

## Build and test tooling
| Package | Version | License |
|---|---|---|
| vite | 8.3.8 | MIT |
| @vitejs/plugin-react | 6.3.0 | MIT |
| tailwindcss, @tailwindcss/vite | 4.3.5 | MIT |
| vite-plugin-pwa | 2.0.0 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| vitest | 4.1.12 | MIT |
| @testing-library/react | 16.3.3 | MIT |
| jsdom | 27.4.0 | MIT |
| eslint, @eslint/js | 10.x | MIT |
| typescript-eslint | 8.74.0 | MIT |
| eslint-plugin-react-hooks | 7.1.1 | MIT |
| prettier | 3.10.1 | MIT |
| tsx | 4.23.15 | MIT |
| playwright-core | 1.65.1 | Apache-2.0 (screenshots and audits only) |
| axe-core | 4.14.1 | MPL-2.0 (audit script only, not shipped) |
| lighthouse (via npx) | 12.8.2 | Apache-2.0 (audit only, not shipped) |

## AI services (optional, called from `api/` over HTTP; no SDKs bundled)
- Google Gemini API, free tier (default). Subject to Google's API terms; free-tier content may be used to improve Google products.
- Ollama (MIT), with open-weight vision models under their own licenses (e.g. Qwen2.5-VL, Gemma).
- OpenRouter, Groq and Anthropic Claude, all optional.

## Assets
- App icon, favicon and the sample hand-drawn sketch (`apps/web/public/samples/pulley-sketch.png`) were created for this project. The sketch was generated programmatically to look hand-drawn; it is not a photo of real student work.

## Data and sources cited in the README
- TIMSS 2019 International Results, IEA / TIMSS & PIRLS International Study Center
- South Africa Department of Basic Education EFMS report, as reported by TimesLIVE (2 Oct 2023)
- American Institute of Physics, preliminary high-school physics enrollment data (2025)
- World Health Organization, *World report on vision* (2019)
