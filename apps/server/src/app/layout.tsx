import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'License Engine',
  description: 'Multi-Product license server for tropicsoft.',
};

// Root layout is intentionally minimal — the localized layout under
// [locale]/layout.tsx provides the <html> / <body> wrapper and i18n provider.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
