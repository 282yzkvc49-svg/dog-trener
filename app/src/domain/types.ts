// Модель данных Aussie Trainer. Все сущности имеют стабильные строковые id.

export type ISODate = string; // 'YYYY-MM-DD' в местном времени
export type TimeOfDay = 'morning' | 'evening';
/** Направление работы: три главные проблемы и общие навыки. */
export type Problem = 'leash' | 'distractions' | 'pickup' | 'general';
export type Category =
  | 'Внимание' | 'Поводок' | 'Отвлечения' | 'Подбор с земли' | 'Самоконтроль' | 'Подзыв' | 'Интеллект' | 'Расслабление';
/**
 * attempts — отдельные попытки (успех / не получилось);
 * segments — отрезки ходьбы (засчитывается отрезок, а не шаги);
 * observations — наблюдения за раздражителями (дистанция, реакция, переключение);
 * duration — выдержка по времени (секунды на повтор).
 */
export type Measurement = 'attempts' | 'segments' | 'observations' | 'duration';
/** Сложность обстановки: 1 дом, 2 тихое место, 3 умеренные отвлечения, 4 сильные отвлечения. */
export type Environment = 1 | 2 | 3 | 4;
export type Mood = 'calm' | 'slightly' | 'very' | 'tired';
export type Trigger = 'dog' | 'person' | 'other';

export interface ExerciseLevel {
  n: number;
  title: string;
  /** Что именно меняется по сравнению с предыдущим уровнем — один параметр. */
  changes: string;
  steps: string[];
  /** Для выдержки: целевые секунды на этом уровне. */
  seconds?: number;
  /** Для отрезков: рекомендуемая длина в шагах. */
  steps_hint?: [number, number];
}

