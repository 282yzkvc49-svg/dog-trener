import { useMemo, useState } from 'react';
import { LuBell, LuChartLine, LuCirclePlay, LuCoffee, LuDownload, LuLightbulb, LuPlay, LuSettings, LuSparkles, LuX } from 'react-icons/lu';
import { useApp, current } from '../db/store';
import { buildDateIndex, coursePosition, effectiveStatus, resumeProgram, viewForDate } from '../domain/schedule';
import { addDays, fmtDay, fmtDayLong, minutesOf, pl, today } from '../lib/date';
import { Button, Card, IconButton, ProgressRing, SectionTitle } from '../ui/kit';
import { DogAvatar, greeting, useNow } from '../ui/common';
import { navigate } from '../ui/router';
import { SessionCard } from './SessionCard';
import { StartSheet } from './StartSheet';
import { SyncBadge } from './Cloud';
import { WEEKS, GENERAL_TIPS } from '../content/program';
import { describeItem, ex } from '../domain/plan';
import { saveBundle, saveSettings } from '../db/repo';
import { toast, toastError } from '../ui/dialogs';
import { isStandalone, useUpdateAvailable, applyUpdate } from '../lib/pwa';
import type { ScheduledSession } from '../domain/types';

export function TodayScreen() {
  const s = useApp();
  const { dog, program, days, sessions } = current(s);
  const now = useNow();
  const t = today(now);
  const [start, setStart] = useState<ScheduledSession | null>(null);
  const update = useUpdateAvailable();

  const idx = useMemo(() => buildDateIndex(days, sessions), [days, sessions]);
  const view = viewForDate(t, idx, t, program);
  const pos = coursePosition(t, days);
  const active = s.trainings.filter((x) => x.status === 'active').sort((a, b) => b.startedAt - a.startedAt)[0];
  const week = view.day?.week ?? pos.day?.week;
  const weekInfo = week ? WEEKS[week - 1] : undefined;
  const paused = program?.status === 'paused';

  // Прогресс недели: выполненные тренировочные дни из запланированных (дни отдыха не считаются).
  const weekDays = week ? days.filter((d) => d.week === week && d.kind === 'training' && !d.madeRest) : [];
  const weekDone = weekDays.reduce((sum, d) => {
    const v = viewForDate(d.date, idx, t, program);
    return sum + (v.status === 'done' ? 1 : v.status === 'partial' ? 0.5 : 0);
  }, 0);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const timeOf = (x: ScheduledSession) => (x.timeOfDay === 'morning' ? s.settings.morningTrainingTime : s.settings.eveningTrainingTime);
  const todaySessions = paused ? [] : view.sessions;
  const required = todaySessions.filter((x) => !x.optional);
  const optional = todaySessions.filter((x) => x.optional);

  const nextUp = useMemo(() => {
    const list = sessions.filter((x) => x.status === 'planned' && !x.optional && x.plannedDate > t).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || (a.timeOfDay === b.timeOfDay ? 0 : a.timeOfDay === 'morning' ? -1 : 1));
    return list[0];
  }, [sessions, t]);

  const completedCount = s.trainings.filter((x) => x.status === 'completed').length;
  const backupStale = completedCount >= 3 && (!s.settings.lastBackupAt || Date.now() - s.settings.lastBackupAt > 14 * 86400000);
  const showInstall = !isStandalone() && !s.settings.installHintHidden;
  const tip = view.day?.tip ?? GENERAL_TIPS[now.getDate() % GENERAL_TIPS.length];
  const isRestDay = view.status === 'rest' || (view.day && (view.day.kind === 'rest' || view.day.madeRest));

  async function resume() {
    if (!program) return;
    try {
      await saveBundle(resumeProgram({ program, days, sessions }, t));
      toast('Курс продолжен. План сдвинут на время паузы.');
    } catch (e) { toastError(e); }
  }

  function reminder(x: ScheduledSession) {
    if (effectiveStatus(x, t) !== 'planned' || x.plannedDate !== t) return null;
    if (!s.settings.trainingDays.includes(now.getDay())) return null;
    const at = minutesOf(timeOf(x));
    const diff = at - nowMin;
    if (diff > 0 && diff <= 180) return <p className="mx-4 mt-3 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[0.88rem] text-ink-2"><LuBell size={16} aria-hidden />Через {diff >= 60 ? `${Math.floor(diff / 60)} ч ${diff % 60} мин` : pl(diff, ['минуту', 'минуты', 'минут'])}</p>;
    if (diff <= 0) return <p className="mx-4 mt-3 flex items-center gap-2 rounded-xl bg-merle-soft px-3 py-2 text-[0.88rem] font-medium text-merle"><LuBell size={16} aria-hidden />Время тренировки</p>;
    return null;
  }

  return (
    <div className="pb-28">
      <header className="safe-top safe-x mx-auto flex max-w-2xl items-center gap-3 pb-2 pt-4">
        <button type="button" onClick={() => navigate('profile')} aria-label="Профиль собаки" className="press rounded-full"><DogAvatar dog={dog} size={52} /></button>
        <div className="min-w-0 flex-1">
          <p className="text-[0.9rem] text-ink-2">{greeting(now)}</p>
          <h1 className="truncate text-[1.5rem] font-bold leading-tight tracking-tight">{dog?.name || 'Ваша аусси'}</h1>
        </div>
        <SyncBadge />
        <IconButton label="Настройки" onClick={() => navigate('settings')}><LuSettings size={24} aria-hidden /></IconButton>
      </header>

      <main className="safe-x mx-auto max-w-2xl space-y-3">
        {update && (
          <div className="card flex items-center gap-3 p-4">
            <LuSparkles className="shrink-0 text-sage" size={22} aria-hidden />
            <p className="flex-1 text-[0.95rem]">Доступна новая версия приложения. Данные сохранятся.</p>
            <Button variant="primary" size="sm" onClick={applyUpdate}>Обновить</Button>
          </div>
        )}
        {showInstall && (
          <div className="card flex items-start gap-3 p-4">
            <p className="flex-1 text-[0.92rem] text-ink-2">Чтобы открыть с иконки: в Safari «Поделиться» → «На экран „Домой“». У установленного приложения своё хранилище — данные из вкладки туда не переходят.</p>
            <IconButton label="Скрыть подсказку" onClick={() => saveSettings({ installHintHidden: true })}><LuX size={18} aria-hidden /></IconButton>
          </div>
        )}

        {active && (
          <div className="card border-l-4 border-sage p-4">
            <p className="font-semibold">{active.trainedBy && active.trainedBy !== s.settings.ownerName ? `Идёт тренировка — проводит ${active.trainedBy}` : 'Незавершённая тренировка'}</p>
            <p className="text-[0.92rem] text-ink-2">«{active.title}», упражнение {Math.min(active.currentIndex + 1, active.items.length)} из {active.items.length}. Всё сохранено.</p>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" onClick={() => navigate(`train/${active.id}`)} icon={<LuPlay size={18} aria-hidden />}>Продолжить</Button>
              <Button onClick={() => navigate(`train/${active.id}/summary`)}>Завершить</Button>
            </div>
          </div>
        )}

        {/* Статус курса */}
        {pos.state === 'none' && <Card className="p-5"><p className="font-semibold">Программа не создана</p></Card>}
        {pos.state === 'before' && pos.first && (
          <Card className="p-5">
            <p className="text-[0.9rem] text-ink-2">До старта курса {pl(Math.max(1, Math.round((new Date(pos.first.date + 'T12:00').getTime() - new Date(t + 'T12:00').getTime()) / 86400000)), ['день', 'дня', 'дней'])}</p>
            <p className="mt-1 text-[1.25rem] font-semibold">Курс начнётся {fmtDayLong(pos.first.date)}</p>
            <p className="mt-2 text-ink-2">Пока можно посмотреть план и упражнения или провести свободную тренировку.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => navigate('program')}>Посмотреть план</Button>
              <Button onClick={() => navigate('free')}>Свободная тренировка</Button>
            </div>
          </Card>
        )}
        {pos.state === 'after' && (
          <Card className="p-5">
            <p className="text-[1.25rem] font-semibold">Курс из 12 недель завершён</p>
            <p className="mt-2 text-ink-2">Навыки держатся, пока их используют. Продолжайте 3–4 короткие тренировки в неделю: выберите упражнения в свободной тренировке.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => navigate('free')} icon={<LuCirclePlay size={18} aria-hidden />}>Свободная тренировка</Button>
              <Button onClick={() => navigate('report/12')}>Итоговый отчёт</Button>
            </div>
          </Card>
        )}
        {pos.state === 'during' && week && (
          <Card className="flex items-center gap-4 p-5" onClick={() => navigate('program')} label="Открыть программу">
            <ProgressRing value={weekDays.length ? weekDone / weekDays.length : 0} size={68} label={`Прогресс недели: ${Math.round(weekDays.length ? (weekDone / weekDays.length) * 100 : 0)}%`}>
              <span className="num text-[1.05rem] font-semibold">{Math.round(weekDone * 10) / 10}<span className="text-ink-3">/{weekDays.length}</span></span>
            </ProgressRing>
            <div className="min-w-0 flex-1">
              <p className="num text-[1.2rem] font-semibold leading-tight">Неделя {week} · День {view.day?.dayNumber ?? pos.day?.dayNumber}</p>
              <p className="mt-0.5 text-[0.95rem] text-ink-2">{weekInfo?.title}{view.day && view.day.title !== weekInfo?.title ? `: ${view.day.title.toLowerCase()}` : ''}</p>
              {view.day?.goal && <p className="mt-1 text-[0.85rem] text-ink-3">Цель дня: {view.day.goal}</p>}
            </div>
          </Card>
        )}

        {paused && (
          <Card className="p-5">
            <p className="text-[1.15rem] font-semibold">Курс на паузе{program?.pausedAt ? ` с ${fmtDay(program.pausedAt)}` : ''}</p>
            <p className="mt-1 text-ink-2">Пропущенные дни не превратятся в долг: после продолжения план сдвинется на время паузы.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={resume}>Продолжить курс</Button>
              <Button onClick={() => navigate('free')}>Свободная тренировка</Button>
            </div>
          </Card>
        )}

        {/* Тренировки дня */}
        {!paused && pos.state === 'during' && (
          <>
            {isRestDay && !required.length && (
              <Card className="p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-copper-soft text-copper"><LuCoffee size={22} aria-hidden /></span>
                  <p className="text-[1.15rem] font-semibold">День отдыха</p>
                </div>
                <p className="mt-3 text-ink-2">{view.day?.restNote ?? 'Обычная прогулка с обнюхиванием. Обязательных упражнений нет — это не пропуск.'}</p>
                {view.day?.analysis && s.settings.weeklyReportReminder && (
                  <Button className="mt-4" variant="soft" onClick={() => navigate(`report/${view.day!.week}`)} icon={<LuChartLine size={18} aria-hidden />}>
                    {view.day.analysis === 'two-weeks' ? 'Отчёт за две недели' : view.day.analysis === 'final' ? 'Итоговый отчёт' : 'Недельный отчёт'}
                  </Button>
                )}
              </Card>
            )}
            {view.movedOut.length > 0 && (
              <p className="px-1 text-[0.9rem] text-ink-2">{view.movedOut.map((m) => `${m.timeOfDay === 'morning' ? 'Утренняя' : 'Вечерняя'} тренировка перенесена на ${fmtDay(m.plannedDate)}.`).join(' ')}</p>
            )}
            {[...required, ...optional].map((x) => {
              const st = effectiveStatus(x, t);
              const running = active && active.scheduledSessionId === x.id;
              return (
                <SessionCard key={x.id} s={x} dogId={dog!.id} todayISO={t} time={timeOf(x)} reminder={reminder(x)}
                  actions={
                    running
                      ? <Button variant="primary" size="lg" full onClick={() => navigate(`train/${active!.id}`)} icon={<LuPlay size={20} aria-hidden />}>Продолжить тренировку</Button>
                      : st === 'done'
                      ? <Button onClick={() => setStart(x)}>Повторить</Button>
                      : <Button variant="primary" size="lg" full onClick={() => setStart(x)} disabled={!x.items.length} icon={<LuPlay size={20} aria-hidden />}>
                          {st === 'partial' ? 'Продолжить тренировку' : 'Начать тренировку'}
                        </Button>
                  } />
              );
            })}
            {!required.length && !optional.length && !isRestDay && (
              <Card className="p-5"><p className="text-ink-2">На сегодня занятий нет.</p></Card>
            )}
          </>
        )}

        {tip && (
          <div className="flex gap-3 rounded-[1.25rem] bg-sage-soft p-4">
            <LuLightbulb className="mt-0.5 shrink-0 text-sage" size={22} aria-hidden />
            <div><p className="text-[0.85rem] font-semibold text-sage">Совет кинолога</p><p className="mt-0.5 text-[0.95rem]">{tip}</p></div>
          </div>
        )}

        {backupStale && (
          <Card className="flex items-center gap-3 p-4" onClick={() => navigate('settings')} label="Открыть резервное копирование">
            <LuDownload className="shrink-0 text-amber" size={22} aria-hidden />
            <p className="flex-1 text-[0.92rem]">{s.settings.lastBackupAt ? `Последняя резервная копия — ${fmtDay(new Date(s.settings.lastBackupAt).toISOString().slice(0, 10))}.` : 'Резервной копии ещё нет.'} Данные хранятся только на телефоне — сохраните копию в «Файлы».</p>
          </Card>
        )}

        {nextUp && !paused && (
          <>
            <SectionTitle>Дальше по плану</SectionTitle>
            <Card className="p-4" onClick={() => navigate(`program/day/${nextUp.plannedDate}`)} label="Открыть следующий день">
              <p className="font-semibold">{nextUp.plannedDate === addDays(t, 1) ? 'Завтра' : fmtDayLong(nextUp.plannedDate)}, {nextUp.timeOfDay === 'morning' ? s.settings.morningTrainingTime : s.settings.eveningTrainingTime}</p>
              <p className="mt-1 text-[0.92rem] text-ink-2">{nextUp.items.map((i) => `${ex(i.exerciseId).title} — ${describeItem(i)}`).join('; ')}</p>
            </Card>
          </>
        )}

        <div className="flex gap-2 pt-2">
          <Button full onClick={() => navigate('free')} icon={<LuCirclePlay size={18} aria-hidden />}>Свободная тренировка</Button>
          <Button full onClick={() => navigate('journal')}>Записать в дневник</Button>
        </div>
      </main>

      {start && dog && (
        <StartSheet open={!!start} onClose={() => setStart(null)} dogId={dog.id} scheduled={start} title={start.title ?? 'Тренировка'} items={start.items} timeOfDay={start.timeOfDay} />
      )}
    </div>
  );
}
