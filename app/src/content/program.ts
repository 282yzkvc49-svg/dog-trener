import type { DayTemplate, PlanItem, PlanSessionTemplate, Problem, WeekInfo } from '../domain/types';
import { EXERCISES } from './exercises';

/** Версия шаблона программы. Увеличивать при изменении содержания курса. */
export const PROGRAM_VERSION = 1;
export const COURSE_DAYS = 84;

type Spec = Omit<PlanItem, 'uid'>;
const it = (exerciseId: string, target: number, extra: Partial<Spec> = {}): Spec => ({ exerciseId, target, ...extra });
const seg = (target: number, steps: number, extra: Partial<Spec> = {}): Spec => ({ exerciseId: 'loose-leash', target, steps, ...extra });
const obs = (target: number, extra: Partial<Spec> = {}, id = 'observe-triggers'): Spec => ({ exerciseId: id, target, upTo: true, ...extra });

const problemOf = new Map(EXERCISES.map((e) => [e.id, e.problem]));

export const WEEKS: WeekInfo[] = [
  { week: 1, title: 'Контакт и диагностика', focus: 'general', goal: 'Зафиксировать исходный уровень по трём направлениям и наладить контакт.', passCriteria: ['Все упражнения недели выполнены хотя бы по разу', 'Найдена комфортная дистанция до раздражителей', '«Оставь» с кулаком — от 70%'] },
  { week: 2, title: 'Первые результаты', focus: 'general', goal: 'Закрепить базу и сравнить результаты с началом программы без повышения сложности.', passCriteria: ['Свободный поводок: 3 из 4 отрезков', '«Оставь» — 8 из 10 на освоенном уровне', 'Разворот — 4 из 5'] },
  { week: 3, title: 'Увеличение спокойной ходьбы', focus: 'leash', goal: 'Отрезки свободного поводка до 20–30 шагов, контакт на прогулке, повторение отказа от подбора.', passCriteria: ['Отрезки 20 шагов — от 80% без натяжения', 'Контакт глазами на прогулке — от 80%', 'Отказ от подбора — без снижения результатов'] },
  { week: 4, title: 'Прохожие', focus: 'distractions', goal: 'Спокойное наблюдение за людьми, переключение внимания и свободный поводок возле умеренных отвлечений.', passCriteria: ['Спокойные наблюдения за людьми — от 70%', 'Переключение внимания — от 80%', 'Поводок возле прохожих — без ухудшения'] },
  { week: 5, title: 'Другие собаки', focus: 'distractions', goal: 'Работа на комфортной дистанции от собак, поощрение спокойного наблюдения, разворот при необходимости.', passCriteria: ['Спокойные наблюдения за собаками — от 70%', 'Разворот при раздражителе — от 80%', 'Нет роста сильных реакций'] },
  { week: 6, title: 'Подбор с земли', focus: 'pickup', goal: 'Отказ от контролируемых приманок, обмен предмета на лакомство.', passCriteria: ['Отказ от предмета на земле — от 80% на текущем уровне', '«Дай» — от 80%', 'Все приманки — только свои и безопасные'] },
  { week: 7, title: 'Подзыв', focus: 'general', goal: 'Подзыв на длинном поводке при слабых и умеренных отвлечениях, игровое подкрепление возвращения.', passCriteria: ['Подзыв на длинном поводке — от 80%', 'Подзыв при слабых отвлечениях — от 70%', 'Возвращение всегда заканчивается наградой'] },
  { week: 8, title: 'Новые маршруты', focus: 'leash', goal: 'Перенос поводка, подзыва и контроля подбора в новые места; учёт влияния обстановки.', passCriteria: ['Результаты в новых местах не ниже 70%', 'Минимум два новых маршрута', 'Обстановка отмечена в каждой тренировке'] },
  { week: 9, title: 'Выдержка', focus: 'general', goal: '«Жди» с постепенным увеличением времени, самоконтроль и спокойствие на прогулке.', passCriteria: ['«Жди» — время выросло без потери качества', 'Спокойное ожидание — от 80%', 'Поводок и подбор — без ухудшения'] },
  { week: 10, title: 'Контроль возбуждения', focus: 'distractions', goal: 'Развороты, переключение внимания и спокойное восстановление после встречи с раздражителем.', passCriteria: ['Разворот при раздражителе — от 80%', 'Расслабление после возбуждения — в пределах времени', 'Сильных реакций меньше, чем в неделе 5'] },
  { week: 11, title: 'Интеллектуальные задания', focus: 'general', goal: 'Поиск предметов, обход препятствий и простые последовательности знакомых команд.', passCriteria: ['Поиск — от 80% раундов', 'Обход предмета — от 80%', 'Три направления — без ухудшения'] },
  { week: 12, title: 'Итоговая проверка', focus: 'general', goal: 'Проверка поводка, реакции на раздражители, отказа от подбора, подзыва и общей управляемости.', passCriteria: ['Сравнение с неделей 1 по всем направлениям', 'Итоговый отчёт сформирован', 'План на следующий месяц составлен'] },
];

