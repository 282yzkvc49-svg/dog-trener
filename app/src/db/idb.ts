// Тонкий типизированный слой над IndexedDB: версии схемы, атомарные пакеты записей,
// уведомления об изменениях для «живых» запросов интерфейса.

export const DB_NAME = 'aussie-trainer';
/** Версия схемы IndexedDB. Увеличивать при изменении хранилищ/индексов и добавлять шаг в upgrade(). */
export const DB_VERSION = 1;

export const STORES = [
  'meta', 'settings', 'dogs', 'programs', 'days', 'sessions', 'trainings', 'results',
  'attempts', 'levels', 'levelChanges', 'journal', 'photos', 'customExercises', 'reports',
] as const;
export type StoreName = (typeof STORES)[number];

/** Хранилища, которые входят в резервную копию (всё, кроме служебных). */
export const BACKUP_STORES: StoreName[] = STORES.filter((s) => s !== 'meta');

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
      const store = db.createObjectStore(s, { keyPath: s === 'meta' ? 'key' : 'id' });
      for (const [name, path] of INDEXES[s] ?? []) store.createIndex(name, path);
    }
  }
  // Пример будущей миграции:
  // if (oldVersion < 2) { const st = tx.objectStore('journal'); st.createIndex('dogId', 'dogId'); }
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

// ---------- Запись ----------
export type Op =
  | { type: 'put'; store: StoreName; value: unknown }
  | { type: 'delete'; store: StoreName; key: string }
  | { type: 'clear'; store: StoreName };

/** Атомарно выполняет набор операций в одной транзакции: либо всё, либо ничего. */
export async function batch(ops: Op[]): Promise<void> {
  if (!ops.length) return;
  const db = await openDb();
  const stores = [...new Set(ops.map((o) => o.store))];
  await new Promise<void>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(stores, 'readwrite');
    } catch (e) {
      reject(humanize(e));
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(humanize(tx.error));
    tx.onabort = () => reject(humanize(tx.error));
    try {
      for (const op of ops) {
        const st = tx.objectStore(op.store);
        if (op.type === 'put') st.put(op.value);
        else if (op.type === 'delete') st.delete(op.key);
        else st.clear();
      }
    } catch (e) {
      try { tx.abort(); } catch { /* уже прервана */ }
      reject(humanize(e));
    }
  });
  emit(stores);
}

export const put = (store: StoreName, value: unknown) => batch([{ type: 'put', store, value }]);
export const putMany = (store: StoreName, values: unknown[]) => batch(values.map((value) => ({ type: 'put' as const, store, value })));
export const del = (store: StoreName, key: string) => batch([{ type: 'delete', store, key }]);

export async function requestPersistence(): Promise<boolean | undefined> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* не поддерживается */ }
  return undefined;
}
