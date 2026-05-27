'use client';

import { useState, type FormEvent } from 'react';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/portal/v1/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        window.location.href = '/portal';
        return;
      }
      const body = (await res.json()) as { error?: { message?: string } };
      setError(body.error?.message ?? 'Anmeldung fehlgeschlagen');
    } catch {
      setError('Netzwerkfehler. Bitte erneut versuchen.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-neutral-700">E-Mail</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-neutral-700">Passwort</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />
      </label>

      {error && (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {submitting ? 'Wird angemeldet…' : 'Anmelden'}
      </button>

      <p className="text-xs text-neutral-500">
        Passwort vergessen?{' '}
        <a className="underline" href="/portal/forgot">
          Hier zurücksetzen
        </a>
      </p>
    </form>
  );
}
