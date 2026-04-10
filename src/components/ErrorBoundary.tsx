import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      let errorMessage = "An unexpected error occurred.";
      let isPermissionError = false;

      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error && parsed.error.includes("permission")) {
            errorMessage = "You don't have permission to access this data. Please check your sharing settings.";
            isPermissionError = true;
          }
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--app-shell)] p-6">
          <div className="glass-card max-w-md w-full space-y-6 rounded-3xl border p-8 text-center" style={{ borderColor: "var(--app-border)" }}>
            <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 mx-auto">
              <AlertTriangle size={32} />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">Something went wrong</h2>
              <p className="text-sm text-fintech-muted leading-relaxed">
                {errorMessage}
              </p>
            </div>
            <button
              onClick={this.handleReset}
              className="w-full flex items-center justify-center gap-2 py-4 bg-fintech-accent text-white rounded-2xl font-bold hover:bg-fintech-accent/90 transition-all"
            >
              <RefreshCw size={18} />
              <span>{isPermissionError ? "Try Again" : "Reload App"}</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
