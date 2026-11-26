import { readValues } from "../lib/readValues";
import { useEffect, useRef, useState } from "react";
import { buildTemplate, parseOffline, sceneFrom, TEMPLATES } from "@lablens/engine";
import { aiHealth, parseWithAI, prepareImage, type ImagePayload } from "../lib/api";
import { setScene, type Understanding } from "../lib/sceneStore";

const SAMPLES = [
  "A 2 kg block on a 30° incline with friction 0.2 is attached over a pulley to a 3 kg hanging mass.",
  "A ball is thrown at 18 m/s at 40° from the top of a 12 m cliff.",
  "A 220 µF capacitor charges through a 4.7 kΩ resistor from a 9 V battery.",
  "An object is 25 cm from a converging lens with a focal length of 10 cm.",
];

type Stage = "idle" | "reading" | "validating" | "done" | "error";

export function ProblemInput({ onBuilt }: { onBuilt?: () => void }) {
  const [tab, setTab] = useState<"text" | "photo">("text");
  const [text, setText] = useState("");
  const [image, setImage] = useState<ImagePayload | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [msg, setMsg] = useState<string>("");
  const [ai, setAi] = useState<boolean | null>(null);
  const [aiName, setAiName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void aiHealth().then((h) => {
      setAi(h.ai);
      setAiName(h.provider ?? null);
    });
  }, []);

  const offline = (t: string, note?: string): boolean => {
    const p = parseOffline(t);
    if (!p) return false;
    const base = buildTemplate(p.template, p.args);
    const scene = sceneFrom({ ...base, id: "typed", problemText: t });
    const u: Understanding = {
      source: "offline",
      confidence: p.confidence,
      found: p.found.map((k) =>
        `${TEMPLATES[p.template].argDocs[k]?.[0] ?? k} = ${+p.args[k].toPrecision(4)} ${TEMPLATES[p.template].argDocs[k]?.[1] ?? ""}`.trim(),
      ),
      assumed: p.assumed,
      uncertain: [],
    };
    setScene(scene, u);
    setStage("done");
    setMsg(note ?? `Built offline as “${TEMPLATES[p.template].title}”. Check the values below.`);
    onBuilt?.();
    return true;
  };

  const build = async () => {
    const t = text.trim();
    if (!t && !image) {
      setStage("error");
      setMsg("Type a problem or add a photo first.");
      return;
    }
    setStage("reading");
    setMsg(image ? "Reading your photo…" : "Reading your problem…");
    const h = await aiHealth();
    if (h.ai) {
      try {
        const r = await parseWithAI(t, image ?? undefined);
        if (r.mode === "unsupported") {
          setStage("error");
          setMsg(`That doesn't look like a problem LabLens can simulate yet: ${r.reason}`);
          return;
        }
        setStage("validating");
        setScene(r.scene, {
          source: "ai",
          confidence: r.confidence,
          found: r.args && r.template ? readValues(r.template, r.args, [...r.assumptions, ...r.uncertain]) : [],
          assumed: r.assumptions,
          uncertain: r.uncertain,
          repaired: r.repaired,
          imagePreview: image?.preview,
        });
        setStage("done");
        setMsg(r.repaired ? `Built after ${r.attempts - 1} automatic repair${r.attempts > 2 ? "s" : ""} of the AI's first draft.` : "Built from your problem.");
        onBuilt?.();
        return;
      } catch (e) {
        if (t && offline(t, `The AI service failed (${(e as Error).message}) — built with the offline parser instead.`)) return;
        setStage("error");
        setMsg(`${(e as Error).message} Try typing the problem, or pick an example.`);
        return;
      }
    }
    if (!t) {
      setStage("error");
      setMsg(
        "Reading photos needs the AI service, which isn't configured on this deployment. Type the problem instead (the offline parser understands common textbook problems), or open an example.",
      );
      return;
    }
    if (!offline(t)) {
      setStage("error");
      setMsg("The offline parser didn't recognise this problem. Try wording like the samples, use the Builder, or enable the AI service.");
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      setImage(await prepareImage(f));
      setStage("idle");
      setMsg("");
    } catch {
      setStage("error");
      setMsg("Couldn't read that image file.");
    }
  };

  const busy = stage === "reading" || stage === "validating";

  return (
    <section className="card p-4 grid gap-3" aria-labelledby="problem-h">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="problem-h" className="font-display text-xl">
          Your problem
        </h2>
        <span className="chip" title={ai ? `AI parsing via ${aiName ?? "the configured model"}` : "Offline parser (no AI service configured)"}>
          <span aria-hidden className={`inline-block w-2 h-2 rounded-full ${ai ? "bg-ok" : "bg-muted"}`} />
          {ai === null ? "checking…" : ai ? `AI on${aiName ? ` · ${aiName}` : ""}` : "offline mode"}
        </span>
      </div>
      <div role="tablist" aria-label="Input method" className="grid grid-cols-2 gap-1 p-1 rounded-xl border border-line">
        {(["text", "photo"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            aria-controls={`panel-${k}`}
            id={`tab-${k}`}
            className={`min-h-10 rounded-lg text-sm font-semibold ${tab === k ? "bg-ink text-paper" : "text-muted"}`}
            onClick={() => setTab(k)}
          >
            {k === "text" ? "Type it" : "Photo or sketch"}
          </button>
        ))}
      </div>
      {tab === "text" ? (
        <div id="panel-text" role="tabpanel" aria-labelledby="tab-text" className="grid gap-2">
          <label htmlFor="problem-text" className="sr-only">
            Problem text
          </label>
          <textarea
            id="problem-text"
            className="field min-h-28 resize-y"
            placeholder="e.g. a 2 kg block on a 30° incline with friction 0.2 attached over a pulley to a 3 kg hanging mass"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void build();
            }}
          />
          <div className="flex flex-wrap gap-1.5" aria-label="Sample problems">
            {SAMPLES.map((s, i) => (
              <button key={i} className="chip hover:text-ink hover:border-ink text-left" onClick={() => setText(s)}>
                {s.slice(0, 34)}…
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div id="panel-photo" role="tabpanel" aria-labelledby="tab-photo" className="grid gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            id="photo-input"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <label
            htmlFor="photo-input"
            className="grid place-items-center gap-1 min-h-32 rounded-xl border-2 border-dashed border-line cursor-pointer text-center p-3 hover:border-ink"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFile(e.dataTransfer.files[0]);
            }}
          >
            {image ? (
              <img src={image.preview} alt="Your problem photo" className="max-h-40 rounded-lg" />
            ) : (
              <>
                <span aria-hidden className="text-3xl">
                  ⌖
                </span>
                <span className="font-semibold">Take a photo or drop an image</span>
                <span className="text-xs text-muted">Textbook diagram, worksheet or a hand sketch. Resized on your device before upload.</span>
              </>
            )}
          </label>
          <div className="flex gap-2 flex-wrap">
            <button
              className="btn !min-h-9 text-sm"
              onClick={async () => {
                const r = await fetch(`${import.meta.env.BASE_URL}samples/pulley-sketch.png`);
                await onFile(new File([await r.blob()], "sketch.png", { type: "image/png" }));
              }}
            >
              Use the sample sketch
            </button>
            {image && (
              <button className="btn btn-ghost !min-h-9 text-sm" onClick={() => setImage(null)}>
                Remove photo
              </button>
            )}
          </div>
          <label htmlFor="photo-note" className="text-xs text-muted">
            Optional note (e.g. "find the tension")
          </label>
          <input id="photo-note" className="field" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      )}
      <button className="btn btn-primary w-full" onClick={() => void build()} disabled={busy}>
        {busy ? "Building your lab…" : "Build the lab"}
      </button>
      <p role="status" aria-live="polite" className={`text-sm min-h-5 ${stage === "error" ? "text-bad" : "text-muted"} ${busy ? "scanning rounded px-1" : ""}`}>
        {msg}
      </p>
    </section>
  );
}
