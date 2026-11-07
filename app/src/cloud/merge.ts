// Правила слияния изменений из облака с данными телефона. Чистые функции — покрыты модульными тестами.
// Побеждает более позднее изменение (по времени изменения на телефоне автора).

import type { OutboxEntry, RemoteChange, SyncStore } from '../db/idb';

export interface ServerRow {
  store: string;
  id: string;
  data: Record<string, unknown> | null;
  deleted: boolean;
  updated_at: string;
  server_updated_at: string;
}

export function toChange(row: ServerRow): RemoteChange {
  return { store: row.store as SyncStore, id: row.id, data: row.deleted ? null : row.data, deleted: !!row.deleted, ts: Date.parse(row.updated_at) };
}

/** Служебные поля, которые есть только на телефоне и в облако не уходят. */
const LOCAL_ONLY = new Set(['blob', 'uploaded']);

/** Данные записи для отправки в облако: у фото — только описание, сам файл идёт в хранилище. */
export function toServerData(store: string, value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  if (store !== 'photos') return value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (!LOCAL_ONLY.has(k)) out[k] = v;
  return out;
}

export function sameRecord(a: unknown, b: unknown): boolean {
  const strip = (x: unknown) => JSON.stringify(x, (k, v) => (LOCAL_ONLY.has(k) ? undefined : v));
  return strip(a) === strip(b);
}

export interface Decision { write?: unknown; remove?: boolean; dropPending?: boolean }

/**
 * pending — неотправленное изменение этой же записи на телефоне (если есть), local — текущая версия на телефоне.
 *  • локальная правка новее облачной — оставляем свою, она уйдёт в облако;
 *  • облачная версия новее или та же — применяем её и снимаем свою из очереди;
 *  • у фото сохраняем уже скачанный файл.
 */
export function decideRemote(c: RemoteChange, pending: OutboxEntry | undefined, local: unknown): Decision {
  if (pending && pending.ts > c.ts) return {};
  const dropPending = !!pending;
  if (c.deleted || !c.data) return { remove: local !== undefined, dropPending };
  let next: Record<string, unknown> = c.data;
  if (c.store === 'photos') {
    const l = local as { blob?: Blob; uploaded?: boolean } | undefined;
    next = { ...c.data, blob: l?.blob ?? null, uploaded: l?.blob ? true : undefined };
  }
  if (local !== undefined && sameRecord(local, next)) return { dropPending };
  return { write: next, dropPending };
}

/** Итог отправки: сервер вернул сохранённую версию. */
export function pushOutcome(sentTs: number, server: ServerRow): 'accepted' | 'newer-on-server' | 'retry' {
  const srv = Date.parse(server.updated_at);
  if (srv === sentTs) return 'accepted';
  if (srv > sentTs) return 'newer-on-server';
  return 'retry';
}

/** Курсор с запасом: строки, записанные в длинной транзакции чуть раньше курсора, не потеряются. */
export const OVERLAP_MS = 10_000;
export function sinceParam(cursor: string | null | undefined): string | null {
  return cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : null;
}

/** id результата упражнения, к которому относится попытка. */
export function resultIdOf(change: RemoteChange, local: unknown): string | undefined {
  const d = (change.data ?? local) as { resultId?: string } | undefined;
  return d?.resultId;
}
