// HTTP-заглушка Supabase для сквозной проверки двух телефонов: Auth, RPC общей собаки, Storage.
// Повторяет правила из supabase/aussie_trainer.sql: участие в стае, побеждает более позднее изменение,
// курсор по серверному времени, фото только для участников.
import http from 'node:http';
import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const STORES = new Set(['dogs', 'programs', 'days', 'sessions', 'trainings', 'results', 'attempts', 'levels', 'levelChanges', 'journal', 'customExercises', 'reports', 'photos']);

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

export function startMockSupabase(port = 54400) {
  const users = new Map(); // email -> { id, password }
  const tokens = new Map(); // access -> uid
  const refresh = new Map(); // refresh -> uid
  const packs = new Map(); // id -> { id, name, invite_code, created_at }
  const members = []; // { pack_id, user_id, display_name, email, joined_at }
  const records = new Map(); // pack|store|id -> row
  const files = new Map(); // path -> { type, buf }
  let lastServer = 0;
  const serverNow = () => { lastServer = Math.max(Date.now(), lastServer + 1); return new Date(lastServer).toISOString(); };
  const emailOf = (id) => [...users.entries()].find(([, u]) => u.id === id)?.[0];
  const isMember = (pack, uid) => members.some((m) => m.pack_id === pack && m.user_id === uid);
  const code = () => Array.from(crypto.randomBytes(8), (b) => ALPHABET[b % 32]).join('');
  const info = (pid) => {
    const p = packs.get(pid);
    return { ...p, members: members.filter((m) => m.pack_id === pid).map(({ user_id, display_name, email, joined_at }) => ({ user_id, display_name, email, joined_at })) };
  };
  const needMember = (pack, uid) => { if (!isMember(pack, uid)) throw new HttpError(400, 'Вы не участник этой общей собаки'); };
  const issue = (uid, email) => {
    const at = 'at_' + crypto.randomUUID();
    const rt = 'rt_' + crypto.randomUUID();
    tokens.set(at, uid); refresh.set(rt, uid);
    return { access_token: at, refresh_token: rt, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: uid, email } };
  };

  const rpc = {
    aussie_my_packs: (uid) => members.filter((m) => m.user_id === uid).map((m) => info(m.pack_id)),
    aussie_create_pack: (uid, b) => {
      const id = crypto.randomUUID();
      packs.set(id, { id, name: (b.p_name || 'Собака').slice(0, 100), invite_code: code(), created_at: new Date().toISOString() });
      members.push({ pack_id: id, user_id: uid, display_name: (b.p_display_name || '').trim(), email: emailOf(uid), joined_at: new Date().toISOString() });
      return info(id);
    },
    aussie_join_pack: (uid, b) => {
      const clean = String(b.p_code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const p = [...packs.values()].find((x) => x.invite_code === clean);
      if (!p) throw new HttpError(400, 'Код приглашения не найден. Проверьте 8 символов.');
      const m = members.find((x) => x.pack_id === p.id && x.user_id === uid);
      if (m) { if ((b.p_display_name || '').trim()) m.display_name = b.p_display_name.trim(); }
      else members.push({ pack_id: p.id, user_id: uid, display_name: (b.p_display_name || '').trim(), email: emailOf(uid), joined_at: new Date().toISOString() });
      return info(p.id);
    },
    aussie_set_name: (uid, b) => {
      needMember(b.p_pack, uid);
      members.find((x) => x.pack_id === b.p_pack && x.user_id === uid).display_name = (b.p_display_name || '').trim();
      return info(b.p_pack);
    },
    aussie_new_invite: (uid, b) => { needMember(b.p_pack, uid); packs.get(b.p_pack).invite_code = code(); return info(b.p_pack); },
    aussie_leave_pack: (uid, b) => {
      const i = members.findIndex((x) => x.pack_id === b.p_pack && x.user_id === uid);
      if (i >= 0) members.splice(i, 1);
      if (!members.some((x) => x.pack_id === b.p_pack)) {
        packs.delete(b.p_pack);
        for (const k of [...records.keys()]) if (k.startsWith(b.p_pack + '|')) records.delete(k);
      }
      return null;
    },
    aussie_push: (uid, b) => {
      needMember(b.p_pack, uid);
      const out = [];
      for (const r of b.p_rows) {
        if (!STORES.has(r.store)) throw new HttpError(400, 'new row violates check constraint "aussie_records_store_check"');
        const key = `${b.p_pack}|${r.store}|${r.id}`;
        const cur = records.get(key);
        const incoming = Date.parse(r.updated_at);
        if (!cur || Date.parse(cur.updated_at) < incoming) {
          const deleted = !!r.deleted;
          records.set(key, { store: r.store, id: r.id, data: deleted ? null : r.data, deleted, updated_at: new Date(incoming).toISOString(), server_updated_at: serverNow(), updated_by: uid });
        }
        const s = records.get(key);
        out.push({ store: s.store, id: s.id, data: s.data, deleted: s.deleted, updated_at: s.updated_at, server_updated_at: s.server_updated_at });
      }
      return out;
    },
    aussie_pull: (uid, b) => {
      needMember(b.p_pack, uid);
      const since = b.p_since ? Date.parse(b.p_since) : null;
      const lim = Math.min(Math.max(b.p_limit || 1000, 1), 5000);
      return [...records.entries()]
        .filter(([k, r]) => k.startsWith(b.p_pack + '|') && (since === null || Date.parse(r.server_updated_at) > since))
        .map(([, r]) => r)
        .sort((a, c) => a.server_updated_at.localeCompare(c.server_updated_at) || a.store.localeCompare(c.store) || a.id.localeCompare(c.id))
        .slice(0, lim)
        .map(({ store, id, data, deleted, updated_at, server_updated_at }) => ({ store, id, data, deleted, updated_at, server_updated_at }));
    },
  };

  const server = http.createServer((req, res) => {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'apikey, authorization, content-type, accept, x-client-info, x-upsert, cache-control',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    };
    const send = (status, body) => { res.writeHead(status, { ...cors, 'Content-Type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const buf = Buffer.concat(chunks);
      if (!req.headers.apikey) return send(401, { message: 'No API key found in request' });
      const bearer = (req.headers.authorization || '').replace(/^Bearer /, '');
      const uid = tokens.get(bearer);
      try {
        // ---- Storage ----
        const st = /^\/storage\/v1\/object\/(authenticated\/)?aussie-photos\/(.+)$/.exec(url.pathname);
        if (st) {
          if (!uid) return send(400, { statusCode: '403', error: 'Unauthorized', message: 'invalid JWT' });
          const path = decodeURIComponent(st[2]);
          const pack = path.split('/')[0];
          if (!isMember(pack, uid)) return send(400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
          if (req.method === 'POST' || req.method === 'PUT') { files.set(path, { type: req.headers['content-type'] || 'application/octet-stream', buf }); return send(200, { Key: `aussie-photos/${path}` }); }
          if (req.method === 'DELETE') { files.delete(path); return send(200, [{ name: path }]); }
          const f = files.get(path);
          if (!f) return send(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
          res.writeHead(200, { ...cors, 'Content-Type': f.type });
          return res.end(f.buf);
        }
        const body = buf.length ? JSON.parse(buf.toString('utf8')) : {};
        // ---- Auth ----
        if (url.pathname === '/auth/v1/signup') {
          if (users.has(body.email)) return send(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
          if (!body.password || body.password.length < 6) return send(422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' });
          const id = crypto.randomUUID();
          users.set(body.email, { id, password: body.password });
          return send(200, issue(id, body.email));
        }
        if (url.pathname === '/auth/v1/token') {
          const gt = url.searchParams.get('grant_type');
          if (gt === 'password') {
            const u = users.get(body.email);
            if (!u || u.password !== body.password) return send(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
            return send(200, issue(u.id, body.email));
          }
          if (gt === 'refresh_token') {
            const id = refresh.get(body.refresh_token);
            if (!id) return send(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' });
            refresh.delete(body.refresh_token);
            return send(200, issue(id, emailOf(id)));
          }
        }
        if (url.pathname === '/auth/v1/logout') { tokens.delete(bearer); res.writeHead(204, cors); return res.end(); }
        // ---- RPC ----
        if (url.pathname.startsWith('/rest/v1/rpc/')) {
          if (!uid) return send(401, { code: 'PGRST301', message: 'JWT expired' });
          const fn = url.pathname.slice('/rest/v1/rpc/'.length);
          if (!rpc[fn]) return send(404, { code: 'PGRST202', message: `Could not find the function public.${fn}` });
          return send(200, rpc[fn](uid, body));
        }
        return send(404, { message: 'not found' });
      } catch (e) {
        return send(e.status || 400, { message: e.message });
      }
    });
  });
  const state = { users, packs, members, records, files };
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, state, url: `http://127.0.0.1:${port}` })));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const port = Number(process.argv[2] || 54400);
  startMockSupabase(port).then(({ url }) => console.log(`Mock Supabase: ${url}`));
}
