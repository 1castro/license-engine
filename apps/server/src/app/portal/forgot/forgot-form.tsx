'use client';

import { useState, type FormEvent } from 'react';

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch('/api/portal/v1/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } finally {
      // Always show the same response — server doesn't leak whether the
      // email exists, the UI mustn't either.
      setSubmitted(true);
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
        Wenn ein Konto mit dieser E-Mail existiert, ist eine Mail mit einem Reset-Link unterwegs.
      </p>
    );
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
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {submitting ? 'Wird gesendet…' : 'Reset-Mail anfordern'}
      </button>
    </form>
  );
}
