import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideRemote, pushOutcome, resultIdOf, sameRecord, sinceParam, toChange, toServerData, OVERLAP_MS, type ServerRow } from '../../src/cloud/merge';
import { CloudError, SupaClient, validateConfig } from '../../src/cloud/client';
import type { OutboxEntry, RemoteChange } from '../../src/db/idb';

const T0 = Date.parse('2026-11-09T07:00:00Z');
const change = (p: Partial<RemoteChange> = {}): RemoteChange => ({ store: 'journal', id: 'j1', data: { id: 'j1', notes: 'из облака' }, deleted: false, ts: T0, ...p });
const pending = (ts: number, store = 'journal', id = 'j1'): OutboxEntry => ({ key: `${store}|${id}`, store: store as OutboxEntry['store'], id, ts });

// ---------- Слияние ----------
test('облачная версия применяется, если на телефоне нет более новой правки', () => {
  assert.deepEqual(decideRemote(change(), undefined, undefined), { write: { id: 'j1', notes: 'из облака' }, dropPending: false });
  assert.deepEqual(decideRemote(change(), undefined, { id: 'j1', notes: 'старое' }), { write: { id: 'j1', notes: 'из облака' }, dropPending: false });
});

test('своя неотправленная правка новее — облачная версия не затирает её', () => {
  assert.deepEqual(decideRemote(change(), pending(T0 + 1), { id: 'j1', notes: 'моё' }), {});
});

test('облачная версия новее или та же — своя правка снимается из очереди', () => {
  assert.deepEqual(decideRemote(change(), pending(T0 - 5), { id: 'j1', notes: 'моё' }), { write: { id: 'j1', notes: 'из облака' }, dropPending: true });
  // Та же метка — это наша же правка, вернувшаяся из облака: перезаписывать нечего, очередь чистится.
  assert.deepEqual(decideRemote(change(), pending(T0), { id: 'j1', notes: 'из облака' }), { dropPending: true });
});

test('удаление в облаке удаляет запись на телефоне, если своей более новой правки нет', () => {
  assert.deepEqual(decideRemote(change({ deleted: true, data: null }), undefined, { id: 'j1' }), { remove: true, dropPending: false });
  assert.deepEqual(decideRemote(change({ deleted: true, data: null }), undefined, undefined), { remove: false, dropPending: false });
  assert.deepEqual(decideRemote(change({ deleted: true, data: null }), pending(T0 + 10), { id: 'j1' }), {});
});

test('фото: файл на телефоне сохраняется, служебные поля в облако не уходят', () => {
  const blob = { size: 10 } as unknown as Blob;
  const local = { id: 'p1', type: 'image/jpeg', width: 10, blob, uploaded: true };
  assert.deepEqual(toServerData('photos', local), { id: 'p1', type: 'image/jpeg', width: 10 });
  assert.deepEqual(toServerData('journal', { id: 'j' }), { id: 'j' });
  assert.equal(toServerData('journal', undefined), null);
  const remote = change({ store: 'photos', id: 'p1', data: { id: 'p1', type: 'image/jpeg', width: 10 } });
  // Совпадает с локальной версией без учёта файла — записывать нечего.
  assert.deepEqual(decideRemote(remote, undefined, local), { dropPending: false });
  const d = decideRemote(change({ store: 'photos', id: 'p1', data: { id: 'p1', type: 'image/jpeg', width: 20 } }), undefined, local);
  assert.equal((d.write as { blob: unknown }).blob, blob);
  // Фото другого участника приходит без файла — он скачается при показе.
  const fresh = decideRemote(remote, undefined, undefined);
  assert.equal((fresh.write as { blob: unknown }).blob, null);
});

test('сравнение записей не зависит от служебных полей фото', () => {
  assert.ok(sameRecord({ a: 1, blob: 'x' }, { a: 1, uploaded: true }));
  assert.ok(!sameRecord({ a: 1 }, { a: 2 }));
});

