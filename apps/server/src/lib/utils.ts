import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind class-name merger: combines clsx + tailwind-merge so callers can
 *  pass conditional classNames and have conflicts resolved (e.g. "p-2 p-4" → "p-4"). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
