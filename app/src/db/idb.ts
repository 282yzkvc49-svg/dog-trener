// Тонкий типизированный слой над IndexedDB: версии схемы, атомарные пакеты записей,
// уведомления об изменениях для «живых» запросов интерфейса и очередь изменений для облака.

export const DB_NAME = 'aussie-trainer';
/** Версия схемы IndexedDB. Увеличивать при изменении хранилищ/индексов и добавлять шаг в upgrade(). */
export const DB_VERSION = 2;

export const STORES = [
  'meta', 'settings', 'dogs', 'programs', 'days', 'sessions', 'trainings', 'results',
  'attempts', 'levels', 'levelChanges', 'journal', 'photos', 'customExercises', 'reports',
  'outbox',
] as const;
export type StoreName = (typeof STORES)[number];

/** Хранилища, которые входят в резервную копию (всё, кроме служебных). */
export const BACKUP_STORES: StoreName[] = STORES.filter((s) => s !== 'meta' && s !== 'outbox');

/** Хранилища, общие для всех участников «общей собаки». Настройки телефона не синхронизируются. */
export const SYNC_STORES = [
  'dogs', 'programs', 'days', 'sessions', 'trainings', 'results', 'attempts',
  'levels', 'levelChanges', 'journal', 'customExercises', 'reports', 'photos',
] as const satisfies readonly StoreName[];
export type SyncStore = (typeof SYNC_STORES)[number];
const SYNC_SET = new Set<string>(SYNC_STORES);
export const isSyncStore = (s: string): s is SyncStore => SYNC_SET.has(s);

const INDEXES: Partial<Record<StoreName, [string, string][]>> = {
  programs: [['dogId', 'dogId']],
  days: [['programId', 'programId'], ['date', 'date']],
  sessions: [['programId', 'programId'], ['plannedDate', 'plannedDate']],
  trainings: [['status', 'status'], ['date', 'date']],
  results: [['sessionId', 'sessionId'], ['exerciseId', 'exerciseId'], ['date', 'date']],
  attempts: [['resultId', 'resultId'], ['sessionId', 'sessionId']],
  levels: [['dogId', 'dogId']],
  levelChanges: [['exerciseId', 'exerciseId']],
  journal: [['occurredAt', 'occurredAt']],
  reports: [['week', 'week']],
};

export class StorageError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'StorageError';
  }
}

function humanize(err: unknown): StorageError {
  const name = (err as DOMException | undefined)?.name;
  if (name === 'QuotaExceededError') {
    return new StorageError('На устройстве закончилось место для данных приложения. Сохраните резервную копию и удалите лишние фото.', err);
  }
  if (name === 'InvalidStateError' || name === 'UnknownError') {
    return new StorageError('Хранилище недоступно. Закройте приложение полностью и откройте снова.', err);
  }
  return new StorageError('Не удалось сохранить данные на устройстве.', err);
}

function upgrade(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1) {
    for (const s of STORES) {
      if (s === 'outbox') continue;
      const store = db.createObjectStore(s, { keyPath: s === 'meta' ? 'key' : 'id' });
      for (const [name, path] of INDEXES[s] ?? []) store.createIndex(name, path);
    }
  }
  if (oldVersion < 2) {
    // v2: очередь изменений для отправки в облако. Ключ — «тип записи|id».
    db.createObjectStore('outbox', { keyPath: 'key' });
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new StorageError('Браузер не поддерживает IndexedDB — данные негде хранить.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => upgrade(req.result, e.oldVersion);
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(humanize(req.error));
    req.onblocked = () => reject(new StorageError('Приложение открыто в другой вкладке со старой версией. Закройте её и обновите страницу.'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

// ---------- Уведомления об изменениях ----------
type Listener = (stores: Set<StoreName>) => void;
const listeners = new Set<Listener>();
let version = 0;
export const changeVersion = () => version;
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(stores: Iterable<StoreName>) {
  version++;
  const set = new Set(stores);
  for (const l of listeners) l(set);
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(humanize(req.error));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(humanize(tx.error));
    tx.onabort = () => reject(humanize(tx.error));
  });
}

// ---------- Чтение ----------
export async function get<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
}

export async function all<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>;
}

