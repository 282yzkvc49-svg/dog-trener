// Минимальный клиент Supabase без внешних библиотек: вход (GoTrue), функции (PostgREST RPC), фото (Storage).
// Используется только публичный ключ; доступ к данным ограничен правилами RLS на сервере.

export interface AuthUser { id: string; email?: string }
export interface Session { access_token: string; refresh_token: string; expires_at: number; user: AuthUser }
export interface CloudConfig { url: string; anonKey: string }

export type CloudErrorCode = 'network' | 'auth' | 'server' | 'config' | 'confirm' | 'membership';

export class CloudError extends Error {
  constructor(message: string, public code: CloudErrorCode = 'server', public status = 0) {
    super(message);
    this.name = 'CloudError';
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const SESSION_KEY = 'aussie-trainer:session';
export const PHOTO_BUCKET = 'aussie-photos';

function translateAuthError(status: number, body: any): CloudError {
  const code = body?.error_code || body?.code || body?.error || '';
  const msg = String(body?.msg || body?.message || body?.error_description || body?.error || '');
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg) || code === 'invalid_grant') return new CloudError('Неверная почта или пароль.', 'auth', status);
  if (code === 'user_already_exists' || /already registered/i.test(msg)) return new CloudError('Этот адрес уже зарегистрирован — войдите с паролем.', 'auth', status);
  if (code === 'weak_password' || /password should be at least/i.test(msg)) return new CloudError('Пароль слишком простой: нужно не меньше 6 символов.', 'auth', status);
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) return new CloudError('Адрес ещё не подтверждён — откройте письмо от Supabase, перейдите по ссылке и войдите снова.', 'confirm', status);
  if (code === 'over_email_send_rate_limit' || status === 429) return new CloudError('Слишком много попыток. Подождите пару минут.', 'auth', status);
  if (/invalid.*email|validation_failed/i.test(code + msg)) return new CloudError('Проверьте адрес почты.', 'auth', status);
  if (/refresh token/i.test(msg)) return new CloudError('Сессия истекла — войдите снова.', 'auth', status);
  return new CloudError(msg ? `Облако ответило: ${msg}` : `Ошибка облака (${status})`, status === 401 || status === 403 ? 'auth' : 'server', status);
}

export class SupaClient {
  session: Session | null = null;
  config: CloudConfig;
  private refreshing: Promise<void> | null = null;
  onSession: (s: Session | null) => void = () => {};

  constructor(config: CloudConfig, private fetcher: FetchLike = (...a) => fetch(...a), private storage: KV | null = typeof localStorage !== 'undefined' ? localStorage : null) {
    this.config = { url: config.url.replace(/\/+$/, ''), anonKey: config.anonKey.trim() };
    try {
      const raw = this.storage?.getItem(SESSION_KEY);
      if (raw) this.session = JSON.parse(raw);
    } catch { this.session = null; }
  }

  get user(): AuthUser | null { return this.session?.user ?? null; }

  private setSession(s: Session | null) {
    this.session = s;
    try {
      if (s) this.storage?.setItem(SESSION_KEY, JSON.stringify(s));
      else this.storage?.removeItem(SESSION_KEY);
    } catch { /* хранилище недоступно */ }
    this.onSession(s);
  }

  private headers(token?: string, json = true) {
    const h: Record<string, string> = { apikey: this.config.anonKey, Accept: 'application/json' };
    if (json) h['Content-Type'] = 'application/json';
    // Новые publishable-ключи (sb_publishable_…) не являются JWT и в Authorization не передаются.
    if (token) h.Authorization = `Bearer ${token}`;
    else if (this.config.anonKey.split('.').length === 3) h.Authorization = `Bearer ${this.config.anonKey}`;
    return h;
  }

