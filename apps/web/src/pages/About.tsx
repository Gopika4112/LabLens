export function About() {
  return (
    <article className="max-w-3xl grid gap-6 leading-relaxed">
      <header>
        <h1 className="font-display text-4xl">Why LabLens exists</h1>
        <p className="text-muted mt-2 text-lg">
          Every student deserves to poke at a physics problem and watch it answer back — even without a lab, a fast connection, or sight.
        </p>
      </header>
      <section className="card p-5 grid gap-2">
        <h2 className="font-display text-2xl">What happens when you press “Build the lab”</h2>
        <ol className="list-decimal pl-5 grid gap-1.5">
          <li>
            <strong>Perceive.</strong> Your text (or photo) becomes a typed <em>Scene Graph</em> — offline with a rule-based parser, or with Claude's vision
            when the AI service is on. Every scene is validated twice (structure and physics references); AI drafts that fail are sent back with the exact
            errors to be repaired.
          </li>
          <li>
            <strong>Simulate.</strong> LabLens's own engines — written from scratch, no physics libraries — run in a background thread on your device:
            constrained dynamics with RK4, Modified Nodal Analysis for circuits, and a ray tracer using Snell's law.
          </li>
          <li>
            <strong>Verify.</strong> A separate analytic layer recognises the textbook setup, derives the closed-form answer, and compares it with what the
            simulation measured. Energy, Kirchhoff and Snell audits check every scene, even ones with no textbook formula.
          </li>
          <li>
            <strong>Explore and explain.</strong> Sliders, live plots, auto-generated free-body diagrams and a lab partner that asks you to predict before it
            shows you.
          </li>
        </ol>
      </section>
      <section className="card p-5 grid gap-2">
        <h2 className="font-display text-2xl">Accessibility is part of the physics</h2>
        <ul className="list-disc pl-5 grid gap-1.5">
          <li>
            <strong>Hear any graph.</strong> Press “Listen”: pitch follows the value, sound pans left-to-right with time, and a click marks every zero crossing.
            A low/high reference pair plays first.
          </li>
          <li>
            <strong>Narration.</strong> Events are announced as they happen (“the block reaches the pulley at t = 1.42 s”); press <kbd>D</kbd> to describe the
            current moment, <kbd>S</kbd> to describe the whole scene.
          </li>
          <li>
            <strong>Keyboard-only use</strong>, visible focus, data tables behind every graph, dyslexia-friendly font, larger text, light/dark themes and
            reduced motion.
          </li>
          <li>
            <strong>Works offline</strong> after the first visit (installable PWA). Engines and examples need no network at all.
          </li>
        </ul>
      </section>
      <section className="card p-5 grid gap-2">
        <h2 className="font-display text-2xl">Privacy</h2>
        <p>
          LabLens has no accounts and stores nothing on a server. Settings live in your browser. If — and only if — you use AI photo/text parsing or the AI
          tutor, the problem (photo resized on your device) and the lab state are sent to the configured AI provider (by default Google's free Gemini tier,
          which may use free-tier content to improve its products; schools can run a private local model with Ollama instead).
        </p>
      </section>
      <section className="card p-5 grid gap-2">
        <h2 className="font-display text-2xl">Honest limits</h2>
        <ul className="list-disc pl-5 grid gap-1">
          <li>Mechanics is 2-D and bodies are point masses (balls slide; they don't roll). Pulleys are ideal and massless.</li>
          <li>Circuits are linear (R, L, C, ideal sources and switches) — no diodes or transistors yet.</li>
          <li>Optics is geometric (rays), so no diffraction or interference; colour dispersion is not modelled.</li>
          <li>The AI parser can misread messy photos — that's why every parse shows what it read, what it assumed, and lets you fix it.</li>
        </ul>
      </section>
      <p className="text-sm text-muted">
        Source, documentation, test results and credits are in the project repository. Built for the Global STEM Innovation Challenge 2026 with AI-assisted
        development, disclosed in AI_DISCLOSURE.md.
      </p>
    </article>
  );
}
