import { Component, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '2rem',
            background: 'linear-gradient(180deg, #f4f6f8 0%, #e9ecf1 100%)',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '600px',
              boxShadow: '0 2px 24px rgba(0,0,0,0.1)',
            }}
          >
            <h1 style={{ color: '#d32f2f', marginBottom: '1rem' }}>
              Something went wrong
            </h1>
            <p style={{ color: '#666', marginBottom: '1rem' }}>
              The application encountered an unexpected error.
            </p>
            <details style={{ marginBottom: '1rem' }}>
              <summary style={{ cursor: 'pointer', color: '#1976d2' }}>
                Error Details
              </summary>
              <pre
                style={{
                  background: '#f5f5f5',
                  padding: '1rem',
                  borderRadius: '4px',
                  overflow: 'auto',
                  fontSize: '0.875rem',
                  marginTop: '0.5rem',
                }}
              >
                {this.state.error?.toString()}
              </pre>
            </details>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: 'rgba(50, 147, 226, 0.8)',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
