// Профиль собаки: все поля редактируются и сохраняются автоматически.

import { useEffect, useRef, useState } from 'react';
import { LuCamera, LuChevronRight, LuPlus, LuSettings, LuX } from 'react-icons/lu';
import type { DogProfile } from '../domain/types';
import { useApp, current } from '../db/store';
import { deletePhoto, saveBundle, saveDog, savePhoto } from '../db/repo';
import { changeStartDate } from '../domain/schedule';
import { Button, Chip, Field, Page, SectionTitle, Sheet } from '../ui/kit';
import { DogAvatar } from '../ui/common';
import { navigate } from '../ui/router';
import { confirmDialog, toast, toastError } from '../ui/dialogs';
import { ageText, fmtDayLong, isValidISO, today } from '../lib/date';
import { parseNum } from '../lib/util';
import { resizePhoto } from '../ui/photo';

function TagList({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [text, setText] = useState('');
  const add = () => { const v = text.trim(); if (v && !values.includes(v)) onChange([...values, v]); setText(''); };
  return (
    <div>
      <span className="mb-1.5 block px-1 text-[0.9rem] font-medium text-ink-2">{label}</span>
      <ul className="flex flex-wrap gap-2">
        {values.map((v) => (
          <li key={v} className="flex min-h-10 items-center gap-1 rounded-full bg-surface py-1 pl-3.5 pr-1 ring-1 ring-inset ring-line">
            <span className="text-[0.92rem]">{v}</span>
            <button type="button" aria-label={`Убрать: ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="press flex h-8 w-8 items-center justify-center rounded-full text-ink-3"><LuX size={15} aria-hidden /></button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <input className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={`Добавить: ${label}`} enterKeyHint="done"
          onKeyDown={(e: { key: string; preventDefault: () => void }) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <Button onClick={add} disabled={!text.trim()} label={`Добавить: ${label}`} icon={<LuPlus size={18} aria-hidden />}>{''}</Button>
      </div>
    </div>
  );
}

export function ProfileScreen() {
  const s = useApp();
  const { dog, program, days, sessions } = current(s);
  const [d, setD] = useState<DogProfile | undefined>(dog);
  const [startOpen, setStartOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(d);
  latest.current = d;
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); if (latest.current) saveDog(latest.current).catch(() => {}); } }, []);
  if (!d) return <Page title="Профиль" back="today"><p className="text-ink-2">Профиль не найден.</p></Page>;

  function change(p: Partial<DogProfile>) {
    const next = { ...latest.current!, ...p };
    setD(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = undefined; saveDog(latest.current!).catch(toastError); }, 400);
  }

  async function photo(file?: File) {
    if (!file) return;
    try {
      const { blob, width, height } = await resizePhoto(file);
      const old = latest.current?.photoId;
      const id = await savePhoto(blob, width, height);
      change({ photoId: id });
      if (old) deletePhoto(old).catch(() => {});
    } catch (e) { toastError(e); }
  }

  const age = ageText(d.dateOfBirth, d.approxAge);

  return (
    <Page title="Профиль собаки" back="today" right={<Button size="sm" variant="ghost" onClick={() => navigate('settings')} icon={<LuSettings size={18} aria-hidden />}>Настройки</Button>}>
      <div className="flex items-center gap-4">
        <label className="press relative cursor-pointer rounded-full" aria-label="Изменить фото">
          <DogAvatar dog={d} size={96} />
          <span className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-sage text-sage-ink shadow-card"><LuCamera size={18} aria-hidden /></span>
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => { photo(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <div className="min-w-0">
          <p className="truncate text-[1.4rem] font-bold">{d.name || 'Без клички'}</p>
          <p className="text-ink-2">{d.breed}{age ? `, ${age}` : ''}</p>
          <p className="text-[0.82rem] text-ink-3">Изменения сохраняются автоматически</p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <Field label="Кличка"><input className="field" value={d.name} onChange={(e) => change({ name: e.target.value })} /></Field>
        <Field label="Порода"><input className="field" value={d.breed} onChange={(e) => change({ breed: e.target.value })} /></Field>
        <div>
          <span className="mb-1.5 block px-1 text-[0.9rem] font-medium text-ink-2">Пол</span>
          <div className="flex gap-2">
            <Chip active={d.sex === 'female'} onClick={() => change({ sex: 'female' })}>Девочка</Chip>
            <Chip active={d.sex === 'male'} onClick={() => change({ sex: 'male' })}>Мальчик</Chip>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Дата рождения"><input className="field" type="date" max={today()} value={d.dateOfBirth ?? ''} onChange={(e) => change({ dateOfBirth: e.target.value || undefined })} /></Field>
          <Field label="Или примерный возраст"><input className="field" value={d.approxAge ?? ''} onChange={(e) => change({ approxAge: e.target.value })} placeholder="1 год 3 месяца" /></Field>
        </div>
        <Field label="Вес, кг (по желанию)"><input className="field" inputMode="decimal" value={d.weightKg ?? ''} onChange={(e) => change({ weightKg: parseNum(e.target.value) })} placeholder="Например, 18,5" /></Field>
        <TagList label="Уже знает команды" values={d.knownCommands} onChange={(v) => change({ knownCommands: v })} placeholder="Новая команда" />
        <TagList label="Основные поведенческие проблемы" values={d.problems} onChange={(v) => change({ problems: v })} placeholder="Добавить проблему" />
        <TagList label="Цели" values={d.goals} onChange={(v) => change({ goals: v })} placeholder="Добавить цель" />
        <TagList label="Предпочитаемые награды" values={d.rewards} onChange={(v) => change({ rewards: v })} placeholder="Например, сыр, мяч" />
        <Field label="Особенности и ограничения" hint="Здоровье, страхи, аллергии на лакомства — попадёт в отчёт для ИИ"><textarea className="field" value={d.notes} onChange={(e) => change({ notes: e.target.value })} /></Field>
      </div>

      {program && (
        <>
          <SectionTitle>Программа</SectionTitle>
          <button type="button" className="card press flex w-full items-center gap-3 p-4 text-left" onClick={() => setStartOpen(true)}>
            <span className="flex-1"><span className="block text-[0.85rem] text-ink-2">Дата начала программы</span><span className="block font-semibold">{fmtDayLong(program.startDate)}</span></span>
            <LuChevronRight className="text-ink-3" size={18} aria-hidden />
          </button>
        </>
      )}
      {startOpen && program && <StartDateSheet onClose={() => setStartOpen(false)} onSave={async (date) => {
        const done = sessions.some((x) => x.status !== 'planned');
        if (done) {
          const ok = await confirmDialog({ title: 'Сдвинуть программу?', text: 'Уже выполненные и отмеченные занятия останутся на своих датах в истории. Сдвинутся только несделанные дни.', confirm: 'Сдвинуть' });
          if (!ok) return;
        }
        try { await saveBundle(changeStartDate({ program, days, sessions }, date)); toast('Дата старта изменена'); setStartOpen(false); } catch (e) { toastError(e); }
      }} current={program.startDate} />}
    </Page>
  );
}

function StartDateSheet({ current: cur, onClose, onSave }: { current: string; onClose: () => void; onSave: (d: string) => void }) {
  const [date, setDate] = useState(cur);
  return (
    <Sheet open onClose={onClose} title="Дата начала программы" footer={<Button variant="primary" size="lg" full disabled={!isValidISO(date) || date === cur} onClick={() => onSave(date)}>Сохранить</Button>}>
      <Field label="Первый день курса"><input className="field" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
      <p className="mt-3 text-[0.9rem] text-ink-2">Весь несделанный план сдвинется вместе с датой старта. Каждый седьмой день курса — отдых.</p>
    </Sheet>
  );
}
