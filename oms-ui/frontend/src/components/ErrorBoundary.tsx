// ErrorBoundary.tsx - Top-level React error boundary so a render or streaming
// failure degrades gracefully instead of blanking the whole application.
import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h1>Something went wrong</h1>
          <p>The OMS Admin Tool encountered an unexpected error.</p>
          {this.state.error && (
            <pre className="error-boundary-details">{this.state.error.message}</pre>
          )}
          <button onClick={this.handleReload}>Reload Application</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
