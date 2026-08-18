import React, { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in Admin App:', error, errorInfo)
  }

  private handleReload = () => {
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '24px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#fcfbf9',
          color: '#2c251e',
          textAlign: 'center',
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>页面出现临时异常</h2>
          <p style={{ color: '#7c7267', fontSize: '14px', maxWidth: '480px', marginBottom: '20px' }}>
            {this.state.error?.message || '发生未知错误，请点击下方按钮刷新或重试。'}
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              background: '#d4a574',
              color: '#fff',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            刷新页面
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
