type LoginGateProps = {
  isLoading: boolean
  error: string | null
  onLogin: () => void
}

export default function LoginGate({ isLoading, error, onLogin }: LoginGateProps) {
  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Custom admin</p>
        <h1>Alpaca Notes Admin</h1>
        <p>Sign in with the owner GitHub account to continue into the custom editor.</p>
        {error ? <p className="error-message">{error}</p> : null}
        <button className="primary-button" type="button" onClick={onLogin} disabled={isLoading}>
          {isLoading ? 'Signing in…' : 'Sign in with GitHub'}
        </button>
      </section>
    </main>
  )
}
