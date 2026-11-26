# Demo video: 2:30 shot list

**Setup before recording:** deployed app (or `npm run dev`) with a free `GEMINI_API_KEY` set (or Ollama running); light theme; a phone with the sample sketch printed or drawn on paper (`apps/web/public/samples/pulley-sketch.png`); browser at 1440×900; headphones for the sonification segment. Do a dry run of the AI parse first: never fake a result. If the parse fails on camera, show the repair or the "Did I understand?" card. That is part of the story.

| Time | On screen | Voice-over |
|---|---|---|
| 0:00–0:05 | Close-up: hand holds a phone over a messy pulley sketch and takes a photo. | "This is a physics homework problem." |
| 0:05–0:15 | Upload → "Reading your photo…" → the lab appears: block sliding, force arrows, velocity graph drawing itself, instrument strip **✔ Simulated a = 3.244 m/s² · Analytic = 3.244 m/s²**. | "Three seconds later it's a live lab, and it has checked its own answer against the textbook formula." |
| 0:15–0:25 | Drag the hanging-mass slider from 3 to 8 kg; everything updates live. | "What if the hanging mass were heavier? Don't calculate it. Try it." |
| 0:25–0:45 | Title card + stats (TIMSS 36%, South Africa 17.4%, WHO 2.2 billion). | "Most students never get a lab. In TIMSS 2019, only a third of fourth-graders internationally had one at school, and in South Africa fewer than one in five public schools do. For blind students, diagram-based physics is closed off almost entirely." |
| 0:45–1:00 | "Did I understand this correctly?" card: values read, assumptions, confidence. | "LabLens shows what it read and what it assumed, and the student can fix anything. The AI only reads the problem. It never computes the answer." |
| 1:00–1:20 | Open "How do we know?" → audits. Then the **Engine accuracy** page, run live: 39/39. | "The answers come from physics engines we wrote ourselves: constrained dynamics, circuit nodal analysis and a ray tracer. Every result is compared with theory, and judges can rerun all 39 checks in their own browser." |
| 1:20–1:40 | Lab partner: pick "Decreases", lock it in → "Prediction confirmed, 3.24 → 2.56 m/s²" → reflection question. | "The tutor never gives the answer first. You predict, the simulation runs the experiment, and the simulation decides whether you were right. Then it asks you why." |
| 1:40–2:00 | Close eyes / dim screen. Press **L** on the velocity graph (audio audible), press **D** (screen reader speaks the moment). Show the keyboard map. | "Now listen. Pitch is velocity, left to right is time, and each click is a change of direction. A blind student can explore this graph, and the screen reader narrates every event." |
| 2:00–2:15 | Quick montage: RLC circuit with current dots + resonance plot; total internal reflection; phone layout; airplane mode → still works. | "Mechanics, circuits and optics, on any phone, and it keeps working offline after the first visit." |
| 2:15–2:30 | Logo + pitch + URL. | "LabLens. Photograph a physics problem, get a live lab." |
