import { fmt } from "@lablens/engine";

export interface LabEvent {
  t: number;
  message: string;
}

export function EventLog({ events, t, onSeek }: { events: LabEvent[]; t: number; onSeek: (t: number) => void }) {
  if (!events.length) return <p className="text-sm text-muted">No events — the motion is smooth throughout.</p>;
  return (
    <ol className="grid gap-1 text-sm">
      {events.map((e, i) => (
        <li key={i}>
          <button
            className={`w-full text-left flex gap-3 rounded-lg px-2 py-1.5 hover:bg-line/50 ${e.t <= t + 1e-9 ? "" : "opacity-60"}`}
            onClick={() => onSeek(e.t)}
          >
            <span className="num text-signal w-20 shrink-0">{fmt(e.t, "s")}</span>
            <span>{e.message}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
