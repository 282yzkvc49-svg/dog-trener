// Настройки: тема, время и дни занятий, напоминания, календарь (ICS), резервные копии, удаление данных.

import { useEffect, useState } from 'react';
import { LuCalendarPlus, LuCirclePause, LuCirclePlay, LuDownload, LuFileSpreadsheet, LuShieldCheck, LuTrash2, LuUser } from 'react-icons/lu';
import { useApp, current } from '../db/store';
import { APP_VERSION, exportBackup, markBackupDone, saveBundle, saveSettings, wipeAll } from '../db/repo';
import { ImportBackup } from './ImportBackup';
import { DB_VERSION } from '../db/idb';
import { pauseProgram, resumeProgram } from '../domain/schedule';
import { buildCsv, buildIcs, buildReportReminderIcs } from '../domain/exporters';
import { fmtDateTime, fmtDay, today, weekdayShort } from '../lib/date';
import { Button, Chip, Field, Page, SectionTitle, Segmented, Toggle } from '../ui/kit';
import { navigate } from '../ui/router';
import { shareFile, stamp } from '../ui/share';
import { confirmDialog, toast, toastError } from '../ui/dialogs';
import { applyUpdate, isStandalone, useUpdateAvailable } from '../lib/pwa';

export function SettingsScreen() {
  const s = useApp();
  const { program, days, sessions } = current(s);
  const st = s.settings;
  const update = useUpdateAvailable();
  const [busy, setBusy] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string>('');

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {});
    navigator.storage?.estimate?.().then((e) => { if (e.usage) setUsage(`${(e.usage / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`); }).catch(() => {});
  }, []);

  const set = (p: Parameters<typeof saveSettings>[0]) => saveSettings(p).catch(toastError);

  async function exportJson() {
    setBusy(true);
    try {
      const b = await exportBackup(st.exportPreferences.includePhotos);
      const r = await shareFile(`aussie-trainer-kopiya-${stamp()}.json`, JSON.stringify(b), 'application/json');
      if (r !== 'cancelled') { await markBackupDone(); toast('Резервная копия сохранена'); }
    } catch (e) { toastError(e); }
    setBusy(false);
  }

  async function wipe() {
    const ok = await confirmDialog({ title: 'Удалить все данные?', text: 'Профиль, программа, тренировки, дневник и фото будут удалены с этого устройства без возможности восстановления.', confirm: 'Удалить всё', danger: true, requireText: 'УДАЛИТЬ' });
    if (!ok) return;
    try { await wipeAll(); navigate('today', { replace: true }); toast('Все данные удалены'); } catch (e) { toastError(e); }
  }

  async function ics() {
    try {
      const text = buildIcs(sessions, { morning: st.morningTrainingTime, evening: st.eveningTrainingTime, trainingDays: st.trainingDays, from: today() });
      const r = await shareFile(`aussie-trainer-raspisanie-${stamp()}.ics`, text, 'text/calendar');
      if (r !== 'cancelled') toast('Расписание выгружено. Откройте файл, чтобы добавить события в календарь.');
    } catch (e) { toastError(e); }
  }

  async function icsReports() {
    const restDates = days.filter((d) => d.dayInWeek === 7 && d.date >= today()).map((d) => d.date);
    if (!restDates.length) { toast('В курсе не осталось дней для отчёта', 'info'); return; }
    try {
      const r = await shareFile(`aussie-trainer-otchety-${stamp()}.ics`, buildReportReminderIcs(restDates, st.eveningTrainingTime), 'text/calendar');
      if (r !== 'cancelled') toast('Напоминания об отчётах выгружены');
    } catch (e) { toastError(e); }
  }

  async function csv() {
    try {
      const r = await shareFile(`aussie-trainer-statistika-${stamp()}.csv`, buildCsv(s.results, s.trainings), 'text/csv');
      if (r !== 'cancelled') toast('Статистика выгружена в CSV');
    } catch (e) { toastError(e); }
  }

  async function togglePause() {
    if (!program) return;
    try {
      if (program.status === 'paused') { await saveBundle(resumeProgram({ program, days, sessions }, today())); toast('Курс продолжен'); }
      else { await saveBundle({ program: pauseProgram(program, today()), days, sessions }); toast('Курс на паузе'); }
    } catch (e) { toastError(e); }
  }

  const toggleDay = (wd: number) => set({ trainingDays: st.trainingDays.includes(wd) ? st.trainingDays.filter((x) => x !== wd) : [...st.trainingDays, wd].sort() });

  return (
    <Page title="Настройки" back="today" right={<Button size="sm" variant="ghost" onClick={() => navigate('profile')} icon={<LuUser size={18} aria-hidden />}>Профиль</Button>}>
      {update && (
        <div className="card mb-3 flex items-center gap-3 p-4">
          <p className="flex-1">Доступна новая версия. Данные сохранятся.</p>
          <Button variant="primary" size="sm" onClick={applyUpdate}>Обновить</Button>
        </div>
      )}

      <SectionTitle className="mt-2">Оформление</SectionTitle>
      <Segmented label="Тема" value={st.theme} onChange={(v) => set({ theme: v })} options={[{ id: 'system', label: 'Как в системе' }, { id: 'light', label: 'Светлая' }, { id: 'dark', label: 'Тёмная' }]} />
      <p className="mt-2 px-1 text-[0.82rem] text-ink-3">Размер текста следует системной настройке iPhone («Экран и яркость» → «Размер текста»).</p>

      <SectionTitle>Тренировки и напоминания</SectionTitle>
      <section className="card p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Утренняя"><input className="field" type="time" value={st.morningTrainingTime} onChange={(e) => e.target.value && set({ morningTrainingTime: e.target.value })} /></Field>
          <Field label="Вечерняя"><input className="field" type="time" value={st.eveningTrainingTime} onChange={(e) => e.target.value && set({ eveningTrainingTime: e.target.value })} /></Field>
        </div>
        <span className="mb-1.5 mt-4 block px-1 text-[0.9rem] font-medium text-ink-2">Дни занятий для напоминаний и календаря</span>
        <div className="flex flex-wrap gap-2">{[1, 2, 3, 4, 5, 6, 0].map((wd) => <Chip key={wd} active={st.trainingDays.includes(wd)} onClick={() => toggleDay(wd)}>{weekdayShort(wd)}</Chip>)}</div>
        <div className="mt-2 divide-y divide-line">
          <Toggle checked={st.weeklyReportReminder} onChange={(v) => set({ weeklyReportReminder: v })} label="Напоминать о недельном отчёте" hint="В день отдыха на главном экране появится кнопка отчёта" />
          <Toggle checked={st.countTensions} onChange={(v) => set({ countTensions: v })} label="Учитывать натяжения поводка" hint="Счётчик на экране свободного поводка для графика натяжений" />
        </div>
        <p className="mt-3 rounded-xl bg-surface-2 p-3 text-[0.88rem] text-ink-2">
          Напоминания показываются внутри приложения: на главном экране видно, когда следующая тренировка и что её время наступило. Фоновые уведомления при закрытом приложении в этой версии не работают — для надёжных напоминаний добавьте расписание в календарь телефона.
        </p>
        <div className="mt-3 grid gap-2">
          <Button full onClick={ics} icon={<LuCalendarPlus size={18} aria-hidden />}>Добавить расписание в календарь (.ics)</Button>
          {st.weeklyReportReminder && <Button full onClick={icsReports} icon={<LuCalendarPlus size={18} aria-hidden />}>Напоминания об отчётах в календарь</Button>}
        </div>
      </section>

      {program && (
        <>
          <SectionTitle>Курс</SectionTitle>
          <section className="card p-4">
            <p><span className="text-ink-2">Начало: </span>{fmtDay(program.startDate)} · <button className="font-semibold text-merle underline-offset-2 hover:underline" onClick={() => navigate('profile')}>изменить</button></p>
            <p className="mt-1"><span className="text-ink-2">Статус: </span>{program.status === 'paused' ? `на паузе с ${fmtDay(program.pausedAt!)}` : 'идёт'}</p>
            {program.pauses.length > 0 && <p className="mt-1 text-[0.88rem] text-ink-2">Паузы: {program.pauses.map((p) => `${fmtDay(p.from)} – ${p.to ? fmtDay(p.to) : '…'}`).join(', ')}</p>}
            <Button className="mt-3" onClick={togglePause} icon={program.status === 'paused' ? <LuCirclePlay size={18} aria-hidden /> : <LuCirclePause size={18} aria-hidden />}>
              {program.status === 'paused' ? 'Продолжить курс' : 'Поставить на паузу'}
            </Button>
          </section>
        </>
      )}

      <SectionTitle>Резервная копия</SectionTitle>
      <section className="card p-4">
        <p className="rounded-xl bg-amber-soft p-3 text-[0.9rem]">
          Все данные хранятся только в браузере этого устройства. Их можно потерять при удалении иконки, очистке данных Safari или смене телефона. Сохраняйте копию в «Файлы» раз в неделю.
        </p>
        <p className="mt-3 text-[0.92rem]"><span className="text-ink-2">Последняя копия: </span>{st.lastBackupAt ? fmtDateTime(st.lastBackupAt) : 'ещё не сохранялась'}</p>
        <div className="mt-1 divide-y divide-line">
          <Toggle checked={st.exportPreferences.includePhotos} onChange={(v) => set({ exportPreferences: { ...st.exportPreferences, includePhotos: v } })} label="Включать фото" hint="Файл станет больше" />
        </div>
        <div className="mt-2 grid gap-2">
          <Button variant="primary" full disabled={busy} onClick={exportJson} icon={<LuDownload size={18} aria-hidden />}>Сохранить резервную копию</Button>
<ImportBackup hasData />
          <Button full onClick={csv} icon={<LuFileSpreadsheet size={18} aria-hidden />}>Экспорт статистики в CSV</Button>
        </div>
      </section>

      <SectionTitle>Хранилище</SectionTitle>
      <section className="card p-4 text-[0.92rem]">
        <p><span className="text-ink-2">Установлено на экран «Домой»: </span>{isStandalone() ? 'да' : 'нет — открыто во вкладке браузера'}</p>
        <p className="mt-1"><span className="text-ink-2">Постоянное хранилище: </span>{persisted === null ? 'неизвестно' : persisted ? 'разрешено' : 'не гарантировано системой'}</p>
        {usage && <p className="mt-1"><span className="text-ink-2">Занято: </span>{usage}</p>}
        <Button variant="danger" full className="mt-4" onClick={wipe} icon={<LuTrash2 size={18} aria-hidden />}>Удалить все данные</Button>
      </section>

      <SectionTitle>О приложении</SectionTitle>
      <section className="card p-4 text-[0.92rem]">
        <p className="flex gap-2"><LuShieldCheck className="mt-0.5 shrink-0 text-sage" size={18} aria-hidden />Методики построены только на положительном подкреплении. Приложение не заменяет ветеринара и специалиста по поведению. При выраженном страхе, агрессии или частых опасных реакциях обратитесь к специалисту, работающему без аверсивных методов. При подозрении на проглатывание токсичного вещества — сразу к ветеринару.</p>
        <p className="mt-3 text-ink-2">Фоновые push-уведомления запланированы как отдельная функция: для них нужен сервер и согласие на уведомления.</p>
        <p className="mt-3 text-ink-3">Aussie Trainer {APP_VERSION} · схема данных {DB_VERSION}</p>
      </section>

    </Page>
  );
}
