import { useState, type FormEvent } from 'react';
import { sb } from '../lib/supabase';

/** App de un solo usuario: el registro está desactivado; el usuario se crea en el dashboard de Supabase. */
export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    setPending(false);
    if (error) setError(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error.message);
  }

  return (
    <div className="mx-auto max-w-[380px] px-4 pt-[18vh]">
      <h1 className="mb-1 font-display text-[33px] leading-[1.05] font-bold tracking-[-.01em]">🧠 Second Brain</h1>
      <p className="mt-0 mb-6 text-sm text-muted">Inicia sesión para continuar.</p>
      <form onSubmit={submit} className="card">
        <label className="mb-[13px] block">
          <span className="field-label">Email</span>
          <input className="input" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="mb-[13px] block">
          <span className="field-label">Contraseña</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="mt-0 mb-3 text-[13px] text-hot">
            {error}
          </p>
        )}
        <button className="btn btn-primary w-full" disabled={pending}>
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
