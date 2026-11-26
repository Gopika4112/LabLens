import { fmt } from "@lablens/engine";
import { Icon } from "./Icon";

interface Props {
  t: number;
  duration: number;
  playing: boolean;
  speed: number;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onSpeed: (s: number) => void;
  onRestart: () => void;
  /** time scale label e.g. "slow motion ×0.01" for fast circuits */
  scaleNote?: string;
  disabled?: boolean;
}

export function Timeline({ t, duration, playing, speed, onToggle, onSeek, onSpeed, onRestart, scaleNote, disabled }: Props) {
  const fill = duration > 0 ? (t / duration) * 100 : 0;
  return (
    <div className="flex items-center gap-2 sm:gap-3 flex-wrap" role="group" aria-label="Playback controls">
      <button className="btn btn-primary w-12 !px-0" onClick={onToggle} disabled={disabled} aria-label={playing ? "Pause (space)" : "Play (space)"}>
        <Icon name={playing ? "pause" : "play"} size={20} />
      </button>
      <button className="btn w-11 !px-0" onClick={onRestart} disabled={disabled} aria-label="Restart from t = 0 (Home)">
        <Icon name="restart" />
      </button>
      <label className="flex-1 min-w-[160px]">
        <span className="sr-only">Time</span>
        <input
          type="range"
          className="dial"
          min={0}
          max={duration}
          step={duration / 1000 || 0.001}
          value={t}
          disabled={disabled}
          style={{ ["--fill" as string]: `${fill}%` }}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-valuetext={`${fmt(t, "s")} of ${fmt(duration, "s")}`}
        />
      </label>
      <span className="num text-sm w-[9.5rem] text-right text-muted" aria-hidden>
        {fmt(t, "s")} / {fmt(duration, "s")}
      </span>
      <label className="text-sm text-muted flex items-center gap-1">
        <span className="sr-only">Playback speed</span>
        <select className="field !py-1.5 !px-2 w-auto text-sm" value={speed} onChange={(e) => onSpeed(Number(e.target.value))}>
          {[0.25, 0.5, 1, 2].map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>
      {scaleNote && <span className="chip num">{scaleNote}</span>}
    </div>
  );
}