// ---------- Недели 1–2: подробный обязательный план ----------

interface ManualDay {
  title: string; goal: string; criteria: string; tip: string;
  morning?: Spec[]; evening?: Spec[]; rest?: string; analysis?: DayTemplate['analysis'];
  optional?: { title: string; items: Spec[] };
}

const WEEKS_1_2: ManualDay[] = [
  { title: 'Контакт и диагностика', goal: 'Зафиксировать исходный уровень.', criteria: 'Отметить честный результат каждой попытки — это точка отсчёта.',
    tip: 'Первый день — диагностика, а не экзамен. Неудачные попытки сегодня так же ценны, как удачные: они показывают, с чего начинаем.',
    morning: [it('eye-contact', 10, { note: 'дома' })],
    evening: [seg(3, 5), it('leave-it', 8, { note: 'с закрытым кулаком' })] },
  { title: 'Правильная ходьба', goal: '7 из 10 успешных отказов в простых условиях.', criteria: '«Оставь»: 7 из 10 в простых условиях.',
    tip: 'Остановка при натяжении работает, только если ты стоишь до первого ослабления поводка. Терпение важнее скорости.',
    morning: [it('eye-contact', 8, { note: 'на улице' })],
    evening: [seg(4, 5), it('leave-it', 10)] },
  { title: 'Работа с отвлечениями', goal: 'Определить подходящую дистанцию до раздражителей.', criteria: 'Найти дистанцию, на которой собака видит раздражитель и берёт лакомство.',
    tip: 'Комфортная дистанция — та, на которой собака замечает собаку или человека и всё ещё берёт лакомство. Запиши её: это твоя стартовая точка.',
    morning: [it('eye-contact', 10)],
    evening: [seg(3, 8), obs(5, { note: 'люди или собаки на комфортной дистанции' })] },
  { title: 'Разворот', goal: 'Минимум 4 из 5 удачных разворотов.', criteria: 'Разворот: 4 из 5.',
    tip: 'Разворот — твой «запасной выход». Отрабатывай его сначала там, где ничего не происходит, чтобы в трудный момент он сработал сам собой.',
    morning: [it('eye-contact', 8)],
    evening: [seg(4, 8), it('u-turn', 5, { note: 'дома или в спокойном месте' }), it('leave-it', 8)] },
  { title: 'Самоконтроль', goal: '8 из 10 успешных отказов на освоенном уровне.', criteria: '«Оставь»: 8 из 10 на освоенном уровне.',
    tip: 'Повышай уровень «Оставь» только после двух удачных сессий. Если кулак ещё не даёт 80%, защищённое лакомство на полу подождёт.',
    morning: [it('recall', 5, { note: 'в спокойном месте' })],
    evening: [it('leave-it', 10, { note: 'до 5 попыток — с защищённым лакомством на полу', condition: 'Только если этап с закрытым кулаком освоен (две сессии от 80%).' }), seg(3, 8)] },
  { title: 'Закрепление', goal: 'Сравнить натяжение поводка с первым днём.', criteria: 'Доля отрезков без натяжения выше, чем в день 1.',
    tip: 'Если сегодня хуже, чем вчера, — это нормально. Смотри на тенденцию за неделю, а не на один день.',
    morning: [it('eye-contact', 8)],
    evening: [seg(4, 10), it('leave-it', 10), obs(3)] },
  { title: 'Отдых', goal: 'Восстановление.', criteria: 'Без обязательных упражнений.', rest: 'Обычная прогулка с обнюхиванием. Никаких обязательных упражнений — это не пропуск.',
    tip: 'Отдых — часть программы. Нюхательная прогулка снижает возбуждение и помогает закрепить выученное.', analysis: 'week' },
  { title: 'Увеличение дистанции', goal: '3 из 4 успешных отрезков.', criteria: 'Свободный поводок: 3 из 4 отрезков по 12 шагов.',
    tip: 'Длинный поводок пристёгивай только к шлейке. Он нужен, чтобы подзыв всегда заканчивался успехом.',
    morning: [it('recall', 5, { note: 'на длинном поводке в безопасном месте' })],
    evening: [seg(4, 12), it('leave-it', 10)] },
  { title: 'Спокойствие при встречах', goal: '4 из 5 спокойных переключений на комфортной дистанции.', criteria: 'Наблюдения: 4 из 5 спокойных.',
    tip: 'Награждай за спокойный взгляд на раздражитель. Взгляд на собаку должен стать для твоей собаки сигналом «сейчас будет вкусно».',
    morning: [it('eye-contact', 8)],
    evening: [obs(5, { note: 'люди и собаки' }), seg(3, 12), it('leave-it', 8)] },
  { title: 'Управляемый разворот', goal: '4 из 5 удачных разворотов.', criteria: 'Разворот: 4 из 5.',
    tip: 'В «Жди» увеличивай что-то одно: время, расстояние или отвлечения. Сегодня только 5 секунд — и это правильно.',
    morning: [it('wait', 5, { seconds: 5 })],
    evening: [seg(3, 15), it('u-turn', 5), it('leave-it', 8)] },
  { title: 'Отказ от предметов', goal: '8 из 10 успешных отказов при подходящей сложности.', criteria: '«Оставь»: 8 из 10 на подходящем уровне.',
    tip: 'Используй только свои безопасные предметы. Никогда не тренируй отказ на настоящем мусоре или найденной еде.',
    morning: [it('eye-contact', 10)],
    evening: [it('leave-it', 10, { note: 'с безопасным защищённым предметом на полу' }), obs(4)] },
  { title: 'Работа на улице', goal: 'Сохранять управляемость при умеренных отвлечениях.', criteria: 'Результаты не ниже 70% при умеренных отвлечениях.',
    tip: 'Отмечай обстановку в начале тренировки — так приложение сравнивает успех в похожих условиях, а не дом с оживлённой улицей.',
    morning: [it('recall', 5, { note: 'на длинном поводке' })],
    evening: [seg(4, 15), obs(5), it('u-turn', 3)] },
  { title: 'Контрольный день', goal: 'Зафиксировать промежуточные результаты без повышения сложности.', criteria: 'Те же условия, что в начале недели, — честная проверка.',
    tip: 'Контрольный день проводи в знакомой обстановке. Цель — увидеть изменения, а не усложнить задачу.',
    morning: [it('eye-contact', 10)],
    evening: [seg(3, 15), it('leave-it', 10), obs(5)] },
  { title: 'Восстановление и анализ', goal: 'Сравнить результаты с началом программы.', criteria: 'Сформировать отчёт за две недели.', rest: 'Спокойная прогулка. По желанию — нюхательная игра. Вечером — отчёт за две недели.',
    tip: 'Сравнивай с днём 1, а не с идеалом. Любое движение вперёд за две недели — результат.', analysis: 'two-weeks',
    optional: { title: 'Нюхательная игра (по желанию)', items: [it('treat-search', 3, { optional: true })] } },
];

