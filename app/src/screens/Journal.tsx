// Дневник поведения: быстрые записи на прогулке и подробные записи с фото. Работает независимо от тренировок.

import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { LuCamera, LuNotebookPen, LuPlus, LuTrash2, LuX } from 'react-icons/lu';
import type { JournalEntry, JournalOutcome } from '../domain/types';
import { useApp, current } from '../db/store';
import { deleteJournal, deletePhoto, saveJournal, savePhoto } from '../db/repo';
import { Button, Chip, Empty, Field, Page } from '../ui/kit';
import { PhotoThumb, g } from '../ui/common';
import { navigate } from '../ui/router';
import { confirmDialog, toast, toastError } from '../ui/dialogs';
import { fmtDayLong, fmtTime, today, toISO } from '../lib/date';
import { uid } from '../lib/util';
import { resizePhoto } from '../ui/photo';

const OUTCOMES: { id: JournalOutcome; label: string; tone: 'sage' | 'merle' | 'rose' }[] = [
  { id: 'good', label: 'Хорошо', tone: 'sage' }, { id: 'neutral', label: 'Нейтрально', tone: 'merle' }, { id: 'bad', label: 'Трудно', tone: 'rose' },
];
const OUTCOME_DOT: Record<JournalOutcome, string> = { good: 'bg-sage', neutral: 'bg-merle', bad: 'bg-rose' };
const TRIGGERS = ['Собака', 'Человек', 'Еда на земле', 'Предмет на земле', 'Бегун или велосипед', 'Машина', 'Кошка или птица'];
const MAX_PHOTOS = 4;

function quickList(dog: ReturnType<typeof current>['dog']) {
  return [
    { key: 'pull', situation: `${g(dog, 'Увидела', 'Увидел')} собаку, ${g(dog, 'начала', 'начал')} тянуть поводок`, trigger: 'Собака', reaction: 'Тянула поводок', outcome: 'bad' as const },
    { key: 'calm-person', situation: `${g(dog, 'Прошла', 'Прошёл')} мимо человека спокойно`, trigger: 'Человек', reaction: 'Спокойно', outcome: 'good' as const },
    { key: 'scavenge', situation: `${g(dog, 'Попыталась', 'Попытался')} подобрать еду`, trigger: 'Еда на земле', reaction: 'Попытка подобрать', outcome: 'bad' as const },
    { key: 'checkin', situation: `Самостоятельно ${g(dog, 'посмотрела', 'посмотрел')} на хозяина`, trigger: '', reaction: 'Добровольный контакт', outcome: 'good' as const },
    { key: 'cue', situation: `Успешно ${g(dog, 'выполнила', 'выполнил')} команду при отвлечении`, trigger: '', reaction: 'Выполнение команды', outcome: 'good' as const },
  ];
}