export async function byIndex<T>(store: StoreName, index: string, query: IDBValidKey | IDBKeyRange): Promise<T[]> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).index(index).getAll(query)) as Promise<T[]>;
}

export async function count(store: StoreName): Promise<number> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).count());
}

// ---------- Очередь изменений для облака ----------
/** Запись очереди: какую запись отправить и когда её изменили на этом телефоне. */
export interface OutboxEntry { key: string; store: SyncStore; id: string; ts: number }

export const outboxKey = (store: string, id: string) => `${store}|${id}`;

let tracking = false;
/** Включается, когда телефон подключён к общей собаке: каждое изменение попадает в очередь. */
export function setTracking(on: boolean) { tracking = on; }
export const isTracking = () => tracking;

let lastTs = 0;
/** Монотонное время изменения: два изменения одной записи никогда не получают одинаковую метку. */
export function nextTs(): number {
  lastTs = Math.max(Date.now(), lastTs + 1);
  return lastTs;
}
/**
 * Учесть метку изменения, пришедшего с другого телефона. Следующая своя правка получит метку позже —
 * даже если часы этого телефона немного отстают, правка не проиграет уже увиденной чужой.
 */
export function observeTs(ts: number) {
  if (Number.isFinite(ts) && ts > lastTs && ts < Date.now() + 86_400_000) lastTs = ts;
}

// ---------- Запись ----------
export type Op =
  | { type: 'put'; store: StoreName; value: unknown }
  | { type: 'delete'; store: StoreName; key: string }
  | { type: 'clear'; store: StoreName };

/**
 * Атомарно выполняет набор операций в одной транзакции: либо всё, либо ничего.
 * Если включена синхронизация, изменения общих записей в той же транзакции попадают в очередь.
 * silent — запись пришла из облака и обратно в очередь не ставится.
 */
export async function batch(ops: Op[], opts: { silent?: boolean } = {}): Promise<void> {
  if (!ops.length) return;
  const db = await openDb();
  const queued: OutboxEntry[] = [];
  if (tracking && !opts.silent) {
    for (const op of ops) {
      if (!isSyncStore(op.store)) continue;
      if (op.type === 'put') {
        const id = (op.value as { id?: unknown })?.id;
        if (typeof id === 'string') queued.push({ key: outboxKey(op.store, id), store: op.store, id, ts: nextTs() });
      } else if (op.type === 'delete') {
        queued.push({ key: outboxKey(op.store, op.key), store: op.store, id: op.key, ts: nextTs() });
      }
    }
  }
  const stores = [...new Set([...ops.map((o) => o.store), ...(queued.length ? ['outbox' as const] : [])])];
  let tx: IDBTransaction;
  try {
    tx = db.transaction(stores, 'readwrite');
  } catch (e) {
    throw humanize(e);
  }
  const finished = done(tx);
  try {
    for (const op of ops) {
      const st = tx.objectStore(op.store);
      if (op.type === 'put') st.put(op.value);
      else if (op.type === 'delete') st.delete(op.key);
      else st.clear();
    }
    if (queued.length) {
      const ob = tx.objectStore('outbox');
      for (const q of queued) ob.put(q);
    }
  } catch (e) {
    try { tx.abort(); } catch { /* уже прервана */ }
    throw humanize(e);
  }
  await finished;
  emit(stores);
}

export const put = (store: StoreName, value: unknown) => batch([{ type: 'put', store, value }]);
export const putMany = (store: StoreName, values: unknown[]) => batch(values.map((value) => ({ type: 'put' as const, store, value })));
export const del = (store: StoreName, key: string) => batch([{ type: 'delete', store, key }]);