// ---------- Недели 3–12: детерминированный шаблон распределения ----------

interface WeekCfg {
  week: number;
  short: string;
  leashSteps: number;
  leashNote?: string;
  main: Spec[];
  mainMorning: Spec;
  observe: Spec;
  pickup: Spec;
  pickup2: Spec;
  selfControl: Spec;
  d5Morning: Spec;
  realWorld: Spec[];
  d1Goal: string;
  d3Goal: string;
  tips: [string, string];
}

const CFG: WeekCfg[] = [
  { week: 3, short: 'длинные отрезки', leashSteps: 20, leashNote: 'отрезки 20–30 шагов',
    main: [seg(4, 20, { note: 'отрезки 20–30 шагов' })], mainMorning: it('eye-contact', 10, { note: 'на прогулке' }),
    observe: obs(3), pickup: it('leave-it', 10), pickup2: it('ground-refusal', 6), selfControl: it('wait', 5, { seconds: 10 }),
    d5Morning: it('recall', 5, { note: 'на длинном поводке' }), realWorld: [it('direction-change', 6)],
    d1Goal: 'Проверить, держится ли свободный поводок на отрезках 20 шагов.', d3Goal: 'Длинные отрезки рядом с раздражителями на комфортной дистанции.',
    tips: ['Удлиняй отрезок, только когда короткий проходит уверенно. Если 20 шагов пока трудно — оставайся на своём уровне, неделя курса тут не главное.', 'Перерывы на обнюхивание между блоками — не потеря времени, а способ сохранить спокойствие.'] },
  { week: 4, short: 'прохожие', leashSteps: 15, leashNote: 'возле умеренных отвлечений',
    main: [obs(5, {}, 'calm-people'), it('attention-switch', 8)], mainMorning: it('attention-switch', 8, { note: 'на улице' }),
    observe: obs(4, {}, 'calm-people'), pickup: it('leave-it', 8), pickup2: it('ground-refusal', 6), selfControl: it('wait', 5, { seconds: 10 }),
    d5Morning: it('eye-contact', 10), realWorld: [it('u-turn', 3)],
    d1Goal: 'Оценить реакцию на прохожих и найти комфортную дистанцию.', d3Goal: 'Спокойное наблюдение за людьми и переключение на хозяина.',
    tips: ['Не разрешай незнакомцам гладить собаку во время тренировки: так она учится, что тянуться к людям выгодно.', 'Если собака рвётся к человеку, разворот лучше, чем удержание на месте.'] },
  { week: 5, short: 'другие собаки', leashSteps: 15,
    main: [obs(5, {}, 'calm-dogs'), it('u-turn', 5)], mainMorning: it('attention-switch', 8),
    observe: obs(4, {}, 'calm-dogs'), pickup: it('leave-it', 8), pickup2: it('drop-it', 5), selfControl: it('wait', 5, { seconds: 15 }),
    d5Morning: it('recall', 5, { note: 'на длинном поводке' }), realWorld: [it('decompress', 1)],
    d1Goal: 'Оценить реакцию на собак и записать комфортную дистанцию.', d3Goal: 'Спокойное наблюдение за собаками на комфортной дистанции.',
    tips: ['Дистанцию определяет твоя собака. Если она перестала брать лакомство — вы слишком близко.', 'После встречи с собакой дай 1–2 минуты нюхательной паузы, прежде чем продолжать.'] },
  { week: 6, short: 'подбор с земли', leashSteps: 20,
    main: [it('ground-refusal', 10), it('drop-it', 5)], mainMorning: it('leave-it', 10),
    observe: obs(3), pickup: it('ground-refusal', 10), pickup2: it('leave-it', 8), selfControl: it('wait', 5, { seconds: 15 }),
    d5Morning: it('eye-contact', 10), realWorld: [it('drop-it', 3, { note: 'обмен безопасной находки' })],
    d1Goal: 'Оценить отказ от своих приманок на текущем уровне.', d3Goal: 'Отказ от приманок, когда рядом есть другие отвлечения.',
    tips: ['Приманки раскладывай сам и собирай после тренировки. Ничего найденного на улице в упражнениях не используй.', 'Обмен «Дай» не должен означать потерю: иногда возвращай собаке её игрушку.'] },
  { week: 7, short: 'подзыв', leashSteps: 20,
    main: [it('recall', 6, { note: 'длинный поводок' }), it('play-focus', 5, { note: 'игровое подкрепление' })], mainMorning: it('recall', 5, { note: 'длинный поводок, тихое место' }),
    observe: obs(3), pickup: it('ground-refusal', 8), pickup2: it('leave-it', 8), selfControl: it('wait', 5, { seconds: 20 }),
    d5Morning: it('recall', 5, { note: 'длинный поводок' }), realWorld: [it('recall', 3, { note: 'при слабых отвлечениях' })],
    d1Goal: 'Проверить подзыв на длинном поводке в простых условиях.', d3Goal: 'Подзыв при слабых и умеренных отвлечениях — только на длинном поводке.',
    tips: ['Подзыв должен быть лучшим событием прогулки. Никогда не наказывай за возвращение, даже если ждал долго.', 'Зови и отпускай обратно гулять: тогда «Ко мне» не означает конец свободы.'] },
  { week: 8, short: 'новые маршруты', leashSteps: 15, leashNote: 'новый маршрут',
    main: [seg(4, 15, { note: 'новый маршрут' }), it('recall', 4, { note: 'длинный поводок, новое место' })], mainMorning: it('eye-contact', 10, { note: 'новое место' }),
    observe: obs(4, { note: 'новое место' }), pickup: it('ground-refusal', 8, { note: 'новый маршрут' }), pickup2: it('drop-it', 4), selfControl: it('calm-waiting', 1, { seconds: 60 }),
    d5Morning: it('attention-switch', 8), realWorld: [it('direction-change', 6)],
    d1Goal: 'Проверить навыки на новом маршруте и отметить, как влияет обстановка.', d3Goal: 'Новое место с отвлечениями — сравни с привычным маршрутом.',
    tips: ['В новом месте дай собаке сначала 2–3 минуты понюхать — так ей проще сосредоточиться.', 'Результат в новом месте ниже — это ожидаемо. Отмечай обстановку, чтобы графики сравнивали похожие условия.'] },
  { week: 9, short: 'выдержка', leashSteps: 25,
    main: [it('wait', 6, { seconds: 20, note: 'постепенно увеличивай время' }), it('calm-waiting', 1, { seconds: 120 })], mainMorning: it('wait', 5, { seconds: 15 }),
    observe: obs(3), pickup: it('leave-it', 8), pickup2: it('ground-refusal', 8), selfControl: it('place', 3, { seconds: 30 }),
    d5Morning: it('wait', 5, { seconds: 20, note: 'на улице' }), realWorld: [it('calm-waiting', 1, { seconds: 180, note: 'на скамейке' })],
    d1Goal: 'Оценить текущую выдержку дома и на улице.', d3Goal: 'Выдержка, когда рядом что-то происходит.',
    tips: ['Увеличивай время выдержки на несколько секунд, а не вдвое. Короткая удачная выдержка ценнее длинной сорванной.', 'Спокойное ожидание — навык, а не наказание. Награждай тишину.'] },
  { week: 10, short: 'контроль возбуждения', leashSteps: 20,
    main: [it('u-turn', 5), it('attention-switch', 8), it('decompress', 1)], mainMorning: it('play-focus', 6),
    observe: obs(4), pickup: it('ground-refusal', 8), pickup2: it('leave-it', 8), selfControl: it('wait', 5, { seconds: 20 }),
    d5Morning: it('attention-switch', 8), realWorld: [it('decompress', 1, { note: 'после встречи с раздражителем' })],
    d1Goal: 'Оценить, как быстро собака возвращается к спокойствию.', d3Goal: 'Переключение и восстановление после встречи с раздражителем.',
    tips: ['Возбуждение копится. После трёх встреч подряд лучше закончить тренировку спокойной прогулкой.', 'Говори тише и двигайся медленнее, когда собака возбуждена, — она подстраивается под тебя.'] },
  { week: 11, short: 'интеллектуальные задания', leashSteps: 25,
    main: [it('treat-search', 3), it('go-around', 6)], mainMorning: it('toy-search', 3),
    observe: obs(3), pickup: it('ground-refusal', 8), pickup2: it('drop-it', 4), selfControl: it('place', 3, { seconds: 60 }),
    d5Morning: it('direction-change', 6), realWorld: [it('heel', 3, { steps: 10 }), it('play-focus', 4, { note: 'последовательность: «Сидеть» → «Лежать» → «Жди»' })],
    d1Goal: 'Новые задания для головы при сохранении трёх основных направлений.', d3Goal: 'Поиск и обход при отвлечениях.',
    tips: ['15 минут поиска утомляют аусси не меньше, чем час бега. Это отличный способ снизить возбуждение.', 'Последовательности команд делай короткими: 2–3 команды и награда.'] },
  { week: 12, short: 'итоговая проверка', leashSteps: 20, leashNote: 'контрольный маршрут',
    main: [seg(4, 20, { note: 'контрольный маршрут' }), it('recall', 5, { note: 'длинный поводок' })], mainMorning: it('eye-contact', 10),
    observe: obs(5), pickup: it('ground-refusal', 10), pickup2: it('leave-it', 10), selfControl: it('wait', 5, { seconds: 20 }),
    d5Morning: it('recall', 5, { note: 'длинный поводок' }), realWorld: [it('u-turn', 3)],
    d1Goal: 'Итоговая проверка в тех же условиях, что в первую неделю.', d3Goal: 'Проверка реакции на раздражители на комфортной дистанции.',
    tips: ['Итоговую проверку проводи в знакомой обстановке — так сравнение с неделей 1 будет честным.', 'После курса продолжай 3–4 короткие тренировки в неделю, чтобы навыки не угасали.'] },
];