export function JournalScreen() {
  const s = useApp();
  const { dog } = current(s);
  const list = [...s.journal].sort((a, b) => b.occurredAt - a.occurredAt);
  const groups = new Map<string, JournalEntry[]>();
  for (const j of list) { const k = toISO(new Date(j.occurredAt)); (groups.get(k) ?? groups.set(k, []).get(k)!).push(j); }

  async function quick(q: ReturnType<typeof quickList>[number]) {
    if (!dog) return;
    const now = Date.now();
    const entry: JournalEntry = { id: uid('jr-'), dogId: dog.id, occurredAt: now, location: lastLocation(s.journal), situation: q.situation, trigger: q.trigger, reaction: q.reaction, ownerAction: '', outcome: q.outcome, notes: '', photoIds: [], quick: q.key, createdAt: now, updatedAt: now };
    try {
      await saveJournal(entry);
      try { navigator.vibrate?.(12); } catch { /* нет вибрации */ }
      toast('Записано', 'ok', { label: 'Дополнить', run: () => navigate(`journal/${entry.id}`) });
    } catch (e) { toastError(e); }
  }

  return (
    <Page title="Дневник" sub="Реальные события на прогулках" right={<Button size="sm" variant="primary" onClick={() => navigate('journal/new')} icon={<LuPlus size={16} aria-hidden />}>Запись</Button>}>
      <p className="px-1 text-[0.9rem] text-ink-2">Быстрая запись одним касанием — время ставится автоматически.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {quickList(dog).map((q) => (
          <button key={q.key} type="button" onClick={() => quick(q)} className="card press flex min-h-14 items-center gap-3 px-4 py-3 text-left">
            <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', OUTCOME_DOT[q.outcome])} aria-hidden />
            <span className="flex-1 font-medium leading-snug">{q.situation}</span>
            <LuPlus className="shrink-0 text-ink-3" size={18} aria-hidden />
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-5">
        {!list.length && <Empty icon={<LuNotebookPen size={34} />} title="Записей пока нет" text="Отмечайте встречи, удачи и трудности на прогулках — это помогает увидеть реальные изменения поведения и попадает в недельный отчёт." />}
        {[...groups.entries()].map(([day, items]) => (
          <section key={day}>
            <h2 className="mb-2 px-1 text-[0.95rem] font-semibold">{day === today() ? 'Сегодня' : fmtDayLong(day)}</h2>
            <ul className="space-y-2">
              {items.map((j) => (
                <li key={j.id}>
                  <button type="button" onClick={() => navigate(`journal/${j.id}`)} className="card press flex w-full items-start gap-3 p-4 text-left">
                    <span className={clsx('mt-2 h-2.5 w-2.5 shrink-0 rounded-full', OUTCOME_DOT[j.outcome])} aria-label={OUTCOMES.find((o) => o.id === j.outcome)?.label} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium leading-snug">{j.situation || 'Без описания'}</span>
                      <span className="block text-[0.85rem] text-ink-2">{fmtTime(j.occurredAt)}{j.location ? ` · ${j.location}` : ''}{j.trigger ? ` · ${j.trigger}` : ''}</span>
                      {j.notes && <span className="mt-1 block text-[0.88rem] text-ink-2 line-clamp-2">{j.notes}</span>}
                    </span>
                    {j.photoIds[0] && <PhotoThumb id={j.photoIds[0]} alt="Фото к записи" className="h-14 w-14 shrink-0 rounded-xl" />}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Page>
  );
}

function lastLocation(list: JournalEntry[]) {
  return [...list].sort((a, b) => b.occurredAt - a.occurredAt).find((j) => j.location)?.location ?? '';
}

const toLocalInput = (ts: number) => { const d = new Date(ts); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const fromLocalInput = (s: string) => new Date(s).getTime();

export function JournalEntryScreen({ id }: { id: string }) {
  const s = useApp();
  const { dog } = current(s);
  const existing = id !== 'new' ? s.journal.find((j) => j.id === id) : undefined;
  const [draft, setDraft] = useState<JournalEntry>(() => existing ?? {
    id: uid('jr-'), dogId: dog?.id ?? '', occurredAt: Date.now(), location: lastLocation(s.journal), situation: '', trigger: '', reaction: '', ownerAction: '',
    outcome: 'neutral', notes: '', photoIds: [], createdAt: Date.now(), updatedAt: Date.now(),
  });
  const created = useRef(!!existing);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(draft);
  latest.current = draft;

  // Автосохранение: новая запись создаётся при первом изменении, дальше сохраняется через полсекунды.
  function change(p: Partial<JournalEntry>) {
    const next = { ...latest.current, ...p };
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await saveJournal(latest.current);
        if (!created.current) { created.current = true; navigate(`journal/${latest.current.id}`, { replace: true }); }
      } catch (e) { toastError(e); }
    }, 450);
  }
  useEffect(() => () => {
    if (timer.current) { clearTimeout(timer.current); if (created.current || latest.current.situation || latest.current.notes) saveJournal(latest.current).catch(() => {}); }
  }, []);

  if (id !== 'new' && !existing && !created.current) return <Page title="Запись" back="journal"><Empty title="Запись не найдена" /></Page>;

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const room = MAX_PHOTOS - latest.current.photoIds.length;
    const list = [...files].slice(0, Math.max(0, room));
    if (files.length > room) toast(`Можно прикрепить не больше ${MAX_PHOTOS} фото`, 'info');
    for (const f of list) {
      try {
        const { blob, width, height } = await resizePhoto(f);
        const pid = await savePhoto(blob, width, height);
        change({ photoIds: [...latest.current.photoIds, pid] });
      } catch (e) { toastError(e); }
    }
  }

  async function removePhoto(pid: string) {
    change({ photoIds: latest.current.photoIds.filter((x) => x !== pid) });
    deletePhoto(pid).catch(() => {});
  }

  async function remove() {
    const ok = await confirmDialog({ title: 'Удалить запись?', text: 'Запись и её фото будут удалены.', confirm: 'Удалить', danger: true });
    if (!ok) return;
    clearTimeout(timer.current);
    timer.current = undefined;
    try { if (created.current) await deleteJournal(latest.current); navigate('journal', { replace: true }); toast('Запись удалена'); } catch (e) { toastError(e); }
  }

  return (
    <Page title={existing || created.current ? 'Запись дневника' : 'Новая запись'} back="journal" sub="Сохраняется автоматически">
      <div className="space-y-4">
        <Field label="Дата и время"><input className="field" type="datetime-local" value={toLocalInput(draft.occurredAt)} onChange={(e) => e.target.value && change({ occurredAt: fromLocalInput(e.target.value) })} /></Field>
        <Field label="Место прогулки"><input className="field" value={draft.location} onChange={(e) => change({ location: e.target.value })} placeholder="Парк у дома, двор, набережная" /></Field>
        <Field label="Ситуация"><textarea className="field" value={draft.situation} onChange={(e) => change({ situation: e.target.value })} placeholder="Что произошло" /></Field>
        <div>
          <span className="mb-1.5 block px-1 text-[0.9rem] font-medium text-ink-2">Раздражитель</span>
          <div className="flex flex-wrap gap-2">{TRIGGERS.map((x) => <Chip key={x} active={draft.trigger === x} tone="merle" onClick={() => change({ trigger: draft.trigger === x ? '' : x })}>{x}</Chip>)}</div>
          <input className="field mt-2" value={TRIGGERS.includes(draft.trigger) ? '' : draft.trigger} onChange={(e) => change({ trigger: e.target.value })} placeholder="Или своё" aria-label="Свой раздражитель" />
        </div>
        <Field label="Реакция собаки"><input className="field" value={draft.reaction} onChange={(e) => change({ reaction: e.target.value })} placeholder="Лай, рывок, спокойно посмотрела…" /></Field>
        <Field label="Действия хозяина"><input className="field" value={draft.ownerAction} onChange={(e) => change({ ownerAction: e.target.value })} placeholder="Развернулись, увеличили дистанцию, наградил" /></Field>
        <div>
          <span className="mb-1.5 block px-1 text-[0.9rem] font-medium text-ink-2">Итог</span>
          <div className="flex gap-2">{OUTCOMES.map((o) => <Chip key={o.id} active={draft.outcome === o.id} tone={o.tone} onClick={() => change({ outcome: o.id })}>{o.label}</Chip>)}</div>
        </div>
        <Field label="Заметки"><textarea className="field" value={draft.notes} onChange={(e) => change({ notes: e.target.value })} /></Field>
        <div>
          <span className="mb-1.5 block px-1 text-[0.9rem] font-medium text-ink-2">Фото · до {MAX_PHOTOS}, уменьшаются для экономии места</span>
          <div className="flex flex-wrap gap-2">
            {draft.photoIds.map((pid) => (
              <div key={pid} className="relative">
                <PhotoThumb id={pid} alt="Фото к записи" className="h-24 w-24 rounded-2xl" />
                <button type="button" aria-label="Удалить фото" onClick={() => removePhoto(pid)} className="press absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-ink text-paper"><LuX size={16} aria-hidden /></button>
              </div>
            ))}
            {draft.photoIds.length < MAX_PHOTOS && (
              <label className="press flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl bg-surface text-[0.8rem] text-ink-2 ring-1 ring-inset ring-line">
                <LuCamera size={22} aria-hidden />Добавить
                <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
              </label>
            )}
          </div>
        </div>
        {(existing || created.current) && <Button variant="danger" full onClick={remove} icon={<LuTrash2 size={18} aria-hidden />}>Удалить запись</Button>}
        <Button variant="primary" full size="lg" onClick={async () => {
          clearTimeout(timer.current);
          timer.current = undefined;
          const d = latest.current;
          const empty = !created.current && !d.situation.trim() && !d.notes.trim() && !d.trigger && !d.reaction.trim() && !d.photoIds.length;
          if (empty) { navigate('journal', { replace: true }); return; }
          try { await saveJournal(d); created.current = true; toast('Запись сохранена'); navigate('journal', { replace: true }); } catch (e) { toastError(e); }
        }}>Готово</Button>
      </div>
    </Page>
  );
}