  private async raw(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetcher(this.config.url + path, init);
    } catch {
      throw new CloudError('Нет связи с облаком. Изменения сохранены на телефоне и отправятся позже.', 'network');
    }
  }

  private async call(path: string, init: RequestInit): Promise<{ status: number; body: any }> {
    const res = await this.raw(path, init);
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: res.status, body };
  }

  private toSession(body: any): Session {
    const expiresAt = body.expires_at ?? Math.floor(Date.now() / 1000) + Number(body.expires_in || 3600);
    return { access_token: body.access_token, refresh_token: body.refresh_token, expires_at: expiresAt, user: { id: body.user?.id, email: body.user?.email } };
  }

  async signUp(email: string, password: string, redirectTo?: string): Promise<{ session: Session | null }> {
    const q = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '';
    const { status, body } = await this.call(`/auth/v1/signup${q}`, { method: 'POST', headers: this.headers(), body: JSON.stringify({ email, password }) });
    if (status >= 400) throw translateAuthError(status, body);
    if (body?.access_token) { const s = this.toSession(body); this.setSession(s); return { session: s }; }
    // Включено подтверждение почты: сессии ещё нет. Пустые identities — адрес уже зарегистрирован.
    if (Array.isArray(body?.identities) && body.identities.length === 0) throw new CloudError('Этот адрес уже зарегистрирован — войдите с паролем.', 'auth', status);
    return { session: null };
  }

  async signIn(email: string, password: string): Promise<Session> {
    const { status, body } = await this.call('/auth/v1/token?grant_type=password', { method: 'POST', headers: this.headers(), body: JSON.stringify({ email, password }) });
    if (status >= 400 || !body?.access_token) throw translateAuthError(status, body);
    const s = this.toSession(body);
    this.setSession(s);
    return s;
  }

  async signOut() {
    const s = this.session;
    this.setSession(null);
    if (s) {
      try { await this.call('/auth/v1/logout', { method: 'POST', headers: this.headers(s.access_token) }); } catch { /* офлайн — сессия уже забыта на телефоне */ }
    }
  }

  async refresh(): Promise<void> {
    if (!this.session) throw new CloudError('Нужно войти в аккаунт.', 'auth');
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const { status, body } = await this.call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: this.headers(), body: JSON.stringify({ refresh_token: this.session!.refresh_token }) });
      if (status >= 400 || !body?.access_token) {
        if (status === 400 || status === 401) this.setSession(null);
        throw translateAuthError(status, body);
      }
      this.setSession(this.toSession(body));
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  async token(): Promise<string> {
    if (!this.session) throw new CloudError('Нужно войти в аккаунт.', 'auth');
    if (this.session.expires_at - 60 < Date.now() / 1000) await this.refresh();
    return this.session!.access_token;
  }

  async rpc<T = any>(fn: string, args: Record<string, unknown>, retried = false): Promise<T> {
    const token = await this.token();
    const { status, body } = await this.call(`/rest/v1/rpc/${fn}`, { method: 'POST', headers: this.headers(token), body: JSON.stringify(args) });
    if (status === 401 && !retried) { await this.refresh(); return this.rpc<T>(fn, args, true); }
    if (status === 404 && /could not find the function|PGRST202/i.test(JSON.stringify(body))) {
      throw new CloudError('В облаке нет таблиц общей собаки. Выполните SQL-скрипт aussie_trainer.sql в Supabase → SQL Editor.', 'config', status);
    }
    if (status >= 400) {
      const msg = String(body?.message || body?.msg || body?.hint || '');
      if (/не участник/i.test(msg)) throw new CloudError(msg, 'membership', status);
      throw new CloudError(msg || `Ошибка облака (${status})`, status === 401 || status === 403 ? 'auth' : 'server', status);
    }
    return body as T;
  }

  // ---------- Фото ----------
  private async authed(path: string, init: RequestInit, retried = false): Promise<Response> {
    const token = await this.token();
    const res = await this.raw(path, { ...init, headers: { ...this.headers(token, false), ...(init.headers as Record<string, string> | undefined) } });
    // Хранилище Supabase на просроченный токен иногда отвечает 400 с текстом про JWT — тоже обновляем сессию.
    if ((res.status === 400 || res.status === 401 || res.status === 403) && !retried) {
      const text = await res.clone().text();
      if (/jwt|token|expired|"exp"/i.test(text)) { await this.refresh(); return this.authed(path, init, true); }
    }
    return res;
  }

  async uploadPhoto(path: string, blob: Blob): Promise<void> {
    const res = await this.authed(`/storage/v1/object/${PHOTO_BUCKET}/${path}`, {
      method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'true', 'cache-control': '31536000' },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (/bucket not found/i.test(text)) throw new CloudError('В облаке нет хранилища фото. Выполните SQL-скрипт aussie_trainer.sql в Supabase → SQL Editor.', 'config', res.status);
      throw new CloudError(`Не удалось отправить фото (${res.status})`, 'server', res.status);
    }
  }

  async downloadPhoto(path: string): Promise<Blob | null> {
    const res = await this.authed(`/storage/v1/object/authenticated/${PHOTO_BUCKET}/${path}`, { method: 'GET' });
    if (res.status === 400 || res.status === 404) return null;
    if (!res.ok) throw new CloudError(`Не удалось загрузить фото (${res.status})`, 'server', res.status);
    return await res.blob();
  }

  async deletePhoto(path: string): Promise<void> {
    await this.authed(`/storage/v1/object/${PHOTO_BUCKET}/${path}`, { method: 'DELETE' }).catch(() => undefined);
  }
}

export function validateConfig(c: Partial<CloudConfig>): boolean {
  const url = (c.url ?? '').trim(), key = (c.anonKey ?? '').trim();
  const okUrl = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(url) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(url);
  return okUrl && key.length >= 20 && !/service_role|sb_secret_/i.test(key);
}