const ROLE_TIPS: Record<number, string[]> = {
  2: ['Свободный поводок — не поза, а договорённость: поводок провис — идём, натянулся — стоим.', 'Награждай у своей ноги: где награда, там собака и будет держаться.', 'Короткие отрезки с частыми наградами работают лучше одного длинного.'],
  4: ['«Оставь» — это «посмотри на меня», а не «замри и страдай». Награда всегда другим, более вкусным лакомством.', 'Если собака что-то подобрала — предложи обмен «Дай», а не гонку.', 'В выдержке увеличивай по одному: время, расстояние или отвлечения.'],
  5: ['Смешанный день — без новых сложностей. Повторяем то, что уже получается.', 'Закончи тренировку на удачной попытке, даже если для этого придётся упростить.', 'Если собака устала — сократи план. Пропуск части упражнений не считается неудачей.'],
};

function day7(week: number): ManualDay {
  const final = week === 12;
  return {
    title: final ? 'Итоговый отчёт' : 'Отдых и недельная аналитика',
    goal: final ? 'Подвести итоги 12 недель и составить план на следующий месяц.' : 'Восстановление и разбор недели.',
    criteria: final ? 'Сформировать итоговый отчёт.' : 'Сформировать недельный отчёт.',
    rest: final ? 'Спокойная прогулка. Сформируй итоговый отчёт и сравни с первой неделей.' : 'Обычная прогулка с обнюхиванием, без обязательных упражнений. Вечером — недельный отчёт.',
    tip: final ? 'Курс закончен, но навыки живут, пока их используют. Выбери 2–3 упражнения на следующий месяц.' : 'Посмотри недельный отчёт и реши, что в следующей неделе оставить на текущем уровне.',
    analysis: final ? 'final' : 'week',
  };
}

