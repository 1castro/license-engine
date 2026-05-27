'use client';

import { useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function LoginForm() {
  const t = useTranslations('auth');
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('next') ?? '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await signIn('credentials', {
      email,
      password,
      totp,
      redirect: false,
      callbackUrl,
    });

    setSubmitting(false);
    if (!result || result.error) {
      setError(t('errorInvalidCredentials'));
      return;
    }
    window.location.href = result.url ?? callbackUrl;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold">{t('loginTitle')}</h1>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-neutral-700">{t('emailLabel')}</span>
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
        <span className="mb-1 block font-medium text-neutral-700">{t('passwordLabel')}</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-neutral-700">{t('totpLabel')}</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="\d{6}"
          required
          autoComplete="one-time-code"
          maxLength={6}
          value={totp}
          onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
          className="w-full rounded border border-neutral-300 px-3 py-2 text-center font-mono text-lg tracking-widest focus:border-neutral-900 focus:outline-none"
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
        {t('submit')}
      </button>
    </form>
  );
}
