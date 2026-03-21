import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = "An unexpected error occurred.";
      
      try {
        // Check if it's a Firestore error JSON
        const errorData = JSON.parse(this.state.error?.message || "");
        if (errorData.operationType) {
          errorMessage = `Firestore Error: ${errorData.operationType} failed. ${errorData.error}`;
        }
      } catch (e) {
        // Not a JSON error
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-[100dvh] bg-black flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-zinc-900 border border-red-500/30 rounded-2xl p-8 shadow-2xl">
            <h2 className="text-2xl font-black text-red-500 mb-4 tracking-tighter uppercase">System Error</h2>
            <p className="text-zinc-400 text-sm mb-6 font-mono leading-relaxed">
              {errorMessage}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-white text-black rounded-xl font-bold hover:bg-zinc-200 transition-all active:scale-95"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
