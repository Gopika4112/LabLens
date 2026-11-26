import { fmt, paramValue, type Scene } from "@lablens/engine";

export function Params({ scene, onChange }: { scene: Scene; onChange: (id: string, v: number) => void }) {
  if (!scene.params.length) return <p className="text-sm text-muted">This scene has no adjustable parameters. Edit it in the Builder.</p>;
  return (
    <div className="grid gap-3">
      {scene.params.map((p) => {
        const v = paramValue(scene, p.id) ?? p.min;
        const fill = ((v - p.min) / (p.max - p.min)) * 100;
        const unit = p.unit === "°" ? "°" : p.unit;
        return (
          <div key={p.id} className="grid gap-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={`param-${p.id}`} className="text-sm font-medium">
                {p.label}
              </label>
              <span className="num text-sm text-signal">{unit === "°" ? `${fmt(v)}°` : fmt(v, unit, 3)}</span>
            </div>
            <input
              id={`param-${p.id}`}
              type="range"
              className="dial"
              min={p.min}
              max={p.max}
              step={p.step}
              value={v}
              style={{ ["--fill" as string]: `${fill}%` }}
              onChange={(e) => onChange(p.id, Number(e.target.value))}
              aria-valuetext={unit === "°" ? `${fmt(v)} degrees` : fmt(v, unit, 3)}
            />
          </div>
        );
      })}
    </div>
  );
}
