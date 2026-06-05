import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'

type Role = 'viewer' | 'admin'

interface AuthContextValue {
  /** Role of the current session. */
  role: Role
  /** True when the session can edit content (admin). */
  isAdmin: boolean
  /** Clears the session and returns to the login screen. */
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Read the current auth state from inside <AuthGate>. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthGate>')
  return ctx
}

type Status = 'checking' | 'locked' | 'authed'

/**
 * Gates the whole app behind the server-verified login. On mount it asks
 * /api/session whether a valid cookie already exists; otherwise it shows the
 * password screen. The password is sent to the server and never lives in the
 * client bundle.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('checking')
  const [role, setRole] = useState<Role>('viewer')

  const [mode, setMode] = useState<Role>('viewer')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Check for an existing session once on load.
  useEffect(() => {
    let cancelled = false
    fetch('/api/session', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { role?: Role } | null) => {
        if (cancelled) return
        if (data && (data.role === 'viewer' || data.role === 'admin')) {
          setRole(data.role)
          setStatus('authed')
        } else {
          setStatus('locked')
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('locked')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const submit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (submitting) return
      setSubmitting(true)
      setError('')
      try {
        const url = mode === 'admin' ? '/api/admin/login' : '/api/login'
        const payload = mode === 'admin' ? { user, password } : { password }
        const res = await fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (res.ok) {
          const data: { role?: Role } = await res.json()
          setRole(data.role === 'admin' ? 'admin' : 'viewer')
          setPassword('')
          setStatus('authed')
          return
        }
        if (res.status === 401) {
          setError(mode === 'admin' ? 'Usuario o contraseña incorrectos' : 'Contraseña incorrecta')
        } else if (res.status === 500) {
          setError('Servidor no configurado (faltan variables de entorno).')
        } else {
          setError('No se pudo iniciar sesión. Inténtalo de nuevo.')
        }
      } catch {
        setError('Sin conexión con el servidor.')
      } finally {
        setSubmitting(false)
      }
    },
    [mode, password, user, submitting],
  )

  const logout = useCallback(async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
    } finally {
      setRole('viewer')
      setMode('viewer')
      setPassword('')
      setStatus('locked')
    }
  }, [])

  if (status === 'checking') {
    return (
      <div className="loading-screen">
        <div className="pokeball-loader" />
        <p className="loading-text">Verificando acceso...</p>
      </div>
    )
  }

  if (status === 'locked') {
    return (
      <div className="auth-screen">
        <form className="pokemon-box auth-card" onSubmit={submit}>
          <div className="auth-logo">🌍</div>
          <h1 className="auth-title">PokéGlobe</h1>
          <p className="auth-subtitle">
            {mode === 'admin' ? 'Acceso de administrador' : 'Introduce la contraseña para entrar'}
          </p>

          {mode === 'admin' && (
            <input
              className="pokemon-input auth-input"
              type="text"
              placeholder="Usuario"
              autoComplete="username"
              value={user}
              onChange={(e) => setUser(e.target.value)}
            />
          )}

          <input
            className="pokemon-input auth-input"
            type="password"
            placeholder="Contraseña"
            autoComplete={mode === 'admin' ? 'current-password' : 'one-time-code'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />

          {error && <p className="auth-error">{error}</p>}

          <button className="auth-btn" type="submit" disabled={submitting}>
            {submitting ? 'Comprobando…' : mode === 'admin' ? 'Entrar' : 'Acceder'}
          </button>

          <button
            type="button"
            className="auth-switch"
            onClick={() => {
              setMode((m) => (m === 'admin' ? 'viewer' : 'admin'))
              setError('')
              setPassword('')
            }}
          >
            {mode === 'admin' ? '← Volver a acceso normal' : 'Entrar como administrador'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ role, isAdmin: role === 'admin', logout }}>
      {children}
    </AuthContext.Provider>
  )
}
