// Общая собака: вход в аккаунт, создание и присоединение по коду, статус синхронизации.

import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { LuCloud, LuCloudAlert, LuCloudOff, LuCloudUpload, LuLogOut, LuRefreshCw, LuShare2, LuUnlink, LuUserPlus, LuUsers } from 'react-icons/lu';
import { cloud, useCloud, type CloudStatus, type PackInfo } from '../cloud/cloud';
import { useApp, current } from '../db/store';
import { count } from '../db/idb';
import { saveSettings } from '../db/repo';
import { Button, Field, Sheet } from '../ui/kit';
import { confirmDialog, toast, toastError } from '../ui/dialogs';
import { navigate } from '../ui/router';
import { shareText } from '../ui/share';
import { fmtTime } from '../lib/date';

const APP_URL = 'https://282yzkvc49-svg.github.io/dog-trener/';
const fmtCode = (c: string) => (c.length === 8 ? `${c.slice(0, 4)} ${c.slice(4)}` : c);

// ---------- Вход и регистрация ----------
export function AuthForm({ onDone }: { onDone?: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function submit() {
    setBusy(true); setError(''); setInfo('');
    try {
      if (mode === 'signin') {
        await cloud.signIn(email, password);
        onDone?.();
      } else {
        const r = await cloud.signUp(email, password);
        if (r.needsConfirm) {
          setInfo(`Мы отправили письмо на ${email.trim()}. Откройте его, подтвердите адрес и вернитесь сюда, чтобы войти.`);
          setMode('signin');
        } else onDone?.();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  const valid = /\S+@\S+\.\S+/.test(email.trim()) && password.length >= 6;
  return (
    <form onSubmit={(e: { preventDefault: () => void }) => { e.preventDefault(); if (valid && !busy) void submit(); }} className="space-y-3">
      <div role="radiogroup" aria-label="Режим" className="flex gap-1 rounded-2xl bg-surface-2 p-1">
        {(['signin', 'signup'] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { setMode(m); setError(''); }}
            className={clsx('press min-h-10 flex-1 rounded-xl text-[0.92rem] font-semibold', mode === m ? 'bg-surface shadow-card' : 'text-ink-2')}>
            {m === 'signin' ? 'Вход' : 'Новый аккаунт'}
          </button>
        ))}
      </div>
      <Field label="Почта"><input className="field" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Пароль" hint={mode === 'signup' ? 'Не меньше 6 символов' : undefined}>
        <input className="field" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <p className="rounded-xl bg-rose-soft px-3 py-2 text-[0.9rem]" role="alert">{error}</p>}
      {info && <p className="rounded-xl bg-sage-soft px-3 py-2 text-[0.9rem]" role="status">{info}</p>}
      <Button type="submit" variant="primary" size="lg" full disabled={!valid || busy}>{mode === 'signin' ? 'Войти' : 'Создать аккаунт'}</Button>
      <p className="text-[0.82rem] text-ink-3">Подойдёт тот же аккаунт, что в «Бережно»: это одно облако. Забытый пароль можно сменить там.</p>
    </form>
  );
}

// ---------- Присоединение по коду ----------
export function JoinSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const st = useCloud();
  const s = useApp();
  const { dog } = current(s);
  const [code, setCode] = useState('');
  const [name, setName] = useState(s.settings.ownerName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');

  async function join() {
    setBusy(true); setError('');
    try {
      if (dog) {
        const ok = await confirmDialog({
          title: 'Заменить данные на этом телефоне?',
          text: 'Профиль, план и тренировки на этом телефоне будут заменены данными общей собаки. Если они нужны, сначала сохраните резервную копию в настройках.',
          confirm: 'Заменить', danger: true,
        });
        if (!ok) { setBusy(false); return; }
      }
      await cloud.joinByCode(clean, name.trim());
      await saveSettings({ onboarded: true, ownerName: name.trim() || undefined });
      const dogs = await count('dogs');
      onClose();
      if (dogs) { toast('Готово: данные общей собаки на этом телефоне'); navigate('today', { replace: true }); }
      else toast('Данных пока нет. Попросите второго участника открыть приложение — всё загрузится само.', 'info');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <Sheet open={open} onClose={onClose} title="Присоединиться к общей собаке">
      {!st.user ? (
        <>
          <p className="mb-3 text-[0.92rem] text-ink-2">Сначала войдите в свой аккаунт. Код приглашения можно взять у второго участника: Настройки → Общая собака.</p>
          <AuthForm />
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-[0.92rem] text-ink-2">Вы вошли как {st.user.email}.</p>
          <Field label="Код приглашения" hint="8 символов, регистр не важен">
            <input className="field num text-[1.3rem] tracking-[0.2em]" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} placeholder="XXXX XXXX" maxLength={12} aria-label="Код приглашения" />
          </Field>
          <Field label="Как подписывать ваши тренировки"><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Аня" autoComplete="given-name" /></Field>
          {error && <p className="rounded-xl bg-rose-soft px-3 py-2 text-[0.9rem]" role="alert">{error}</p>}
          <Button variant="primary" size="lg" full disabled={clean.length !== 8 || busy} onClick={join}>{busy ? 'Загружаем данные…' : 'Присоединиться'}</Button>
        </div>
      )}
    </Sheet>
  );
}

// ---------- Индикатор на главном экране ----------
export function syncLabel(st: CloudStatus): string {
  if (st.state === 'offline') return st.pending ? `Нет сети: ${st.pending} изменений отправятся позже` : 'Нет сети';
  if (st.state === 'error') return st.error ?? 'Ошибка синхронизации';
  if (st.state === 'signed-out') return 'Войдите в аккаунт, чтобы продолжить синхронизацию';
  if (st.pending) return `Отправляется изменений: ${st.pending}`;
  if (st.state === 'syncing') return 'Синхронизация…';
  return st.lastSync ? `Синхронизировано в ${fmtTime(st.lastSync)}` : 'Синхронизация включена';
}

export function SyncBadge() {
  const st = useCloud();
  if (!st.pack) return null;
  const bad = st.state === 'error' || st.state === 'signed-out';
  const Icon = st.state === 'offline' ? LuCloudOff : bad ? LuCloudAlert : st.pending ? LuCloudUpload : LuCloud;
  return (
    <button type="button" onClick={() => navigate('settings')} aria-label={`Общая собака: ${syncLabel(st)}`} title={syncLabel(st)}
      className={clsx('press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full', bad ? 'text-rose' : st.state === 'offline' ? 'text-ink-3' : st.pending ? 'text-merle' : 'text-sage')}>
      <Icon size={22} aria-hidden />
    </button>
  );
}

// ---------- Раздел настроек ----------
export function CloudSection() {
  const st = useCloud();
  const s = useApp();
  const { dog } = current(s);
  const [authOpen, setAuthOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [packs, setPacks] = useState<PackInfo[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (st.state !== 'not-connected') { setPacks(null); return; }
    let alive = true;
    cloud.myPacks().then((p) => alive && setPacks(p)).catch(() => alive && setPacks([]));
    return () => { alive = false; };
  }, [st.state, st.user?.id]);

  if (st.state === 'unavailable') return null;

  async function connectExisting(p: PackInfo) {
    if (dog) {
      const ok = await confirmDialog({
        title: `Подключиться к «${p.name}»?`,
        text: 'Данные на этом телефоне будут заменены данными общей собаки. Если они нужны, сначала сохраните резервную копию.',
        confirm: 'Подключиться', danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try { await cloud.connect(p); await saveSettings({ onboarded: true }); toast('Телефон подключён к общей собаке'); } catch (e) { toastError(e); }
    setBusy(false);
  }

  const me = st.user?.id;
  return (
    <section className="card p-4" aria-label="Общая собака">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-merle-soft text-merle"><LuUsers size={22} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{st.pack ? `Общая собака: ${st.pack.name}` : 'Общая собака'}</h2>
          <p className="text-[0.88rem] text-ink-2">
            {st.pack ? syncLabel(st) : 'Тренируйте вдвоём: что отметит один, через несколько секунд появится у другого.'}
          </p>
        </div>
      </div>

      {/* Не вошли */}
      {st.state === 'signed-out' && (
        <div className="mt-4 space-y-2">
          {st.error && <p className="rounded-xl bg-amber-soft px-3 py-2 text-[0.9rem]">{st.error}</p>}
          <Button variant="primary" full onClick={() => setAuthOpen(true)}>{st.pack ? 'Войти снова' : 'Войти или создать аккаунт'}</Button>
          {st.pack && <Button variant="ghost" full onClick={() => cloud.disconnect({ signOut: false }).then(() => toast('Синхронизация отключена'))}>Отключить синхронизацию</Button>}
        </div>
      )}

      {/* Вошли, но телефон не подключён */}
      {st.state === 'not-connected' && (
        <div className="mt-4 space-y-2">
          <p className="text-[0.9rem]">Вы вошли как <span className="font-medium">{st.user?.email}</span>.</p>
          {st.error && <p className="rounded-xl bg-amber-soft px-3 py-2 text-[0.9rem]">{st.error}</p>}
          {packs?.map((p) => (
            <Button key={p.id} variant="primary" full disabled={busy} onClick={() => connectExisting(p)}>
              Подключиться к «{p.name}» ({p.members.map((m) => m.display_name || m.email).join(', ')})
            </Button>
          ))}
          {dog && <Button variant={packs?.length ? 'secondary' : 'primary'} full disabled={busy} onClick={() => setCreateOpen(true)} icon={<LuUserPlus size={18} aria-hidden />}>Сделать собаку общей</Button>}
          <Button full onClick={() => setJoinOpen(true)}>Присоединиться по коду</Button>
          <Button variant="ghost" full onClick={() => cloud.signOut()} icon={<LuLogOut size={18} aria-hidden />}>Выйти из аккаунта</Button>
        </div>
      )}

      {/* Подключён */}
      {st.pack && st.state !== 'signed-out' && (
        <ConnectedPanel pack={st.pack} me={me} st={st} />
      )}

      <Sheet open={authOpen} onClose={() => setAuthOpen(false)} title="Аккаунт для общей собаки">
        <AuthForm onDone={() => { setAuthOpen(false); toast('Вы вошли'); }} />
      </Sheet>
      <JoinSheet open={joinOpen} onClose={() => setJoinOpen(false)} />
      {createOpen && <CreateSheet onClose={() => setCreateOpen(false)} dogName={dog?.name || 'Собака'} />}
    </section>
  );
}

function CreateSheet({ onClose, dogName }: { onClose: () => void; dogName: string }) {
  const s = useApp();
  const [name, setName] = useState(s.settings.ownerName ?? '');
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      await cloud.createPack(dogName, name.trim());
      await saveSettings({ ownerName: name.trim() || undefined });
      toast('Собака теперь общая. Отправьте код приглашения второму участнику.');
      onClose();
    } catch (e) { toastError(e); setBusy(false); }
  }
  return (
    <Sheet open onClose={onClose} title="Сделать собаку общей"
      footer={<Button variant="primary" size="lg" full disabled={busy} onClick={create}>{busy ? 'Отправляем данные…' : 'Сделать общей'}</Button>}>
      <p className="text-[0.92rem] text-ink-2">Все данные этого телефона — профиль, план, тренировки, дневник и фото — уйдут в облако. Второй участник присоединится по коду и увидит то же самое.</p>
      <Field label="Как подписывать ваши тренировки" className="mt-4"><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Саша" autoComplete="given-name" /></Field>
    </Sheet>
  );
}

function ConnectedPanel({ pack, me, st }: { pack: PackInfo; me?: string; st: CloudStatus }) {
  const s = useApp();
  const [name, setName] = useState(s.settings.ownerName ?? pack.members.find((m) => m.user_id === me)?.display_name ?? '');
  const saved = s.settings.ownerName ?? '';

  async function invite() {
    const dogName = pack.name;
    const text = `Присоединяйся к тренировкам ${dogName} в Aussie Trainer.\n1. Открой в Safari: ${APP_URL}\n2. «Поделиться» → «На экран „Домой“», запусти с иконки.\n3. «Присоединиться к общей собаке», войди и введи код: ${fmtCode(pack.invite_code)}`;
    const r = await shareText('Приглашение в Aussie Trainer', text);
    if (r === 'copied') toast('Приглашение скопировано');
  }

  async function saveName() {
    try {
      await saveSettings({ ownerName: name.trim() || undefined });
      await cloud.setDisplayName(name.trim());
      toast('Имя сохранено');
    } catch (e) { toastError(e); }
  }

  async function leave() {
    const alone = pack.members.length <= 1;
    const ok = await confirmDialog({
      title: 'Выйти из общей собаки?',
      text: alone
        ? 'Вы единственный участник: данные общей собаки будут удалены из облака. На этом телефоне они останутся.'
        : 'Вы перестанете видеть изменения других участников. На этом телефоне данные останутся, у остальных — тоже.',
      confirm: 'Выйти', danger: true,
    });
    if (!ok) return;
    try { await cloud.leavePack(); toast('Вы вышли из общей собаки'); } catch (e) { toastError(e); }
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => cloud.syncNow()} disabled={st.state === 'syncing'} icon={<LuRefreshCw size={16} aria-hidden />}>Синхронизировать сейчас</Button>
      </div>

      <div>
        <h3 className="mb-1 text-[0.9rem] font-semibold">Участники</h3>
        <ul className="space-y-1 text-[0.95rem]">
          {pack.members.map((m) => (
            <li key={m.user_id} className="flex items-baseline justify-between gap-2">
              <span>{m.display_name || 'Без имени'}{m.user_id === me ? ' — это вы' : ''}</span>
              <span className="truncate text-[0.82rem] text-ink-3">{m.email}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl bg-surface-2 p-4">
        <p className="text-[0.85rem] text-ink-2">Код приглашения</p>
        <p className="num mt-1 select-all text-[1.7rem] font-semibold tracking-[0.18em]" aria-label={`Код приглашения ${pack.invite_code.split('').join(' ')}`}>{fmtCode(pack.invite_code)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={invite} icon={<LuShare2 size={16} aria-hidden />}>Отправить приглашение</Button>
          <Button size="sm" variant="ghost" onClick={async () => {
            if (await confirmDialog({ title: 'Сделать новый код?', text: 'Старый код перестанет работать. Уже подключённые участники останутся.', confirm: 'Новый код' })) cloud.newInvite().catch(toastError);
          }}>Новый код</Button>
        </div>
      </div>

      <div>
        <Field label="Как подписывать ваши тренировки"><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Саша" /></Field>
        <Button size="sm" className="mt-2" disabled={name.trim() === saved.trim()} onClick={saveName}>Сохранить имя</Button>
      </div>

      <p className="text-[0.82rem] text-ink-3">Вошли как {st.user?.email}. Без сети всё работает как обычно: изменения сохраняются на телефоне и уйдут в облако, когда появится связь.</p>

      <div className="grid gap-2">
        <Button variant="ghost" full onClick={async () => {
          if (await confirmDialog({ title: 'Отключить этот телефон?', text: 'Синхронизация остановится и вы выйдете из аккаунта. Данные на телефоне останутся. Подключиться снова можно в любой момент.', confirm: 'Отключить' })) {
            await cloud.disconnect({ signOut: true }); toast('Телефон отключён');
          }
        }} icon={<LuUnlink size={18} aria-hidden />}>Отключить этот телефон</Button>
        <Button variant="danger" full onClick={leave}>Выйти из общей собаки</Button>
      </div>
    </div>
  );
}