export interface Exercise {
  id: string;
  title: string;
  category: Category;
  problem: Problem;
  goal: string;
  difficulty: 1 | 2 | 3;
  durationMin: number;
  equipment: string[];
  steps: string[];
  mistakes: string[];
  stressSigns: string[];
  successCriterion: string;
  progression: string;
  simplify: string;
  harder: string;
  measurement: Measurement;
  /** Склонение единицы: [1, 2–4, 5+], например ['попытка','попытки','попыток']. */
  unit: [string, string, string];
  successLabel: string;
  failLabel: string;
  levels: ExerciseLevel[];
  safety?: string[];
  /** Оценочное время на одну единицу, минут (для расчёта длительности занятия). */
  perUnitMin: number;
  /** Минимум оцениваемых попыток в сессии, чтобы засчитывать её для перехода на уровень. */
  minEvaluated: number;
  custom?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

/** Пункт плана занятия. */
export interface PlanItem {
  uid: string;
  exerciseId: string;
  target: number;
  /** «до N» — максимум, а не обязательное количество (наблюдения). */
  upTo?: boolean;
  /** Длина отрезка в шагах для упражнений на ходьбу. */
  steps?: number;
  /** Секунды выдержки на повтор. */
  seconds?: number;
  note?: string;
  condition?: string;
  optional?: boolean;
}

export interface PlanSessionTemplate {
  timeOfDay: TimeOfDay;
  title?: string;
  note?: string;
  items: PlanItem[];
}

export interface DayTemplate {
  dayNumber: number; // 1..84
  week: number; // 1..12
  dayInWeek: number; // 1..7
  kind: 'training' | 'rest';
  title: string;
  goal: string;
  criteria: string;
  tip: string;
  focus: Problem[];
  restNote?: string;
  analysis?: 'week' | 'two-weeks' | 'final';
  sessions: PlanSessionTemplate[];
}

export interface WeekInfo {
  week: number;
  title: string;
  goal: string;
  passCriteria: string[];
  focus: Problem;
}

// ---------- Хранимые сущности ----------

export interface DogProfile {
  id: string;
  name: string;
  breed: string;
  sex: 'female' | 'male' | '';
  dateOfBirth?: ISODate;
  approxAge?: string;
  weightKg?: number;
  photoId?: string;
  knownCommands: string[];
  problems: string[];
  goals: string[];
  rewards: string[];
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface Pause { from: ISODate; to?: ISODate }

export interface ProgramSettings {
  /** Заметки и рекомендации ИИ по неделям (номер недели → текст). */
  weekNotes: Record<string, string>;
}

export interface TrainingProgram {
  id: string;
  dogId: string;
  startDate: ISODate;
  status: 'active' | 'paused' | 'finished';
  pausedAt?: ISODate;
  pauses: Pause[];
  settings: ProgramSettings;
  /** Версия шаблона программы, из которого созданы дни. */
  version: number;
  createdAt: number;
  updatedAt: number;
}

export type DayStatus = 'done' | 'partial' | 'planned' | 'missed' | 'rest' | 'moved' | 'paused' | 'today';

export interface ProgramDay {
  id: string; // `${programId}:d${dayNumber}`
  programId: string;
  dayNumber: number;
  week: number;
  dayInWeek: number;
  date: ISODate;
  kind: 'training' | 'rest';
  /** День сделан днём отдыха вручную. */
  madeRest?: boolean;
  title: string;
  goal: string;
  criteria: string;
  tip: string;
  focus: Problem[];
  restNote?: string;
  analysis?: 'week' | 'two-weeks' | 'final';
  edited?: boolean;
}

export type SessionStatus = 'planned' | 'done' | 'partial' | 'skipped' | 'rest';

export interface ScheduledSession {
  id: string; // `${programId}:d${dayNumber}:${timeOfDay}` или случайный для добавленных
  programId: string;
  dayNumber: number;
  week: number;
  plannedDate: ISODate;
  timeOfDay: TimeOfDay;
  title?: string;
  note?: string;
  items: PlanItem[];
  status: SessionStatus;
  skipReason?: string;
  rescheduledFrom?: ISODate;
  durationOverride?: number;
  edited?: boolean;
  /** Добавлено пользователем, а не из шаблона. */
  extra?: boolean;
  optional?: boolean;
  /** Последняя тренировка (TrainingSession), выполненная по этому плану. */
  lastTrainingId?: string;
  updatedAt: number;
}

export interface TrainingSession {
  id: string;
  scheduledSessionId?: string;
  programId?: string;
  dogId: string;
  date: ISODate;
  timeOfDay?: TimeOfDay;
  title: string;
  items: PlanItem[];
  startedAt: number;
  finishedAt?: number;
  status: 'active' | 'completed' | 'abandoned';
  environment: Environment;
  mood?: Mood;
  notes: string;
  currentIndex: number;
  pausedAt?: number;
  pausedTotalMs: number;
  /** Кто проводил тренировку (имя участника общей собаки). */
  trainedBy?: string;
  updatedAt: number;
}

export interface ExerciseResult {
  id: string; // `${sessionId}:${itemUid}`
  sessionId: string;
  dogId: string;
  exerciseId: string;
  itemUid: string;
  date: ISODate;
  difficultyLevel: number;
  environment: Environment;
  target: number;
  upTo?: boolean;
  steps?: number;
  seconds?: number;
  attempted: number;
  successful: number;
  unsuccessful: number;
  skipped: boolean;
  skipReason?: string;
  /** Не было подходящих раздражителей — не неудача. */
  noOpportunity?: boolean;
  /** Натяжения поводка (если пользователь их учитывает). */
  tensions?: number;
  /** Средняя удержанная выдержка, сек (для duration). */
  measuredQuantity?: number;
  distractionLevel: Environment;
  /** Минимальная дистанция до раздражителя за упражнение, м. */
  distanceToTrigger?: number;
  stressIndicators: string[];
  switched?: number;
  strongReactions?: number;
  /** Сильный стресс во время упражнения — сессия не засчитывается как успешная. */
  stressed: boolean;
  status: 'active' | 'done' | 'skipped';
  startedAt: number;
  finishedAt?: number;
  durationSeconds: number;
  /** Сумма пауз тренировки на момент начала упражнения (для честного подсчёта длительности). */
  pauseBaseMs?: number;
  notes: string;
  updatedAt: number;
}

export interface Attempt {
  id: string;
  resultId: string;
  sessionId: string;
  exerciseId: string;
  index: number;
  outcome: 'success' | 'fail';
  at: number;
  seconds?: number;
  trigger?: Trigger;
  distance?: number;
  reactions?: string[];
  switched?: boolean;
}

export interface SkillLevel {
  id: string; // `${dogId}:${exerciseId}`
  dogId: string;
  exerciseId: string;
  level: number;
  updatedAt: number;
}

export interface LevelChange {
  id: string;
  dogId: string;
  exerciseId: string;
  from: number;
  to: number;
  reason: string;
  manual: boolean;
  at: number;
}

export type JournalOutcome = 'good' | 'neutral' | 'bad';

export interface JournalEntry {
  id: string;
  dogId: string;
  occurredAt: number;
  location: string;
  situation: string;
  trigger: string;
  reaction: string;
  ownerAction: string;
  outcome: JournalOutcome;
  notes: string;
  photoIds: string[];
  quick?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Photo {
  id: string;
  blob: Blob;
  type: string;
  width: number;
  height: number;
  size: number;
  createdAt: number;
}

export interface SavedReport {
  id: string;
  week: number;
  createdAt: number;
  text: string;
}

export interface AppSettings {
  id: 'app';
  theme: 'system' | 'light' | 'dark';
  morningTrainingTime: string; // 'HH:MM'
  eveningTrainingTime: string;
  /** Дни недели для занятий и напоминаний: 0 — воскресенье … 6 — суббота. */
  trainingDays: number[];
  weeklyReportReminder: boolean;
  preferredLanguage: 'ru';
  exportPreferences: { includePhotos: boolean };
  countTensions: boolean;
  onboarded: boolean;
  lastBackupAt?: number;
  installHintHidden?: boolean;
  /** Как подписывать тренировки этого телефона. */
  ownerName?: string;
  updatedAt: number;
}