/** Поставить в очередь все общие записи (первая отправка в облако при создании общей собаки). */
export async function enqueueAll(): Promise<number> {
  const db = await openDb();
  const tx = db.transaction([...SYNC_STORES, 'outbox'], 'readwrite');
  const finished = done(tx);
  let n = 0;
  const ob = tx.objectStore('outbox');
  await Promise.all(SYNC_STORES.map(async (s) => {
    const keys = await wrap(tx.objectStore(s).getAllKeys());
    for (const k of keys) { ob.put({ key: outboxKey(s, String(k)), store: s, id: String(k), ts: nextTs() } satisfies OutboxEntry); n++; }
  }));
  await finished;
  emit(['outbox']);
  return n;
}

/** Снимок очереди вместе с текущими версиями записей — в одной транзакции, чтобы данные были согласованы. */
export async function readOutbox(limit: number): Promise<{ entry: OutboxEntry; value: unknown }[]> {
  const db = await openDb();
  const tx = db.transaction([...SYNC_STORES, 'outbox'], 'readonly');
  const entries = (await wrap(tx.objectStore('outbox').getAll())) as OutboxEntry[];
  entries.sort((a, b) => a.ts - b.ts);
  const slice = entries.slice(0, limit);
  const values = await Promise.all(slice.map((e) => wrap(tx.objectStore(e.store).get(e.id))));
  return slice.map((entry, i) => ({ entry, value: values[i] }));
}

/** Убрать из очереди отправленные записи, если их не меняли снова за время отправки. */
export async function ackOutbox(sent: { key: string; ts: number }[]): Promise<void> {
  if (!sent.length) return;
  const db = await openDb();
  const tx = db.transaction('outbox', 'readwrite');
  const finished = done(tx);
  const ob = tx.objectStore('outbox');
  await Promise.all(sent.map(async (s) => {
    const cur = (await wrap(ob.get(s.key))) as OutboxEntry | undefined;
    if (cur && cur.ts === s.ts) ob.delete(s.key);
  }));
  await finished;
  emit(['outbox']);
}

/** Изменение из облака: тип записи, id, данные (или удаление) и время изменения на телефоне автора. */
export interface RemoteChange { store: SyncStore; id: string; data: Record<string, unknown> | null; deleted: boolean; ts: number }

/**
 * Применить изменения из облака одной транзакцией. Для каждой записи решение принимает decide():
 * читает версию в очереди и на телефоне и возвращает, что записать. Всё в одной транзакции —
 * локальное изменение, сделанное в эту же миллисекунду, не потеряется.
 */
export async function applyRemote(
  changes: RemoteChange[],
  decide: (c: RemoteChange, pending: OutboxEntry | undefined, local: unknown) => { write?: unknown; remove?: boolean; dropPending?: boolean },
): Promise<{ applied: RemoteChange[] }> {
  if (!changes.length) return { applied: [] };
  const db = await openDb();
  const stores = [...new Set(changes.map((c) => c.store))];
  const tx = db.transaction([...stores, 'outbox'], 'readwrite');
  const finished = done(tx);
  const ob = tx.objectStore('outbox');
  const applied: RemoteChange[] = [];
  for (const c of changes) {
    observeTs(c.ts);
    const st = tx.objectStore(c.store);
    const [pending, local] = await Promise.all([wrap(ob.get(outboxKey(c.store, c.id))), wrap(st.get(c.id))]);
    const d = decide(c, pending as OutboxEntry | undefined, local);
    if (d.dropPending) ob.delete(outboxKey(c.store, c.id));
    if (d.remove) { st.delete(c.id); applied.push(c); } else if (d.write !== undefined) { st.put(d.write); applied.push(c); }
  }
  await finished;
  if (applied.length) emit([...new Set(applied.map((c) => c.store)), 'outbox']);
  return { applied };
}

export async function requestPersistence(): Promise<boolean | undefined> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* не поддерживается */ }
  return undefined;
}
