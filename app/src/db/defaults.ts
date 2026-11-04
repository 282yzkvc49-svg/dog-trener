import type { AppSettings, DogProfile } from '../domain/types';

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'app',
  theme: 'system',
  morningTrainingTime: '08:00',
  eveningTrainingTime: '19:00',
  trainingDays: [1, 2, 3, 4, 5, 6],
  weeklyReportReminder: true,
  preferredLanguage: 'ru',
  exportPreferences: { includePhotos: true },
  countTensions: true,
  onboarded: false,
  updatedAt: 0,
};

/** Данные собаки из технического задания — подставляются при первом запуске, всё можно изменить. */
export function defaultDog(now = Date.now(), id = 'dog-main'): DogProfile {
  return {
    id,
    name: '',
    breed: 'Австралийская овчарка',
    sex: '',
    approxAge: '1 год 3 месяца',
    knownCommands: ['Сидеть', 'Лежать', 'Ко мне', 'Жди'],
    problems: ['Тянет поводок', 'Сильно отвлекается на других собак и людей', 'Подбирает предметы и еду с земли'],
    goals: ['Концентрация на хозяине', 'Выдержка и самоконтроль', 'Подзыв при отвлечениях', 'Интеллектуальное развитие'],
    rewards: ['Мелкое мягкое лакомство', 'Игра с игрушкой'],
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
}
