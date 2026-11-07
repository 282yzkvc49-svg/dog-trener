// Первый запуск: приветствие → профиль → дата старта → время → методика → первый день.

import { useState } from 'react';
import { clsx } from 'clsx';
import { LuCamera, LuCheck, LuChevronLeft, LuHeartHandshake, LuShieldCheck, LuTimer, LuTrendingUp, LuPawPrint, LuUsers } from 'react-icons/lu';
import type { DogProfile } from '../domain/types';
import { defaultDog } from '../db/defaults';
import { completeOnboarding, savePhoto } from '../db/repo';
import { Button, Chip, Field } from '../ui/kit';
import { addDays, fmtDayLong, nextMonday, today, weekdayFull, weekday } from '../lib/date';
import { resizePhoto } from '../ui/photo';
import { toastError } from '../ui/dialogs';
import { navigate } from '../ui/router';
import { PhotoThumb } from '../ui/common';
import { isStandalone } from '../lib/pwa';
import { ImportBackup } from './ImportBackup';
import { JoinSheet } from './Cloud';

const STEPS = 6;

export function Onboarding() {
  const [step, setStep] = useState(1);
  const [dog, setDog] = useState<DogProfile>(() => defaultDog());
  const [ageMode, setAgeMode] = useState<'approx' | 'dob'>('approx');
  const [start, setStart] = useState(() => nextMonday());
  const [morning, setMorning] = useState('08:00');
  const [evening, setEvening] = useState('19:00');
  const [busy, setBusy] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const next = () => setStep((s) => Math.min(STEPS, s + 1));
  const prev = () => setStep((s) => Math.max(1, s - 1));

  async function addPhoto(file?: File) {
    if (!file) return;
    try {
      const { blob, width, height } = await resizePhoto(file);
      const id = await savePhoto(blob, width, height);
      setDog((d) => ({ ...d, photoId: id }));
    } catch (e) { toastError(e); }
  }

  async function finish() {
    setBusy(true);
    try {
      await completeOnboarding({ ...dog, name: dog.name.trim() }, start, morning, evening);
      navigate(start > today() ? 'program' : 'today', { replace: true });
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  }

  const restWd = weekday(addDays(start, 6));

  return (
    <div className="safe-top safe-x mx-auto flex min-h-dvh max-w-lg flex-col pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="flex h-14 items-center gap-2">
        {step > 1 && (
          <button type="button" aria-label="Назад" onClick={prev} className="press -ml-2 flex h-11 w-11 items-center justify-center rounded-full"><LuChevronLeft size={26} aria-hidden /></button>
        )}
        <div className="flex flex-1 gap-1.5" aria-label={`Шаг ${step} из ${STEPS}`} role="progressbar" aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={step}>
          {Array.from({ length: STEPS }, (_, i) => (
            <span key={i} className={clsx('h-1.5 flex-1 rounded-full transition-colors', i < step ? 'bg-sage' : 'bg-line')} />
          ))}
        </div>
      </div>

      <div key={step} className="anim-fade flex flex-1 flex-col">
        {step === 1 && (
          <div className="flex flex-1 flex-col justify-center">
            <span className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-[1.6rem] bg-sage text-sage-ink"><LuPawPrint size={42} aria-hidden /></span>
            <h1 className="text-[2.1rem] font-bold leading-[1.1] tracking-tight">Aussie Trainer</h1>
            <p className="mt-3 text-[1.1rem] text-ink-2">Двенадцать недель коротких тренировок на прогулке: свободный поводок, спокойствие рядом с собаками и людьми, отказ от подбора с земли.</p>
            <ul className="mt-8 space-y-4 text-ink">
              <li className="flex gap-3"><LuTimer className="mt-0.5 shrink-0 text-sage" size={22} aria-hidden /><span>15–20 минут в день: короткое утро и основное занятие вечером.</span></li>
              <li className="flex gap-3"><LuTrendingUp className="mt-0.5 shrink-0 text-sage" size={22} aria-hidden /><span>Каждая попытка записывается, сложность растёт только по результатам.</span></li>
              <li className="flex gap-3"><LuShieldCheck className="mt-0.5 shrink-0 text-sage" size={22} aria-hidden /><span>Всё хранится на этом телефоне и работает без интернета. Аккаунт нужен, только если тренируете вдвоём.</span></li>
            </ul>
            <div className="mt-8 grid gap-2">
              <Button full onClick={() => setJoinOpen(true)} icon={<LuUsers size={18} aria-hidden />}>Присоединиться к общей собаке</Button>
              <ImportBackup hasData={false} label="Восстановить из резервной копии" />
              <p className="px-1 text-[0.82rem] text-ink-3">Если собаку уже ведёт второй участник — присоединитесь по его коду. Если переносите данные со старого телефона — выберите файл копии.</p>
            </div>
            <JoinSheet open={joinOpen} onClose={() => setJoinOpen(false)} />
            {!isStandalone() && (
              <p className="mt-4 rounded-2xl bg-merle-soft p-4 text-[0.92rem]">
                Совет: сначала добавьте приложение на экран «Домой» — в Safari «Поделиться» → «На экран „Домой“» — и открывайте его с иконки. У установленного приложения своё хранилище, данные из вкладки Safari туда не переносятся.
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="pt-4">
            <h1 className="text-[1.7rem] font-bold tracking-tight">Ваша собака</h1>
            <p className="mt-1 text-ink-2">Данные из описания уже заполнены. Всё можно изменить позже в профиле.</p>
            <div className="mt-6 flex items-center gap-4">
              <label className="press relative flex h-24 w-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-sage-soft text-sage">
                {dog.photoId ? <PhotoThumb id={dog.photoId} alt="Фото собаки" className="h-full w-full" /> : <LuCamera size={30} aria-hidden />}
                <input type="file" accept="image/*" className="sr-only" aria-label="Добавить фото" onChange={(e) => addPhoto(e.target.files?.[0])} />
              </label>
              <Field label="Кличка" className="flex-1">
                <input className="field" value={dog.name} placeholder="Например, Луна" autoComplete="off" enterKeyHint="next"
                  onChange={(e) => setDog({ ...dog, name: e.target.value })} />
              </Field>
            </div>
            <div className="mt-5">
              <span className="mb-1.5 block px-1 text-[0.9rem] font-medium text-ink-2">Пол</span>
              <div className="flex gap-2">
                <Chip active={dog.sex === 'female'} onClick={() => setDog({ ...dog, sex: 'female' })}>Девочка</Chip>
                <Chip active={dog.sex === 'male'} onClick={() => setDog({ ...dog, sex: 'male' })}>Мальчик</Chip>
              </div>
            </div>
            <div className="mt-5">
              <span className="mb-1.5 block px-1 text-[0.9rem] font-medium text-ink-2">Возраст</span>
              <div className="mb-2 flex gap-2">
                <Chip active={ageMode === 'approx'} onClick={() => setAgeMode('approx')}>Примерно</Chip>
                <Chip active={ageMode === 'dob'} onClick={() => setAgeMode('dob')}>Дата рождения</Chip>
              </div>
              {ageMode === 'approx'
                ? <input className="field" aria-label="Примерный возраст" value={dog.approxAge ?? ''} onChange={(e) => setDog({ ...dog, approxAge: e.target.value })} />
                : <input className="field" type="date" aria-label="Дата рождения" max={today()} value={dog.dateOfBirth ?? ''} onChange={(e) => setDog({ ...dog, dateOfBirth: e.target.value || undefined })} />}
            </div>
            <div className="card mt-6 p-4 text-[0.95rem]">
              <p><span className="text-ink-2">Порода:</span> {dog.breed}</p>
              <p className="mt-1"><span className="text-ink-2">Знает:</span> {dog.knownCommands.join(', ')}</p>
              <p className="mt-1"><span className="text-ink-2">Работаем над:</span> {dog.problems.join('; ').toLowerCase()}</p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="pt-4">
            <h1 className="text-[1.7rem] font-bold tracking-tight">Когда начинаем?</h1>
            <p className="mt-1 text-ink-2">Курс идёт 12 недель. Каждый седьмой день — отдых. Если начать в понедельник, отдых выпадет на воскресенье.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Chip active={start === today()} onClick={() => setStart(today())}>Сегодня</Chip>
              <Chip active={start === addDays(today(), 1)} onClick={() => setStart(addDays(today(), 1))}>Завтра</Chip>
              <Chip active={start === nextMonday(addDays(today(), 1))} onClick={() => setStart(nextMonday(addDays(today(), 1)))}>С понедельника</Chip>
            </div>
            <Field label="Дата первого дня" className="mt-5">
              <input className="field" type="date" value={start} min={addDays(today(), -30)} onChange={(e) => e.target.value && setStart(e.target.value)} />
            </Field>
            <div className="card mt-5 p-4">
              <p className="font-semibold">Первый день: {fmtDayLong(start)}</p>
              <p className="mt-1 text-ink-2">Дни отдыха: {weekdayFull(restWd)}. Последний день курса — {fmtDayLong(addDays(start, 83))}.</p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="pt-4">
            <h1 className="text-[1.7rem] font-bold tracking-tight">Удобное время</h1>
            <p className="mt-1 text-ink-2">Приложение напомнит о тренировке, когда вы его откроете, и сможет выгрузить расписание в календарь телефона.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Field label="Утро · 5 минут"><input className="field" type="time" value={morning} onChange={(e) => setMorning(e.target.value || '08:00')} /></Field>
              <Field label="Вечер · 10–15 минут"><input className="field" type="time" value={evening} onChange={(e) => setEvening(e.target.value || '19:00')} /></Field>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="pt-4">
            <h1 className="text-[1.7rem] font-bold tracking-tight">Как мы тренируемся</h1>
            <ul className="mt-6 space-y-5">
              {[
                ['Только награда', 'Отмечаем правильное поведение словом «Да!» и сразу награждаем. Без рывков, строгих и электроошейников, без наказаний.'],
                ['Комфортная дистанция', 'Если собака лает, рвётся или замирает — отходим дальше. Никогда не подводим её ближе к тому, что пугает или возбуждает.'],
                ['Короткие подходы', 'Лучше три удачных повтора, чем десять через силу. Заканчиваем на успехе, пока собака хочет работать.'],
                ['Сложность по результатам', 'Новый уровень — после двух удачных сессий от 80%. Неделя курса сама по себе ничего не усложняет.'],
                ['Обнюхивание — можно', 'Обычная прогулка с запахами нужна собаке. Тренировка — это короткие блоки внутри неё.'],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <LuCheck className="mt-1 shrink-0 text-sage" size={20} aria-hidden />
                  <div><p className="font-semibold">{t}</p><p className="text-ink-2">{d}</p></div>
                </li>
              ))}
            </ul>
            <p className="mt-6 flex gap-3 rounded-2xl bg-amber-soft p-4 text-[0.92rem]">
              <LuHeartHandshake className="mt-0.5 shrink-0 text-amber" size={20} aria-hidden />
              <span>Приложение не заменяет ветеринара и специалиста по поведению. При выраженном страхе или агрессии обратитесь к кинологу, работающему без аверсивных методов.</span>
            </p>
          </div>
        )}

        {step === 6 && (
          <div className="flex flex-1 flex-col justify-center">
            <span className="anim-ring mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-sage text-sage-ink">
              <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden><path className="anim-draw" d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <h1 className="text-[1.9rem] font-bold leading-tight tracking-tight">Всё готово{dog.name.trim() ? `, ${dog.name.trim()}` : ''}!</h1>
            <p className="mt-3 text-[1.05rem] text-ink-2">
              {start > today()
                ? `Курс начнётся ${fmtDayLong(start)}. До этого можно посмотреть план и упражнения.`
                : 'Первый тренировочный день уже ждёт. Начните с утреннего контакта глазами — это займёт пять минут.'}
            </p>
            <p className="mt-6 rounded-2xl bg-surface-2 p-4 text-[0.92rem] text-ink-2">
              Данные хранятся только на этом устройстве. Раз в неделю сохраняйте резервную копию в «Настройках» — особенно перед сменой телефона или очисткой Safari.
            </p>
          </div>
        )}
      </div>

      <div className="pt-6">
        {step < STEPS
          ? <Button variant="primary" size="lg" full onClick={next}>{step === 1 ? 'Начать' : 'Дальше'}</Button>
          : <Button variant="primary" size="lg" full onClick={finish} disabled={busy}>{start > today() ? 'Открыть план' : 'Открыть первый день'}</Button>}
      </div>
    </div>
  );
}