test('итог отправки: принято, в облаке новее, повторить', () => {
  const row = (ts: number): ServerRow => ({ store: 'journal', id: 'j1', data: {}, deleted: false, updated_at: new Date(ts).toISOString(), server_updated_at: new Date().toISOString() });
  assert.equal(pushOutcome(T0, row(T0)), 'accepted');
  assert.equal(pushOutcome(T0, row(T0 + 1)), 'newer-on-server');
  assert.equal(pushOutcome(T0, row(T0 - 1)), 'retry');
});

test('строка из облака превращается в изменение; курсор берётся с запасом', () => {
  const c = toChange({ store: 'results', id: 'r', data: { x: 1 }, deleted: true, updated_at: '2026-11-09T07:00:00.123Z', server_updated_at: '2026-11-09T07:00:01Z' });
  assert.equal(c.data, null);
  assert.equal(c.deleted, true);
  assert.equal(c.ts, Date.parse('2026-11-09T07:00:00.123Z'));
  assert.equal(sinceParam(null), null);
  assert.equal(Date.parse(sinceParam('2026-11-09T07:00:30Z')!), Date.parse('2026-11-09T07:00:30Z') - OVERLAP_MS);
});

test('попытка указывает на свой результат даже при удалении', () => {
  assert.equal(resultIdOf(change({ store: 'attempts', data: { resultId: 'r1' } }), undefined), 'r1');
  assert.equal(resultIdOf(change({ store: 'attempts', data: null, deleted: true }), { resultId: 'r2' }), 'r2');
});

// ---------- Клиент ----------
test('настройки облака: только адрес Supabase и публичный ключ', () => {
  assert.ok(validateConfig({ url: 'https://abc.supabase.co', anonKey: 'sb_publishable_FHPwO8j7ZC27hYGh0cFkRw' }));
  assert.ok(validateConfig({ url: 'http://127.0.0.1:54400', anonKey: 'x'.repeat(24) }));
  assert.ok(!validateConfig({ url: 'https://evil.example.com', anonKey: 'x'.repeat(24) }));
  assert.ok(!validateConfig({ url: 'https://abc.supabase.co', anonKey: 'sb_secret_aaaaaaaaaaaaaaaaaaaa' }));
  assert.ok(!validateConfig({ url: 'https://abc.supabase.co', anonKey: 'short' }));
  assert.ok(!validateConfig({}));
});

type Call = { url: string; init: RequestInit };
function fakeServer(handler: (c: Call) => { status: number; body?: unknown }) {
  const calls: Call[] = [];
  const fetcher = async (url: string, init: RequestInit = {}) => {
    const c = { url, init };
    calls.push(c);
    const r = handler(c);
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status });
  };
  const mem = new Map<string, string>();
  const kv = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  return { calls, fetcher, kv, mem };
}
const session = (n = 1) => ({ access_token: `at${n}`, refresh_token: `rt${n}`, expires_in: 3600, user: { id: 'u1', email: 'a@b.ru' } });
const hdr = (c: Call) => c.init.headers as Record<string, string>;

test('вход: сессия сохраняется; publishable-ключ не уходит в Authorization', async () => {
  const s = fakeServer(() => ({ status: 200, body: session() }));
  const c = new SupaClient({ url: 'https://abc.supabase.co/', anonKey: 'sb_publishable_' + 'k'.repeat(20) }, s.fetcher, s.kv);
  await c.signIn('a@b.ru', 'secret1');
  assert.equal(s.calls[0].url, 'https://abc.supabase.co/auth/v1/token?grant_type=password');
  assert.equal(hdr(s.calls[0]).Authorization, undefined);
  assert.equal(hdr(s.calls[0]).apikey, 'sb_publishable_' + 'k'.repeat(20));
  assert.equal(c.user?.email, 'a@b.ru');
  assert.ok(s.mem.get('aussie-trainer:session'));
  // Восстановление сессии при следующем запуске.
  const again = new SupaClient({ url: 'https://abc.supabase.co', anonKey: 'sb_publishable_' + 'k'.repeat(20) }, s.fetcher, s.kv);
  assert.equal(again.user?.id, 'u1');
});

