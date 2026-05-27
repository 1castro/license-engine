import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStorage } from '../src/storage/memory';
import { createFileSystemStorage } from '../src/storage/filesystem';

describe('memory storage', () => {
  it('roundtrips a value', async () => {
    const s = createMemoryStorage();
    expect(await s.get('foo')).toBeNull();
    await s.set('foo', 'bar');
    expect(await s.get('foo')).toBe('bar');
    await s.delete('foo');
    expect(await s.get('foo')).toBeNull();
  });
});

describe('filesystem storage', () => {
  it('persists across separate instances', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'le-sdk-test-'));
    try {
      const a = createFileSystemStorage({ directory: dir });
      await a.set('token', 'hello');
      const b = createFileSystemStorage({ directory: dir });
      expect(await b.get('token')).toBe('hello');
      await b.delete('token');
      expect(await b.get('token')).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects directory-traversal in keys', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'le-sdk-test-'));
    try {
      const s = createFileSystemStorage({ directory: dir });
      await expect(s.set('../escape', 'x')).rejects.toThrow(/illegal/);
      await expect(s.get('../escape')).rejects.toThrow(/illegal/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
