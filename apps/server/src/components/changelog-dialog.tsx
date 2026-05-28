'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { renderMarkdown } from '@/components/changelog-render';

/**
 * Sidebar entry that opens a modal rendering the project CHANGELOG.md.
 * The markdown is rendered by the XSS-safe renderer in `changelog-render`.
 */
export function ChangelogDialog({ content, label }: { content: string; label: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="w-full rounded px-3 py-2 text-left text-sm text-neutral-600 hover:bg-neutral-100"
        >
          {label}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto pr-2 text-sm">{renderMarkdown(content)}</div>
      </DialogContent>
    </Dialog>
  );
}