function weekDays(c: WeekCfg): ManualDay[] {
  const leash = (n: number, extra: Partial<Spec> = {}) => seg(n, c.leashSteps, { note: c.leashNote, ...extra });
  const short = (s: Spec, target: number): Spec => ({ ...s, target: Math.min(s.target, target) });
  const r = (role: number) => ROLE_TIPS[role][(c.week - 3) % ROLE_TIPS[role].length];
  return [
    { title: `Диагностика: ${c.short}`, goal: c.d1Goal, criteria: 'Зафиксировать результат на текущем уровне — без повышения сложности.', tip: c.tips[0],
      morning: [c.mainMorning], evening: [...c.main, leash(3), short(c.pickup, 6)] },
    { title: 'Поводок и внимание', goal: 'Свободный поводок на отрезках недели и переключение внимания на хозяина.', criteria: 'Поводок: от 80% отрезков без натяжения.', tip: r(2),
      morning: [it('eye-contact', 10)], evening: [leash(4), it('attention-switch', 8), short(c.pickup2, 6)] },
    { title: `${capital(c.short)} при отвлечениях`, goal: c.d3Goal, criteria: 'Спокойные реакции — от 70% на комфортной дистанции.', tip: 'Если раздражителей не встретилось — отметь «Не было встреч». Это не неудача и не ухудшает статистику.',
      morning: [short(c.mainMorning, 8)], evening: [c.observe, c.main[0], leash(3)] },
    { title: 'Подбор и самоконтроль', goal: 'Отказ от подбора на текущем уровне и выдержка.', criteria: 'Отказ от подбора: от 80% на текущем уровне.', tip: r(4),
      morning: [c.selfControl], evening: [c.pickup, c.pickup2, leash(3), obs(2)] },
    { title: 'Смешанное закрепление', goal: 'Все три направления в одной тренировке без повышения сложности.', criteria: 'Сохранить результаты среды и четверга.', tip: r(5),
      morning: [c.d5Morning], evening: [leash(3), short(c.pickup, 6), obs(3), it('u-turn', 3)] },
    { title: c.week === 12 ? 'Итоговая проверка в реальных условиях' : 'Практика в реальных условиях', goal: 'Расширенная прогулка: несколько коротких блоков с перерывами на обнюхивание.', criteria: 'Отметить обстановку и сравнить с тренировками в тихих местах.', tip: c.tips[1],
      morning: [it('eye-contact', 8, { note: 'на прогулке' })], evening: [leash(3, { note: 'блок 1' }), obs(5, { note: 'блок 2' }), it('ground-refusal', 6, { note: 'блок 3 — свои приманки' }), ...c.realWorld] },
    day7(c.week),
  ];
}

