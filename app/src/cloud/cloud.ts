// Общая собака: синхронизация данных между телефонами участников через Supabase.
// Телефон всегда работает со своей базой (IndexedDB); изменения копятся в очереди и уходят в облако,
// изменения других участников приходят опросом каждые несколько секунд, пока приложение открыто.

import { useSyncExternalStore } from 'react';
import * as db from '../db/idb';
import { SupaClient, CloudError, validateConfig, type AuthUser, type CloudConfig } from './client';
import { decideRemote, pushOutcome, resultIdOf, sinceParam, toChange, toServerData, type ServerRow } from './merge';
import { summarize } from '../domain/training';
import { ex } from '../domain/plan';
import type { Attempt, ExerciseResult } from '../domain/types';
import { uid } from '../lib/util';

declare const __SUPABASE_URL__: string;
declare const __SUPABASE_KEY__: string;
declare const __SYNC_POLL_MS__: number;

export const CLOUD_CONFIG: CloudConfig = {
  url: typeof __SUPABASE_URL__ !== 'undefined' ? __SUPABASE_URL__ : '',
  anonKey: typeof __SUPABASE_KEY__ !== 'undefined' ? __SUPABASE_KEY__ : '',
};
const POLL_MS = typeof __SYNC_POLL_MS__ !== 'undefined' ? __SYNC_POLL_MS__ : 10_000;
const PUSH_BATCH = 200;
const PULL_LIMIT = 1000;
const TRACK_FLAG = 'aussie-trainer:sync';

export interface PackMember { user_id: string; display_name: string; email?: string | null; joined_at: string }
export interface PackInfo { id: string; name: string; invite_code: string; created_at: string; members: PackMember[] }

interface CloudMeta {
  key: 'cloud';
  deviceId: string;
  packId?: string;
  pack?: PackInfo;
  /** Серверное время последней полученной записи. */
  cursor?: string | null;
  /** Когда курсор сдвинулся (время телефона) и проверен ли уже «запас» после этого. */
  cursorAt?: number;
  overlapDone?: boolean;
  lastSync?: number;
}

export type SyncState = 'unavailable' | 'signed-out' | 'not-connected' | 'idle' | 'syncing' | 'offline' | 'error';
export interface CloudStatus {
  state: SyncState;
  user: AuthUser | null;
  pack: PackInfo | null;
  pending: number;
  lastSync: number | null;
  error: string | null;
}

type PhotoFetcher = (id: string) => Promise<Blob | null>;

class Cloud {
  client: SupaClient | null = null;
  private meta: CloudMeta = { key: 'cloud', deviceId: uid('dev-') };
  status: CloudStatus = { state: 'unavailable', user: null, pack: null, pending: 0, lastSync: null, error: null };
  private subs = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private loop: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private ticks = 0;
  private started = false;

  constructor() {
    // Флаг читается синхронно, чтобы изменения в первые миллисекунды после запуска тоже попали в очередь.
    try { if (localStorage.getItem(TRACK_FLAG) === '1') db.setTracking(true); } catch { /* нет доступа */ }
  }

  subscribe = (cb: () => void) => { this.subs.add(cb); return () => { this.subs.delete(cb); }; };
  get = () => this.status;
  private set(p: Partial<CloudStatus>) { this.status = { ...this.status, ...p }; for (const s of this.subs) s(); }

  get packId() { return this.meta.packId; }
  get connected() { return !!this.meta.packId; }

