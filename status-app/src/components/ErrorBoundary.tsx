import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
    this.setState({ error, info });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-black text-white p-6 font-mono text-sm">
        <div className="max-w-3xl mx-auto pt-12">
          <p className="text-xs font-bold tracking-widest text-red-400 uppercase mb-4">
            Something broke
          </p>
          <h1 className="text-2xl font-extrabold mb-6 break-words">
            {this.state.error.name}: {this.state.error.message}
          </h1>
          <pre className="bg-white/5 border border-white/10 rounded-2xl p-5 text-xs whitespace-pre-wrap break-words text-white/70 overflow-auto max-h-[60vh]">
            {this.state.error.stack || "(no stack)"}
            {this.state.info?.componentStack
              ? "\n\nComponent stack:" + this.state.info.componentStack
              : ""}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ error: null, info: null })}
            className="mt-6 px-5 py-2.5 rounded-full bg-white text-black font-bold text-sm hover:opacity-90"
          >
            Réessayer
          </button>
          <a
            href="/"
            className="ml-3 inline-block px-5 py-2.5 rounded-full border border-white/20 font-bold text-sm hover:bg-white/5"
          >
            Accueil
          </a>
        </div>
      </div>
    );
  }
}