test('ошибки входа переводятся на понятный язык', async () => {
  const s = fakeServer(() => ({ status: 400, body: { error_code: 'invalid_credentials', msg: 'Invalid login credentials' } }));
  const c = new SupaClient({ url: 'https://abc.supabase.co', anonKey: 'k'.repeat(24) }, s.fetcher, s.kv);
  await assert.rejects(c.signIn('a@b.ru', 'bad'), (e: CloudError) => e.code === 'auth' && /Неверная почта или пароль/.test(e.message));
  const s2 = fakeServer(() => ({ status: 400, body: { error_code: 'email_not_confirmed' } }));
  const c2 = new SupaClient({ url: 'https://abc.supabase.co', anonKey: 'k'.repeat(24) }, s2.fetcher, s2.kv);
  await assert.rejects(c2.signIn('a@b.ru', 'x'), (e: CloudError) => e.code === 'confirm');
});

test('регистрация с подтверждением почты: сессии нет, повторный адрес распознаётся', async () => {
  const s = fakeServer(() => ({ status: 200, body: { id: 'u', identities: [{}] } }));
  const c = new SupaClient({ url: 'https://abc.supabase.co', anonKey: 'k'.repeat(24) }, s.fetcher, s.kv);
  assert.deepEqual(await c.signUp('a@b.ru', 'secret1', 'https://x.github.io/app/'), { session: null });
  assert.match(s.calls[0].url, /redirect_to=https%3A%2F%2Fx\.github\.io%2Fapp%2F/);
  const s2 = fakeServer(() => ({ status: 200, body: { id: 'u', identities: [] } }));
  const c2 = new SupaClient({ url: 'https://abc.supabase.co', anonKey: 'k'.repeat(24) }, s2.fetcher, s2.kv);
  await assert.rejects(c2.signUp('a@b.ru', 'secret1'), /уже зарегистрирован/);
});

test('RPC: просроченный токен обновляется и запрос повторяется', async () => {
  let n = 0;
  const s = fakeServer((c) => {
    if (c.url.includes('grant_type=password')) return { status: 200, body: session(1) };
    if (c.url.includes('grant_type=refresh_token')) return { status: 200, body: session(2) };
    n++;
    return hdr(c).Authorization === 'Bearer at1' ? { status: 401, body: { code: 'PGRST301', message: 'JWT expired' } } : { status: 200, body: [{ ok: n }] };
  });
  const c = new SupaClient({ url: 'https://abc.supabase.co', anonKey: 'k'.repeat(24) }, s.fetcher, s.kv);
  await c.signIn('a@b.ru', 'secret1');
  assert.deepEqual(await c.rpc('aussie_my_packs', {}), [{ ok: 2 }]);
  assert.equal(c.session?.access_token, 'at2');
});

test('RPC: нет функций в облаке, потеря участия, нет сети', async () => {
  const mk = (status: number, body: unknown) => {
    const s = fakeServer((c) => (c.url.includes('/auth/') ? { status: 200, body: session() } : { status, body }));
    return { c: new SupaClient({ url: 'https://abc.supabase.co', anonKey: 'k'.repeat(24) }, s.fetcher, s.kv), s };
  };
  const a = mk(404, { code: 'PGRST202', message: 'Could not find the function public.aussie_pull' });
  await a.c.signIn('a@b.ru', 'secret1');
  await assert.rejects(a.c.rpc('aussie_pull', {}), (e: CloudError) => e.code === 'config' && /aussie_trainer\.sql/.test(e.message));
  const b = mk(400, { message: 'Вы не участник этой общей собаки' });
  await b.c.signIn('a@b.ru', 'secret1');
  await assert.rejects(b.c.rpc('aussie_push', {}), (e: CloudError) => e.code === 'membership');
  const off = new SupaClient({ url: 'https://abc.supabase.co', anonKey: 'k'.repeat(24) }, async () => { throw new TypeError('Failed to fetch'); }, null);
  await assert.rejects(off.signIn('a@b.ru', 'x'), (e: CloudError) => e.code === 'network');
});
