import { useEffect } from 'react';
import { clsx } from 'clsx';
import { LuBookOpen, LuCalendarDays, LuChartLine, LuNotebookPen, LuSun } from 'react-icons/lu';
import { useApp, current } from './db/store';
import { applyTheme } from './db/repo';
import { navigate, useSegments } from './ui/router';
import { ConfirmHost, ToastHost } from './ui/dialogs';
import { Onboarding } from './screens/Onboarding';
import { TodayScreen } from './screens/Today';
import { TrainingScreen } from './screens/Training';
import { SummaryScreen } from './screens/Summary';
import { ProgramScreen } from './screens/Program';
import { DayScreen } from './screens/Day';
import { ExercisesScreen, ExerciseDetailScreen, CustomExerciseScreen } from './screens/Exercises';
import { ProgressScreen } from './screens/Progress';
import { ReportScreen } from './screens/Report';
import { JournalScreen, JournalEntryScreen } from './screens/Journal';
import { ProfileScreen } from './screens/Profile';
import { SettingsScreen } from './screens/Settings';
import { FreeTrainingScreen } from './screens/FreeTraining';

const TABS = [
  { id: 'today', label: 'Сегодня', Icon: LuSun },
  { id: 'program', label: 'Программа', Icon: LuCalendarDays },
  { id: 'exercises', label: 'Упражнения', Icon: LuBookOpen },
  { id: 'progress', label: 'Прогресс', Icon: LuChartLine },
  { id: 'journal', label: 'Дневник', Icon: LuNotebookPen },
] as const;

function TabBar({ active }: { active: string }) {
  return (
    <nav aria-label="Разделы" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 backdrop-blur-md">
      <ul className="mx-auto flex max-w-2xl">
        {TABS.map(({ id, label, Icon }) => {
          const on = active === id;
          return (
            <li key={id} className="flex-1">
              <a href={`#/${id}`} aria-current={on ? 'page' : undefined}
                className={clsx('press flex min-h-[3.6rem] flex-col items-center justify-center gap-0.5 pt-1 text-[0.7rem] font-medium', on ? 'text-sage' : 'text-ink-3')}>
                <Icon size={23} strokeWidth={on ? 2.4 : 2} aria-hidden />
                <span>{label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Splash() {
  return <div className="flex min-h-dvh items-center justify-center text-ink-3" role="status">Загрузка…</div>;
}

function StorageErrorScreen({ message }: { message: string }) {
  return (
    <div className="safe-x safe-top mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4">
      <h1 className="text-[1.5rem] font-bold">Хранилище недоступно</h1>
      <p className="text-ink-2">{message}</p>
      <p className="text-ink-2">Частые причины: частный режим Safari, переполненная память устройства или открытая вкладка со старой версией приложения.</p>
      <button className="press min-h-12 rounded-2xl bg-sage font-semibold text-sage-ink" onClick={() => location.reload()}>Попробовать снова</button>
    </div>
  );
}

function Routes() {
  const s = useApp();
  const seg = useSegments();
  const { dog } = current(s);
  const [a, b, c] = seg;

  if (!s.loaded) return <Splash />;
  if (s.error && !s.dogs.length) return <StorageErrorScreen message={s.error} />;
  if (!s.settings.onboarded || !dog) return <Onboarding />;

  let screen;
  let tab: string | null = a ?? 'today';
  switch (a) {
    case undefined: case 'today': screen = <TodayScreen />; break;
    case 'program': screen = b === 'day' && c ? <DayScreen date={c} /> : <ProgramScreen />; break;
    case 'exercises':
      if (b === 'new') screen = <CustomExerciseScreen />;
      else if (b && c === 'edit') screen = <CustomExerciseScreen id={b} />;
      else if (b) screen = <ExerciseDetailScreen id={b} />;
      else screen = <ExercisesScreen />;
      break;
    case 'progress': screen = <ProgressScreen />; break;
    case 'report': screen = <ReportScreen week={Number(b) || undefined} />; tab = 'progress'; break;
    case 'journal': screen = b ? <JournalEntryScreen id={b} /> : <JournalScreen />; break;
    case 'profile': screen = <ProfileScreen />; tab = null; break;
    case 'settings': screen = <SettingsScreen />; tab = null; break;
    case 'free': screen = <FreeTrainingScreen />; tab = 'today'; break;
    case 'train':
      if (!b) { screen = <TodayScreen />; break; }
      return c === 'summary' ? <SummaryScreen id={b} /> : <TrainingScreen id={b} />;
    default: screen = <TodayScreen />; tab = 'today';
  }
  return (
    <>
      {screen}
      {tab && <TabBar active={tab} />}
    </>
  );
}

export function App() {
  const s = useApp();
  useEffect(() => { if (s.loaded) applyTheme(s.settings.theme); }, [s.loaded, s.settings.theme]);
  useEffect(() => {
    // Старые ссылки без маршрута ведут на «Сегодня».
    if (!location.hash) navigate('today', { replace: true });
  }, []);
  return (
    <>
      <Routes />
      <ToastHost />
      <ConfirmHost />
    </>
  );
}