  async init() {
    if (this.started) return;
    this.started = true;
    if (!validateConfig(CLOUD_CONFIG)) { this.set({ state: 'unavailable' }); return; }
    this.client = new SupaClient(CLOUD_CONFIG);
    this.client.onSession = () => this.refreshState();
    try {
      const m = await db.get<CloudMeta>('meta', 'cloud');
      if (m) this.meta = m; else await this.saveMeta();
    } catch { /* хранилище недоступно — облако останется выключенным */ }
    this.setTrackingFlag(!!this.meta.packId);
    this.set({ pack: this.meta.pack ?? null, lastSync: this.meta.lastSync ?? null });
    this.refreshState();
    void this.updatePending();
    db.subscribe((stores) => {
      if (!stores.has('outbox')) return;
      void this.updatePending();
      if (db.isTracking()) this.schedule();
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.schedule(300));
      window.addEventListener('offline', () => { if (this.connected) this.set({ state: 'offline' }); });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.schedule(200); });
    }
    if (this.connected && this.client.user) { this.startLoop(); void this.syncNow(); }
  }

  private setTrackingFlag(on: boolean) {
    db.setTracking(on);
    try { if (on) localStorage.setItem(TRACK_FLAG, '1'); else localStorage.removeItem(TRACK_FLAG); } catch { /* нет доступа */ }
  }

  private async saveMeta() {
    await db.batch([{ type: 'put', store: 'meta', value: this.meta }], { silent: true });
  }

  private refreshState() {
    const c = this.client;
    if (!c) return this.set({ state: 'unavailable', user: null });
    if (!c.user) return this.set({ state: 'signed-out', user: null });
    if (!this.meta.packId) return this.set({ state: 'not-connected', user: c.user, pack: null });
    const keep: SyncState[] = ['idle', 'syncing', 'offline', 'error'];
    this.set({ user: c.user, pack: this.meta.pack ?? null, state: keep.includes(this.status.state) ? this.status.state : 'idle' });
  }

  private async updatePending() {
    try { this.set({ pending: await db.count('outbox') }); } catch { /* нет базы */ }
  }

  private startLoop() {
    if (this.loop) return;
    this.loop = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void this.syncNow();
    }, POLL_MS);
  }

  private stopLoop() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  schedule(delay = 1200) {
    if (!this.client?.user || !this.meta.packId) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.syncNow(); }, delay);
  }

  // ---------- Синхронизация ----------
  async syncNow(): Promise<void> {
    if (this.running) { this.again = true; return this.running; }
    const c = this.client;
    if (!c?.user || !this.meta.packId) { this.refreshState(); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { this.set({ state: 'offline' }); return; }
    this.running = (async () => {
      this.set({ state: 'syncing', error: null });
      try {
        await this.push(c);
        await this.pull(c);
        if (this.ticks++ % 6 === 0) await this.refreshPack();
        this.meta.lastSync = Date.now();
        await this.saveMeta();
        if (this.meta.packId) this.set({ state: 'idle', lastSync: this.meta.lastSync, error: null });
      } catch (e) {
        const err = e instanceof CloudError ? e : new CloudError(String((e as Error)?.message ?? e));
        if (err.code === 'network') this.set({ state: 'offline', error: null });
        else if (err.code === 'membership') { await this.disconnect({ signOut: false }); this.set({ error: 'Вы больше не участник этой общей собаки. Данные остались на телефоне.' }); }
        else if (!c.user) this.set({ state: 'signed-out', error: 'Сессия истекла — войдите снова. Изменения сохранены на телефоне и отправятся после входа.' });
        else this.set({ state: 'error', error: err.message || 'Ошибка синхронизации' });
      } finally {
        await this.updatePending();
      }
    })().finally(() => {
      this.running = null;
      if (this.again) { this.again = false; this.schedule(300); }
    });
    return this.running;
  }

  private async push(c: SupaClient) {
    const packId = this.meta.packId!;
    for (let guard = 0; guard < 50; guard++) {
      const items = await db.readOutbox(PUSH_BATCH);
      if (!items.length) return;
      // Сначала файлы фото: описание фото без файла другим участникам бесполезно.
      for (const { entry, value } of items) {
        const v = value as { blob?: Blob | null; uploaded?: boolean } | undefined;
        if (entry.store === 'photos' && v?.blob && !v.uploaded) {
          await c.uploadPhoto(`${packId}/${entry.id}`, v.blob);
          await db.batch([{ type: 'put', store: 'photos', value: { ...v, uploaded: true } }], { silent: true });
        }
      }
      const rows = items.map(({ entry, value }) => ({
        store: entry.store, id: entry.id, data: value === undefined ? null : toServerData(entry.store, value),
        deleted: value === undefined, updated_at: new Date(entry.ts).toISOString(), device_id: this.meta.deviceId,
      }));
      const result = (await c.rpc<ServerRow[]>('aussie_push', { p_pack: packId, p_rows: rows })) ?? [];
      const byKey = new Map(result.map((r) => [db.outboxKey(r.store, r.id), r]));
      const accepted: { key: string; ts: number }[] = [];
      const newer: ServerRow[] = [];
      for (const { entry, value } of items) {
        const srv = byKey.get(entry.key);
        if (!srv) continue;
        const o = pushOutcome(entry.ts, srv);
        if (o === 'accepted') {
          accepted.push(entry);
          if (entry.store === 'photos' && value === undefined) void c.deletePhoto(`${packId}/${entry.id}`);
        } else if (o === 'newer-on-server') newer.push(srv);
      }
      await db.ackOutbox(accepted);
      if (newer.length) await this.apply(newer.map(toChange));
      if (!accepted.length && !newer.length) return;
    }
  }

  private async pull(c: SupaClient) {
    const packId = this.meta.packId!;
    let cursor = this.meta.cursor ?? null;
    // Запас по времени нужен один раз после сдвига курсора: он ловит записи из транзакций,
    // которые ещё не были зафиксированы в момент прошлого запроса. Дальше — точно по курсору.
    const useOverlap = !!cursor && !this.meta.overlapDone;
    let pageSince = useOverlap ? sinceParam(cursor) : cursor;
    let advanced = false;
    const touched = new Set<string>();
    for (let page = 0; page < 200; page++) {
      const rows = (await c.rpc<ServerRow[]>('aussie_pull', { p_pack: packId, p_since: pageSince, p_limit: PULL_LIMIT })) ?? [];
      const changes = rows.filter((r) => db.isSyncStore(r.store)).map(toChange);
      await this.apply(changes, touched);
      if (!rows.length) break;
      const last = rows[rows.length - 1].server_updated_at;
      if (!cursor || Date.parse(last) > Date.parse(cursor)) { cursor = last; advanced = true; }
      if (rows.length < PULL_LIMIT) break;
      pageSince = last;
    }
    if (advanced) {
      this.meta = { ...this.meta, cursor, cursorAt: Date.now(), overlapDone: false };
      await this.saveMeta();
    } else if (useOverlap && Date.now() - (this.meta.cursorAt ?? 0) > 5000) {
      this.meta = { ...this.meta, overlapDone: true };
      await this.saveMeta();
    }
    await this.recompute(touched);
  }

  private async apply(changes: db.RemoteChange[], touched?: Set<string>) {
    await db.applyRemote(changes, (c, pending, local) => {
      const d = decideRemote(c, pending, local);
      if (touched && (d.write !== undefined || d.remove)) {
        if (c.store === 'attempts') { const rid = resultIdOf(c, local); if (rid) touched.add(rid); }
        if (c.store === 'results') touched.add(c.id);
      }
      return d;
    });
  }

  /**
   * Счётчики результата всегда пересчитываются из попыток. Если двое отмечали одно упражнение
   * одновременно, после обмена попытками у обоих получатся одинаковые и полные цифры.
   */
  private async recompute(resultIds: Set<string>) {
    const ops: db.Op[] = [];
    for (const rid of resultIds) {
      const r = await db.get<ExerciseResult>('results', rid);
      if (!r) continue;
      const atts = await db.byIndex<Attempt>('attempts', 'resultId', rid);
      if (!atts.length) continue;
      const sum = summarize(atts, ex(r.exerciseId).measurement);
      const keys = Object.keys(sum) as (keyof typeof sum)[];
      if (keys.every((k) => JSON.stringify(r[k]) === JSON.stringify(sum[k]))) continue;
      ops.push({ type: 'put', store: 'results', value: { ...r, ...sum, updatedAt: Date.now() } });
    }
    if (ops.length) await db.batch(ops);
  }

  // ---------- Фото ----------
  fetchPhoto: PhotoFetcher = async (id) => {
    const c = this.client;
    if (!c?.user || !this.meta.packId) return null;
    try {
      const blob = await c.downloadPhoto(`${this.meta.packId}/${id}`);
      if (!blob) return null;
      const rec = await db.get<Record<string, unknown>>('photos', id);
      if (!rec) return null;
      await db.batch([{ type: 'put', store: 'photos', value: { ...rec, blob, uploaded: true } }], { silent: true });
      return blob;
    } catch { return null; }
  };

  // ---------- Аккаунт и общая собака ----------
  private need(): SupaClient {
    if (!this.client) throw new CloudError('Облако не настроено в этой сборке приложения.', 'config');
    return this.client;
  }

  async signIn(email: string, password: string) {
    await this.need().signIn(email.trim(), password);
    await this.afterSignIn();
  }

  async signUp(email: string, password: string): Promise<{ needsConfirm: boolean }> {
    const redirect = typeof location !== 'undefined' ? location.origin + location.pathname : undefined;
    const r = await this.need().signUp(email.trim(), password, redirect);
    if (r.session) await this.afterSignIn();
    return { needsConfirm: !r.session };
  }

  private async afterSignIn() {
    if (this.meta.packId) {
      const packs = await this.myPacks();
      const p = packs.find((x) => x.id === this.meta.packId);
      if (p) {
        this.meta.pack = p;
        await this.saveMeta();
        this.setTrackingFlag(true);
        this.startLoop();
        this.refreshState();
        void this.syncNow();
        return;
      }
      await this.disconnect({ signOut: false });
    }
    this.refreshState();
  }

  async signOut() {
    await this.disconnect({ signOut: true });
  }

  async myPacks(): Promise<PackInfo[]> {
    return (await this.need().rpc<PackInfo[]>('aussie_my_packs', {})) ?? [];
  }

  /** Сделать собаку общей: создать стаю и отправить в облако все данные этого телефона. */
  async createPack(name: string, displayName: string): Promise<PackInfo> {
    const p = await this.need().rpc<PackInfo>('aussie_create_pack', { p_name: name, p_display_name: displayName });
    this.meta = { ...this.meta, packId: p.id, pack: p, cursor: null };
    await this.saveMeta();
    this.setTrackingFlag(true);
    await db.enqueueAll();
    this.refreshState();
    this.startLoop();
    await this.syncNow();
    return p;
  }

  async joinByCode(code: string, displayName: string): Promise<PackInfo> {
    const p = await this.need().rpc<PackInfo>('aussie_join_pack', { p_code: code, p_display_name: displayName });
    await this.connect(p);
    return p;
  }

  /** Подключить телефон к общей собаке: данные телефона заменяются данными из облака. */
  async connect(p: PackInfo) {
    this.setTrackingFlag(false);
    await db.batch([...db.SYNC_STORES.map((store) => ({ type: 'clear' as const, store })), { type: 'clear', store: 'outbox' }], { silent: true });
    this.meta = { ...this.meta, packId: p.id, pack: p, cursor: null };
    await this.saveMeta();
    this.setTrackingFlag(true);
    this.refreshState();
    this.startLoop();
    await this.syncNow();
    if (this.status.state === 'offline') throw new CloudError('Нет связи с облаком. Данные загрузятся, когда появится интернет.', 'network');
    if (this.status.state === 'error') throw new CloudError(this.status.error ?? 'Ошибка синхронизации');
  }

  /** Отключить телефон от общей собаки. Данные на телефоне остаются, но больше не синхронизируются. */
  async disconnect(opts: { signOut: boolean }) {
    this.stopLoop();
    this.setTrackingFlag(false);
    try { await db.batch([{ type: 'clear', store: 'outbox' }], { silent: true }); } catch { /* нет базы */ }
    this.meta = { key: 'cloud', deviceId: this.meta.deviceId };
    try { await this.saveMeta(); } catch { /* нет базы */ }
    if (opts.signOut) await this.client?.signOut();
    this.set({ pack: null, lastSync: null, error: null, pending: 0 });
    this.refreshState();
  }

  async leavePack() {
    const id = this.meta.packId;
    if (id) await this.need().rpc('aussie_leave_pack', { p_pack: id });
    await this.disconnect({ signOut: false });
  }

  async setDisplayName(name: string) {
    if (!this.meta.packId || !this.client?.user) return;
    const p = await this.client.rpc<PackInfo>('aussie_set_name', { p_pack: this.meta.packId, p_display_name: name });
    this.meta.pack = p;
    await this.saveMeta();
    this.set({ pack: p });
  }

  async newInvite() {
    if (!this.meta.packId) return;
    const p = await this.need().rpc<PackInfo>('aussie_new_invite', { p_pack: this.meta.packId });
    this.meta.pack = p;
    await this.saveMeta();
    this.set({ pack: p });
  }

  async refreshPack() {
    if (!this.meta.packId || !this.client?.user) return;
    const p = (await this.myPacks()).find((x) => x.id === this.meta.packId);
    if (!p) throw new CloudError('Вы больше не участник этой общей собаки', 'membership');
    this.meta.pack = p;
    this.set({ pack: p });
  }

  /** Перед удалением всех данных телефона: забыть подключение и выйти из аккаунта. */
  async forgetDevice() {
    await this.disconnect({ signOut: true });
  }
}

export const cloud = new Cloud();

export function useCloud(): CloudStatus {
  return useSyncExternalStore(cloud.subscribe, cloud.get);
}

export function memberName(pack: PackInfo | null, userId: string | undefined): string | undefined {
  if (!pack || !userId) return undefined;
  const m = pack.members.find((x) => x.user_id === userId);
  return m?.display_name || m?.email?.split('@')[0] || undefined;
}
