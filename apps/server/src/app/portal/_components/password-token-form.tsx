'use client';

import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';

export function PasswordTokenForm(props: { endpoint: string; successHref: string }) {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Die beiden Passwörter sind nicht gleich.');
      return;
    }
    if (password.length < 12) {
      setError('Das Passwort muss mindestens 12 Zeichen lang sein.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(props.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        setSuccess(true);
        return;
      }
      const body = (await res.json()) as { error?: { message?: string } };
      setError(body.error?.message ?? 'Das Setzen des Passworts ist fehlgeschlagen.');
    } catch {
      setError('Netzwerkfehler. Bitte erneut versuchen.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
        Der Link enthält keinen gültigen Token. Bitte verwende den vollständigen Link aus der E-Mail.
      </p>
    );
  }

  if (success) {
    return (
      <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
          Passwort gesetzt. Du kannst dich jetzt einloggen.
        </p>
        <a
          href={props.successHref}
          className="inline-flex w-full items-center justify-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Zum Login
        </a>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-neutral-700">Neues Passwort</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          minLength={12}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-neutral-700">Passwort wiederholen</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          minLength={12}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />
      </label>
      <p className="text-xs text-neutral-500">Mindestens 12 Zeichen.</p>

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
        {submitting ? 'Wird gespeichert…' : 'Passwort speichern'}
      </button>
    </form>
  );
}
