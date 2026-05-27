'use client';

export function LogoutButton() {
  async function onClick() {
    await fetch('/api/portal/v1/logout', { method: 'POST' });
    window.location.href = '/portal/login';
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
    >
      Abmelden
    </button>
  );
}