function capital(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function dedupe(items: Spec[]): Spec[] {
  const seen = new Set<string>();
  return items.filter((x) => (seen.has(x.exerciseId) ? false : (seen.add(x.exerciseId), true)));
}

/** Гарантирует, что в тренировочном дне есть все три проблемных направления. */
function ensureDirections(morning: Spec[], evening: Spec[]): Spec[] {
  const has = (p: Problem) => [...morning, ...evening].some((x) => problemOf.get(x.exerciseId) === p);
  const out = [...evening];
  if (!has('leash')) out.push(seg(2, 10, { note: 'короткое повторение' }));
  if (!has('distractions')) out.push(obs(2));
  if (!has('pickup')) out.push(it('leave-it', 5, { note: 'короткое повторение' }));
  return out;
}

function toSessions(d: ManualDay, ensure: boolean): PlanSessionTemplate[] {
  if (d.rest) return d.optional ? [{ timeOfDay: 'evening', title: d.optional.title, items: withUids(d.optional.items, 'e') }] : [];
  const morning = dedupe(d.morning ?? []);
  let evening = dedupe(d.evening ?? []);
  if (ensure) evening = dedupe(ensureDirections(morning, evening));
  const sessions: PlanSessionTemplate[] = [];
  if (morning.length) sessions.push({ timeOfDay: 'morning', title: 'Утренняя тренировка', items: withUids(morning, 'm') });
  if (evening.length) sessions.push({ timeOfDay: 'evening', title: d.title.startsWith('Практика') || d.title.startsWith('Итоговая проверка в') ? 'Расширенная прогулка: блоки с перерывами' : 'Вечерняя тренировка', items: withUids(evening, 'e') });
  return sessions;
}

function withUids(items: Spec[], prefix: string): PlanItem[] {
  return items.map((x, i) => ({ ...x, uid: `${prefix}${i + 1}` }));
}

function focusOf(sessions: PlanSessionTemplate[]): Problem[] {
  const set = new Set<Problem>();
  for (const s of sessions) for (const x of s.items) { const p = problemOf.get(x.exerciseId); if (p && p !== 'general') set.add(p); }
  return [...set];
}

/** Полный шаблон курса: 84 дня, детерминированно. */
export function buildCourseTemplate(): DayTemplate[] {
  const manual: ManualDay[] = [...WEEKS_1_2, ...CFG.flatMap(weekDays)];
  return manual.map((d, i) => {
    const dayNumber = i + 1;
    const week = Math.ceil(dayNumber / 7);
    const sessions = toSessions(d, week >= 3);
    return {
      dayNumber, week, dayInWeek: ((dayNumber - 1) % 7) + 1,
      kind: d.rest ? 'rest' : 'training',
      title: d.title, goal: d.goal, criteria: d.criteria, tip: d.tip,
      restNote: d.rest, analysis: d.analysis,
      focus: focusOf(sessions), sessions,
    };
  });
}

export const GENERAL_TIPS = [
  'Тренировка заканчивается раньше, чем собака устала. Лучше три коротких удачных подхода, чем один длинный.',
  'Отмечай «Да!» в момент правильного поведения, а награду давай сразу после.',
  'Аусси быстро учатся и так же быстро скучают. Меняй порядок упражнений и награды.',
  'Обнюхивание — потребность собаки. Давай понюхать между упражнениями.',
];
