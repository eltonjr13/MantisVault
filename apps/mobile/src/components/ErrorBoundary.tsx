import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="app-shell">
          <header className="topbar">
            <div>
              <span className="brand-kicker">Kazento Local Vault</span>
              <h1>KazVault</h1>
            </div>
          </header>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Erro de Renderização</h2>
                <p>A aplicação encontrou um erro.</p>
              </div>
            </div>
            <p className="error-line">
              {this.state.error?.message || "Erro desconhecido"}
            </p>
            <pre className="error-line" style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem" }}>
              {this.state.error?.stack}
            </pre>
            <button
              className="primary-button"
              type="button"
              onClick={() => window.location.reload()}
            >
              Recarregar Aplicação
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
