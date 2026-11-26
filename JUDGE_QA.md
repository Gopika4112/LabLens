# The 15 hardest judge questions

**1. Isn't this just ChatGPT with a nice UI?**
No. Delete the AI and LabLens still simulates 25 textbook problems, parses typed problems offline, runs predict-test-explain experiments, sonifies graphs and verifies every answer. The AI only turns photos into a Scene Graph and chats. It never computes a physics answer. The answers come from about 5,700 lines of engine code we wrote: constrained dynamics, Modified Nodal Analysis, and a ray tracer.

**2. How do you know the simulation is correct?**
Two independent code paths have to agree. The analytic layer computes the textbook formula; the engine's trajectory is *measured* (velocity fits, zero crossings, constraint forces). 39 closed-form cases agree, most to better than 10⁻⁶ %. On top of that, every scene runs universal audits: energy conservation, Kirchhoff's current law, Tellegen's theorem, and Snell residuals. The Engine Accuracy page reruns all of it live in your browser in about 2 seconds.

**3. What happens when the AI misreads a photo?**
Three layers. (1) Validation: the reply must pass the Zod schema and semantic checks (every rope connects real bodies, and so on). (2) Repair: failures go back to the model with the exact errors, up to 3 attempts. (3) Transparency: the *"Did I understand this correctly?"* card lists what was read, what was assumed, what was unclear, and the confidence. The student can fix any value with sliders or open the builder.

**4. How would a school with no internet use it?**
Load it once (or install it as a PWA) and everything except photo reading and free-form chat works offline: engines, examples, the offline text parser, the builder, experiments, sonification. Initial JS is about 158 KB gzipped, physics runs on the device, and photos are resized on the device when you do have a connection.

**5. How does a blind student actually use it?**
Keyboard-only (**?** opens the shortcut sheet): Space plays, arrows step, **S** describes the scene, **D** describes the current moment, and events are announced live (*"the block reaches the pulley at t = 1.12 s"*). Any graph can be *heard*: pitch for value, left-to-right pan for time, a click at every zero crossing. Every graph has a data table and the free-body diagram is also a list of forces. axe reports 0 violations and Lighthouse accessibility is 100. **Honest gap:** we have not yet tested with blind students; that is our next step.

**6. Why write your own engines instead of using Matter.js or ngspice?**
Game engines (Matter.js, Box2D) favour stability over accuracy and don't give you exact tension or normal forces. LabLens needs λ, the constraint force, for free-body diagrams and textbook comparison. Writing MNA and the ray tracer ourselves let us add audits, exact switch handling and paraxial extrapolation. It's also the part of the project that is most educational.

**7. What's the numerical method, and why RK4?**
Forces plus Lagrange-multiplier constraints give accelerations, integrated with RK4, followed by a RATTLE-style projection. We *measured* the convergence orders: 4.000 for RK4, 2.000 for Verlet, 1.002 for semi-implicit Euler. Verlet is available for long runs because its energy error stays bounded.

**8. How do you handle friction's stick/slip discontinuity?**
Each step we first try a "stick" constraint. If the required friction exceeds μs·N, the block slides opposite to the friction it needed. While sliding, kinetic friction is folded into the contact force so it's exactly μk·N. A velocity sign change inside a step is detected and the stopping time interpolated, which is accurate to about 10⁻¹² s.

**9. Circuits: how do capacitors work in a DC-style solver?**
Companion models. The trapezoidal rule turns each capacitor into a conductance 2C/Δt in parallel with a current source carrying history, so each time step is a linear solve. Switch instants are hit exactly and the state is re-initialized, which avoids trapezoidal ringing. AC analysis reuses the same stamps with complex numbers.

**10. Who is this actually for, and will they use it?**
Secondary students (ages 14–18) and teachers, especially where labs are scarce. In TIMSS 2019 only 36% of fourth-graders internationally were in schools with a science lab, and in South Africa 17.4% of public schools have one. It runs in a phone browser, so there is nothing to buy. We have **not** run classroom pilots yet and don't claim learning gains; pilots are the next milestone.

**11. Isn't a Socratic tutor that predicts-and-checks just a quiz?**
The difference is that **the simulation grades the prediction**. The "right answer" is computed from the measured before/after ratio, not stored in a key, so the same mechanism works for any scene and the student sees the experiment that proves it. The reflection prompt then asks *why*.

**12. What if the AI tutor gives a wrong explanation?**
It only sees verified numbers (simulated vs. analytic), is told not to invent measurements, and proposes experiments rather than claims. Its actions are buttons, filtered to real parameters and clamped to valid ranges. The engine remains the source of truth, and the verification strip stays on screen.

**13. What are the limits?**
2-D point masses (no rolling), ideal pulleys, linear circuits (no diodes), geometric optics (no diffraction or dispersion). AI parsing accuracy on messy photos hasn't been benchmarked against a labelled dataset yet. All of this is in the README roadmap.

**14. How much does it cost to run?**
Nothing. The engines run on the student's device. Photo parsing and chat use **free** models: Google Gemini's free tier by default, or an open model on a school's own Ollama server, which is free, private and needs no internet. A classroom can also run entirely in offline mode.

**15. What did AI write, and do you understand it?**
We used Claude Code as a pair programmer, disclosed in AI_DISCLOSURE.md. Everything is covered by tests and explained module by module in HOW_IT_WORKS.md, and each team member reviewed specific modules (listed in AI_DISCLOSURE.md). Ask us to walk through the constraint solver or an MNA stamp.
