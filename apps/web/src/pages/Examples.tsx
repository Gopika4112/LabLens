import { useMemo, useState } from "react";
import { EXAMPLES, TEMPLATES, exampleScene, traceOptics } from "@lablens/engine";
import { SceneView } from "../components/SceneView";
import { Icon } from "../components/Icon";

const DOMAINS = [
  { id: "mechanics", label: "Mechanics" },
  { id: "circuits", label: "Circuits" },
  { id: "optics", label: "Optics" },
] as const;

function Thumb({ id }: { id: string }) {
  const scene = useMemo(() => exampleScene(id), [id]);
  const out = useMemo(
    () =>
      scene.domain === "optics"
        ? {
            domain: "optics" as const,
            result: traceOptics(scene.optics!),
            verification: { archetype: null, summary: "", quantities: [], audits: [], notes: [] },
          }
        : null,
    [scene],
  );
  return <SceneView scene={scene} output={out} frame={0} selected={null} height={150} compact />;
}

export function Examples() {
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const titles = useMemo(() => new Map(EXAMPLES.map((e) => [e.id, exampleScene(e.id).title])), []);
  const q = query.trim().toLowerCase();
  const list = EXAMPLES.filter(
    (e) =>
      (filter === "all" || TEMPLATES[e.template].domain === filter) &&
      (!q || `${titles.get(e.id)} ${e.problemText} ${e.tags.join(" ")}`.toLowerCase().includes(q)),
  );
  return (
    <div className="grid gap-6">
      <div className="max-w-2xl">
        <h1 className="font-display text-4xl">Examples</h1>
        <p className="text-muted mt-2">
          {EXAMPLES.length} textbook problems that run fully offline. Every one is simulated by LabLens's own engines and checked against the closed-form
          answer.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filter by topic" className="flex gap-2 flex-wrap">
          {[{ id: "all", label: "All" }, ...DOMAINS].map((d) => (
            <button
              key={d.id}
              className={`btn !min-h-10 text-sm ${filter === d.id ? "!bg-ink !text-paper" : ""}`}
              aria-pressed={filter === d.id}
              onClick={() => setFilter(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <label className="relative flex-1 min-w-[220px] max-w-sm">
          <span className="sr-only">Search examples</span>
          <Icon name="search" size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="search"
            className="field !pl-9 !min-h-10"
            placeholder="Search: pendulum, lens, friction…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <p className="text-sm text-muted" aria-live="polite">
          {list.length === EXAMPLES.length ? `${list.length} problems` : `${list.length} of ${EXAMPLES.length}`}
        </p>
      </div>
      {list.length === 0 && (
        <div className="card p-6 grid gap-2 justify-items-start">
          <p className="font-medium">No example matches “{query}”.</p>
          <p className="text-sm text-muted">Try a topic like “spring” or “capacitor”, or type your own problem in the lab. LabLens will build it.</p>
          <div className="flex gap-2 mt-1">
            <button className="btn !min-h-10 text-sm" onClick={() => (setQuery(""), setFilter("all"))}>
              Clear search
            </button>
            <a className="btn btn-primary !min-h-10 text-sm" href="#/lab">
              Go to the lab
            </a>
          </div>
        </div>
      )}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map((e) => {
          const t = TEMPLATES[e.template];
          return (
            <li
              key={e.id}
              className="card overflow-hidden flex flex-col relative group transition-[box-shadow,border-color] duration-200 hover:border-ink/40 hover:shadow-[0_14px_30px_-20px_rgba(23,32,51,0.45)] has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-signal has-[a:focus-visible]:outline-offset-2"
            >
              <div className="border-b border-line bg-paper/50">
                <Thumb id={e.id} />
              </div>
              <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex gap-1.5 flex-wrap">
                  <span className="chip">{t.domain}</span>
                  {e.tags
                    .filter((tag) => tag !== t.domain)
                    .slice(0, 2)
                    .map((tag) => (
                      <span key={tag} className="chip">
                        {tag}
                      </span>
                    ))}
                </div>
                <h2 className="font-display text-lg leading-snug">
                  {/* the title link stretches over the whole card */}
                  <a href={`#/lab/${e.id}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
                    {titles.get(e.id)}
                  </a>
                </h2>
                <p className="text-sm text-muted flex-1">{e.problemText}</p>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-signal" aria-hidden>
                  Open in the lab
                  <Icon name="arrowRight" size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
