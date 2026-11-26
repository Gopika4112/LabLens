import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyParam,
  CHOICES,
  classifyChange,
  describeMoment,
  experimentsFor,
  feedback,
  fmt,
  paramValue,
  type ChoiceId,
  type Scene,
  type SimOutput,
} from "@lablens/engine";
import { aiHealth, askTutor, type TutorReply } from "../lib/api";
import { simulate } from "../lib/worker";
import { earcon } from "../lib/sonify";
import { Icon } from "./Icon";

interface Props {
  scene: Scene;
  output: SimOutput | null;
  frame: number;
  events: string[];
  onApply: (paramId: string, value: number) => void;
}

type Phase =
  | { kind: "ask" }
  | { kind: "running" }
  | { kind: "result"; text: string; reflect: string; before: number; after: number; unit: string; actual: ChoiceId; prev: number };

type Msg = { role: "user" | "assistant"; content: string; actions?: TutorReply["actions"] };

/** Predict → Experiment → Explain. Works offline; the AI (free Gemini tier by default) adds open conversation when available. */
export function Tutor({ scene, output, frame, events, onApply }: Props) {
  const exps = useMemo(() => experimentsFor(scene), [scene.template?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const [idx, setIdx] = useState(0);
  const [pred, setPred] = useState<ChoiceId | null>(null);
  const [why, setWhy] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "ask" });
  const [ai, setAi] = useState(false);
  const [chat, setChat] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void aiHealth().then((h) => setAi(h.ai));
  }, []);
  useEffect(() => {
    setIdx(0);
    setPhase({ kind: "ask" });
    setPred(null);
  }, [scene.template?.name, scene.id]);
  useEffect(() => {
    if (chat.length) void chatEnd.current?.scrollIntoView({ block: "nearest" });
  }, [chat]);

  const exp = exps[idx % Math.max(1, exps.length)];

  const run = async () => {
    if (!exp || !pred || !output) return;
    setPhase({ kind: "running" });
    const q0 = output.verification.quantities.find((q) => q.id === exp.quantityId);
    const prev = paramValue(scene, exp.paramId)!;
    const next = exp.change(prev);
    onApply(exp.paramId, next);
    // measure "after" on our own copy so the verdict doesn't depend on UI timing
    const { output: out2 } = await simulate(applyParam(scene, exp.paramId, next));
    const q1 = out2.verification.quantities.find((q) => q.id === exp.quantityId);
    if (!q0 || !q1) {
      setPhase({
        kind: "result",
        text: "This experiment couldn't be measured for the current setup.",
        reflect: exp.reflect,
        before: NaN,
        after: NaN,
        unit: "",
        actual: "same",
        prev,
      });
      return;
    }
    const actual = classifyChange(q0.simulated, q1.simulated);
    earcon(actual === pred ? "success" : "event");
    setPhase({
      kind: "result",
      text: feedback(pred, actual, q0.simulated, q1.simulated, exp.quantityLabel, q0.unit),
      reflect: exp.reflect,
      before: q0.simulated,
      after: q1.simulated,
      unit: q0.unit,
      actual,
      prev,
    });
  };

  const send = async (text: string) => {
    if (!text.trim() || !output) return;
    const history = chat.map(({ role, content }) => ({ role, content }));
    setChat((c) => [...c, { role: "user", content: text }]);
    setInput("");
    if (!ai) {
      const e = exps[idx % Math.max(1, exps.length)];
      setChat((c) => [
        ...c,
        {
          role: "assistant",
          content: e
            ? `I'm running offline, so I can't chat freely — but here's an experiment to try: ${e.question} Make a prediction above, then run it.`
            : "I'm running offline. Try dragging a slider and watch how the verified numbers change.",
        },
      ]);
      return;
    }
    setThinking(true);
    try {
      const r = await askTutor({
        scene,
        state: {
          verification: {
            archetype: output.verification.archetype,
            quantities: output.verification.quantities.map((q) => ({ label: q.label, simulated: q.simulated, analytic: q.analytic, unit: q.unit })),
          },
          moment: describeMoment(scene, output, frame),
          events: events.slice(0, 20),
        },
        history,
        message: text,
      });
      setChat((c) => [
        ...c,
        {
          role: "assistant",
          content:
            r.reply +
            (r.prediction ? `\n\n${r.prediction.question}\n${r.prediction.choices.map((x, i) => `${String.fromCharCode(65 + i)}) ${x}`).join("\n")}` : ""),
          actions: r.actions,
        },
      ]);
    } catch (e) {
      setChat((c) => [...c, { role: "assistant", content: `(${(e as Error).message})` }]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <section className="card p-4 grid gap-3" aria-labelledby="tutor-h">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="tutor-h" className="font-display text-xl">
          Lab partner
        </h2>
        <span className="chip">predict → test → explain</span>
      </div>

      {exp ? (
        <div className="grid gap-2">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="flex gap-1" aria-hidden>
              {exps.map((_, k) => (
                <span key={k} className={`h-1.5 w-5 rounded-full ${k <= idx % exps.length ? "bg-signal" : "bg-line"}`} />
              ))}
            </span>
            Experiment {(idx % exps.length) + 1} of {exps.length}
          </div>
          <p className="font-medium">{exp.question}</p>
          {phase.kind !== "result" && (
            <fieldset className="grid gap-1" disabled={phase.kind === "running"}>
              <legend className="sr-only">Your prediction</legend>
              {CHOICES.map((c) => (
                <label
                  key={c.id}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer border ${pred === c.id ? "border-signal bg-signal/10" : "border-transparent hover:bg-line/40"}`}
                >
                  <input type="radio" name="pred" value={c.id} checked={pred === c.id} onChange={() => setPred(c.id)} className="accent-[var(--signal)]" />
                  <span className="text-sm">{c.label}</span>
                </label>
              ))}
              <label className="text-xs text-muted mt-1" htmlFor="why">
                Why do you think so? (optional — saying it out loud helps)
              </label>
              <input id="why" className="field !py-1.5 text-sm" value={why} onChange={(e) => setWhy(e.target.value)} />
              <button className="btn btn-primary mt-1" disabled={!pred || phase.kind === "running"} onClick={() => void run()}>
                {phase.kind === "running" ? "Running the experiment…" : `Lock it in & ${exp.changeLabel}`}
              </button>
            </fieldset>
          )}
          {phase.kind === "result" && (
            <div className="grid gap-2" aria-live="polite">
              <div className={`rounded-xl p-3 text-sm ${phase.actual === pred ? "bg-ok/10 border border-ok/40" : "bg-signal/10 border border-signal/40"}`}>
                <p className="font-semibold">{phase.actual === pred ? "Prediction confirmed" : "Surprise!"}</p>
                <p>{phase.text}</p>
                {Number.isFinite(phase.before) && (
                  <p className="num text-xs mt-1 text-muted">
                    measured by the engine · verified against theory · {fmt(phase.before, phase.unit)} → {fmt(phase.after, phase.unit)}
                  </p>
                )}
              </div>
              <p className="text-sm">
                <span className="font-semibold">Explain: </span>
                {phase.reflect}
              </p>
              <div className="flex gap-2 flex-wrap">
                <button
                  className="btn !min-h-10 text-sm"
                  onClick={() => {
                    onApply(exp.paramId, phase.prev);
                    setPhase({ kind: "ask" });
                    setPred(null);
                  }}
                >
                  Undo the change
                </button>
                <button
                  className="btn btn-primary !min-h-10 text-sm"
                  onClick={() => {
                    onApply(exp.paramId, phase.prev);
                    setIdx((i) => i + 1);
                    setPhase({ kind: "ask" });
                    setPred(null);
                    setWhy("");
                  }}
                >
                  Next experiment <Icon name="arrowRight" size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">Drag any slider and watch the verified numbers respond. Ask me anything below.</p>
      )}

      <div className="border-t border-line pt-3 grid gap-2">
        <h3 className="text-sm font-semibold">Ask about this experiment {ai ? "" : <span className="text-muted font-normal">(AI offline here)</span>}</h3>
        <div className="grid gap-2 max-h-64 overflow-y-auto" aria-live="polite">
          {chat.map((m, i) => (
            <div
              key={i}
              className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-ink text-paper justify-self-end max-w-[90%]" : "bg-line/50 max-w-[95%]"}`}
            >
              {m.content}
              {m.actions && m.actions.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-2">
                  {m.actions.map((a, k) => {
                    const p = scene.params.find((q) => q.id === a.param);
                    return (
                      <button key={k} className="btn btn-primary !min-h-8 !px-3 text-xs" onClick={() => onApply(a.param, a.value)}>
                        <Icon name="play" size={12} /> {a.label ?? `Set ${p?.label ?? a.param} = ${fmt(a.value, p?.unit ?? "")}`}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {thinking && <div className="rounded-xl px-3 py-2 text-sm bg-line/50 scanning">Thinking about your lab…</div>}
          <div ref={chatEnd} />
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <label htmlFor="tutor-input" className="sr-only">
            Message the lab partner
          </label>
          <input id="tutor-input" className="field" placeholder="Ask about what you see…" value={input} onChange={(e) => setInput(e.target.value)} />
          <button className="btn" type="submit" disabled={thinking || !input.trim()}>
            Ask
          </button>
        </form>
      </div>
    </section>
  );
}
