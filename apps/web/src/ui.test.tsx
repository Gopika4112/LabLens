import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { EXAMPLES, exampleScene, runScene, paramValue } from "@lablens/engine";
import { VerificationPanel } from "./components/Verification";
import { Params } from "./components/Params";
import { EventLog } from "./components/EventLog";
import { plotsFor, frameAt } from "./lib/series";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

afterEach(cleanup);

describe("verification panel", () => {
  it("shows simulated vs analytic with the error, and a pass mark", () => {
    const out = runScene(exampleScene("atwood"));
    render(<VerificationPanel v={out.verification} />);
    expect(screen.getByText(/Checked against theory/)).toBeTruthy();
    expect(screen.getByText(/Verified\./)).toBeTruthy(); // screen-reader status
    expect(screen.getAllByText(/1\.962 m\/s²/).length).toBeGreaterThan(0);
  });
  it("renders a busy state while simulating (never blank)", () => {
    render(<VerificationPanel v={null} />);
    expect(screen.getByText(/Simulating/)).toBeTruthy();
  });
});

describe("parameter sliders", () => {
  it("are labelled, carry units, and report changes", () => {
    const scene = exampleScene("pendulum");
    const onChange = vi.fn();
    render(<Params scene={scene} onChange={onChange} />);
    const slider = screen.getByLabelText("Length L") as HTMLInputElement;
    expect(Number(slider.value)).toBe(paramValue(scene, "L"));
    fireEvent.change(slider, { target: { value: "2" } });
    expect(onChange).toHaveBeenCalledWith("L", 2);
  });
});

describe("event log", () => {
  it("lets keyboard users jump to an event", () => {
    const onSeek = vi.fn();
    render(<EventLog events={[{ t: 1.42, message: "The block reaches the pulley" }]} t={0} onSeek={onSeek} />);
    fireEvent.click(screen.getByRole("button", { name: /reaches the pulley/ }));
    expect(onSeek).toHaveBeenCalledWith(1.42);
  });
});

describe("plot series", () => {
  it("every example yields finite plot data", () => {
    for (const e of EXAMPLES) {
      const s = exampleScene(e.id);
      for (const p of plotsFor(s, runScene(s)))
        for (const ser of p.series) {
          expect(ser.xs.length, `${e.id}/${p.id}`).toBe(ser.ys.length);
          expect(ser.ys.some(Number.isFinite), `${e.id}/${p.id}/${ser.label}`).toBe(true);
        }
    }
  });
  it("maps times to the nearest frame", () => {
    expect(frameAt([0, 0.1, 0.2, 0.3], 0.16)).toBe(2);
    expect(frameAt([0, 0.1, 0.2], 5)).toBe(2);
    expect(frameAt([0, 0.1, 0.2], -1)).toBe(0);
  });
});
