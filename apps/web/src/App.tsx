import { Component, lazy, Suspense, type ReactNode } from "react";
import { useRoute } from "./lib/router";
import { Header } from "./components/Header";
import { KeyboardHelp } from "./components/KeyboardHelp";
import { Lab } from "./pages/Lab";
// secondary pages load on demand so the lab paints fast
const Examples = lazy(() => import("./pages/Examples").then((m) => ({ default: m.Examples })));
const Build = lazy(() => import("./pages/Build").then((m) => ({ default: m.Build })));
const Accuracy = lazy(() => import("./pages/Accuracy").then((m) => ({ default: m.Accuracy })));
const About = lazy(() => import("./pages/About").then((m) => ({ default: m.About })));

class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="card p-6 max-w-xl mx-auto grid gap-3">
        <h1 className="font-display text-2xl">Something went wrong on this page</h1>
        <p className="text-muted text-sm">{this.state.error.message}</p>
        <div className="flex gap-2">
          <button
            className="btn btn-primary"
            onClick={() => {
              try {
                sessionStorage.removeItem("lablens:lastScene");
              } catch {
                /* ignore */
              }
              location.hash = "#/lab/incline-pulley";
              location.reload();
            }}
          >
            Reset to a working example
          </button>
          <a className="btn" href="#/examples">
            Browse examples
          </a>
        </div>
      </div>
    );
  }
}

export function App() {
  const route = useRoute();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header route={route} />
      <KeyboardHelp />
      <main id="main" tabIndex={-1} className="max-w-[1600px] mx-auto px-4 py-5 outline-none">
        <ErrorBoundary resetKey={route.page + (route.arg ?? "")}>
          <Suspense fallback={<p className="text-muted p-6 scanning rounded-xl">Loading…</p>}>
            {route.page === "lab" && <Lab exampleId={route.arg} />}
            {route.page === "examples" && <Examples />}
            {route.page === "build" && <Build />}
            {route.page === "accuracy" && <Accuracy />}
            {route.page === "about" && <About />}
          </Suspense>
        </ErrorBoundary>
      </main>
      <footer className="max-w-[1600px] mx-auto px-4 py-8 text-xs text-muted flex flex-wrap gap-x-4 gap-y-1">
        <span>LabLens · MIT licensed · engines written from scratch</span>
        <span>Physics runs on your device · works offline</span>
      </footer>
    </>
  );
}
