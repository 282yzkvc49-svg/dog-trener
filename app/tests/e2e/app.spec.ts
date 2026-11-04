import { test, expect, type Page } from 'playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Понедельник, 9 ноября 2026, 10:00 по Москве — курс стартует «сегодня».
const MON = new Date('2026-11-09T10:00:00+03:00');
const at = (iso: string) => new Date(`${iso}T10:00:00+03:00`);

async function onboard(page: Page, name = 'Луна') {
  await page.clock.setFixedTime(MON);
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать', exact: true }).click();
  await page.getByLabel('Кличка').fill(name);
  await page.getByRole('button', { name: 'Девочка' }).click();
  await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Сегодня', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Открыть первый день' }).click();
  await expect(page.getByText('Неделя 1 · День 1')).toBeVisible();
}

async function startFromToday(page: Page, nth: number, env: RegExp) {
  await page.getByRole('button', { name: 'Начать тренировку' }).nth(nth).click();
  const sheet = page.locator('dialog[open]');
  await sheet.getByRole('radio', { name: env }).click();
  await sheet.getByRole('button', { name: 'Начать тренировку' }).click();
}

async function tap(page: Page, name: string, times: number) {
  for (let i = 0; i < times; i++) await page.getByRole('button', { name, exact: true }).click();
}

async function saveWithMood(page: Page, mood = /^Спокойная/) {
  await page.getByRole('radio', { name: mood }).click();
  await page.getByRole('button', { name: 'Сохранить тренировку' }).click();
  await expect(page.getByRole('heading', { name: 'Тренировка завершена' })).toBeVisible();
}

test('1–2. Первый запуск и профиль собаки сохраняются', async ({ page }) => {
  await onboard(page);
  await expect(page.getByRole('heading', { name: 'Луна' })).toBeVisible();
  await page.getByRole('button', { name: 'Профиль собаки' }).click();
  await expect(page.getByText('Сидеть')).toBeVisible();
  await expect(page.getByText('Тянет поводок')).toBeVisible();
  await page.getByLabel('Кличка').fill('Луна Мун');
  await page.getByRole('textbox', { name: 'Добавить: Уже знает команды' }).fill('Место');
  await page.getByRole('button', { name: 'Добавить: Уже знает команды' }).click();
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByLabel('Кличка')).toHaveValue('Луна Мун');
  await expect(page.getByText('Место', { exact: true })).toBeVisible();
});

test('3. Завершение упражнения: счётчик, итоги, статус в плане', async ({ page }) => {
  await onboard(page);
  await startFromToday(page, 0, /Дом/);
  await expect(page.getByRole('heading', { name: 'Контакт глазами' })).toBeVisible();
  await tap(page, 'Посмотрела', 9);
  await tap(page, 'Не посмотрела', 1);
  await expect(page.getByText('Упражнение выполнено')).toBeVisible();
  await expect(page.getByText('9 из 10 · 90%')).toBeVisible();
  await page.getByRole('button', { name: 'Завершить тренировку' }).click();
  await saveWithMood(page);
  await expect(page.getByText('90%').first()).toBeVisible();
  await page.getByRole('button', { name: 'Готово' }).click();
  await expect(page.getByText('Выполнено').first()).toBeVisible();
});

test('4. Прерывание и восстановление тренировки после перезагрузки', async ({ page }) => {
  await onboard(page);
  await startFromToday(page, 1, /Тихое место/);
  await expect(page.getByRole('heading', { name: 'Свободный поводок' })).toBeVisible();
  await page.getByRole('button', { name: 'Без натяжения', exact: true }).click();
  await page.getByRole('button', { name: 'Было натяжение', exact: true }).click();
  // Счётчик на экране обновляется только после записи в IndexedDB.
  await expect(page.getByText('Было натяжение: 1')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Свободный поводок' })).toBeVisible();
  await expect(page.getByText('Без натяжения: 1')).toBeVisible();
  await expect(page.getByText('Было натяжение: 1')).toBeVisible();
  await page.goto('/#/today');
  await expect(page.getByText('Незавершённая тренировка')).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(page.getByText('Без натяжения: 1')).toBeVisible();
});

test('5. Пропуск упражнения не считается неудачей', async ({ page }) => {
  await onboard(page);
  await startFromToday(page, 1, /Тихое место/);
  await page.getByRole('button', { name: 'Пропустить упражнение' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Собака устала' }).click();
  await expect(page.getByRole('heading', { name: 'Команда «Оставь»' })).toBeVisible();
  await tap(page, 'Оставила', 8);
  await page.getByRole('button', { name: 'Завершить тренировку' }).click();
  await saveWithMood(page);
  await expect(page.getByText('Пропущено: Собака устала')).toBeVisible();
  await page.goto('/#/progress');
  await expect(page.getByText('Отказов от подбора')).toBeVisible();
});

test('6. День отдыха показывается отдельно, ручной день отдыха', async ({ page }) => {
  await onboard(page);
  await page.clock.setFixedTime(at('2026-11-15'));
  await page.reload();
  await expect(page.getByText('День отдыха')).toBeVisible();
  await expect(page.getByText('Неделя 1 · День 7')).toBeVisible();
  await page.goto('/#/program/day/2026-11-17');
  await page.getByRole('button', { name: 'Сделать днём отдыха' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Сделать отдыхом' }).click();
  await expect(page.getByText('Этот день сделан днём отдыха.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Вернуть занятия дня' })).toBeVisible();
});

test('7. Перенос тренировки на другой день', async ({ page }) => {
  await onboard(page);
  await page.goto('/#/program/day/2026-11-09');
  await page.getByRole('button', { name: 'Перенести' }).nth(1).click();
  const sheet = page.locator('dialog[open]');
  await sheet.getByRole('button', { name: 'Завтра', exact: true }).click();
  await sheet.getByRole('button', { name: /Перенести на 10 ноября/ }).click();
  await page.goto('/#/today');
  await expect(page.getByText('Вечерняя тренировка перенесена на 10 ноября.')).toBeVisible();
  await page.goto('/#/program/day/2026-11-10');
  await expect(page.getByText('(перенесено с 9 ноября)')).toBeVisible();
});

test('8. Изменение даты старта сдвигает план', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: 'Профиль собаки' }).click();
  await page.getByRole('button', { name: /Дата начала программы/ }).click();
  await page.locator('dialog[open]').getByLabel('Первый день курса').fill('2026-11-16');
  await page.locator('dialog[open]').getByRole('button', { name: 'Сохранить' }).click();
  await page.goto('/#/today');
  await expect(page.getByText(/Курс начнётся понедельник, 16 ноября/)).toBeVisible();
});

test('9. Переход между неделями', async ({ page }) => {
  await onboard(page);
  await page.clock.setFixedTime(at('2026-11-16'));
  await page.reload();
  await expect(page.getByText('Неделя 2 · День 8')).toBeVisible();
  await page.goto('/#/program?view=week');
  await expect(page.getByRole('main').getByText('Неделя 2 из 12')).toBeVisible();
  await expect(page.getByText('День 8. Увеличение дистанции')).toBeVisible();
  await page.getByRole('button', { name: 'Следующая неделя' }).click();
  await expect(page.getByText('Увеличение спокойной ходьбы')).toBeVisible();
});

test('10. Адаптация сложности: две успешные сессии → предложение уровня 2', async ({ page }) => {
  await onboard(page);
  for (let round = 0; round < 2; round++) {
    await page.goto('/#/exercises/leave-it');
    await page.getByRole('button', { name: 'Потренировать сейчас' }).click();
    await page.locator('dialog[open]').getByRole('radio', { name: /Дом/ }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Начать тренировку' }).click();
    await tap(page, 'Оставила', 8);
    await page.getByRole('button', { name: 'Завершить тренировку' }).click();
    await saveWithMood(page);
  }
  await page.getByRole('button', { name: 'Перейти на уровень 2' }).click();
  await expect(page.getByText('Новый уровень сохранён.')).toBeVisible();
  await page.goto('/#/exercises/leave-it');
  await expect(page.getByText('2 из 5')).toBeVisible();
  await expect(page.getByText('Уровень 1 → 2')).toBeVisible();
});

test('11. Отчёт для ИИ формируется из фактических данных', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await onboard(page);
  await startFromToday(page, 0, /Дом/);
  await tap(page, 'Посмотрела', 10);
  await page.getByRole('button', { name: 'Завершить тренировку' }).click();
  await saveWithMood(page);
  await page.goto('/#/progress');
  await page.getByRole('button', { name: 'Сформировать отчёт для ИИ' }).click();
  const text = page.getByLabel('Текст отчёта');
  await expect(text).toContainText('Отчёт Aussie Trainer — неделя 1 из 12');
  await expect(text).toContainText('Контакт глазами: уровень 1 из 5');
  await expect(text).toContainText('Запрос');
  await page.getByRole('button', { name: 'Копировать' }).click();
  await expect(page.getByText('Отчёт скопирован — вставьте его в чат')).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('Результаты по трём основным проблемам');
});

test('12. Экспорт и импорт резервной копии, удаление данных', async ({ page }) => {
  // Путь без кириллицы: Chrome не принимает файлы для <input type=file> из папок с не-ASCII именами.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aussie-'));
  await onboard(page);
  await startFromToday(page, 0, /Дом/);
  await tap(page, 'Посмотрела', 10);
  await page.getByRole('button', { name: 'Завершить тренировку' }).click();
  await saveWithMood(page);
  await page.goto('/#/settings');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Сохранить резервную копию' }).click();
  const file = path.join(dir, 'backup.json');
  await (await dl).saveAs(file);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(json.app).toBe('aussie-trainer');
  expect(json.data.results.length).toBe(1);

  await page.getByRole('button', { name: 'Удалить все данные' }).click();
  await page.locator('dialog[open]').getByRole('textbox').fill('УДАЛИТЬ');
  await page.locator('dialog[open]').getByRole('button', { name: 'Удалить всё' }).click();
  await expect(page.getByRole('heading', { name: 'Aussie Trainer' })).toBeVisible();

  await page.getByTestId('import-file').setInputFiles(file);
  await expect(page.getByText('Собака: Луна')).toBeVisible();
  await page.locator('dialog[open]').getByRole('button', { name: 'Восстановить' }).click();
  await expect(page.getByRole('heading', { name: 'Луна' })).toBeVisible();
  await expect(page.getByText('Выполнено').first()).toBeVisible();

  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, JSON.stringify({ app: 'other' }));
  await page.goto('/#/settings');
  await page.getByTestId('import-file').setInputFiles(bad);
  await expect(page.getByText('Это резервная копия другого приложения или другой файл.')).toBeVisible();
});

test('13–14. Офлайн-работа и сохранность данных после обновления приложения', async ({ page, context }) => {
  const swPath = path.resolve('dist/sw.js');
  const original = fs.readFileSync(swPath, 'utf8');
  try {
    await onboard(page);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Луна' })).toBeVisible();
    await expect(page.getByText('Неделя 1 · День 1')).toBeVisible();
    await context.setOffline(false);

    // Новая версия приложения: другой service worker.
    fs.writeFileSync(swPath, original.replace("const CACHE = '", "const CACHE = 'v2-"));
    await page.reload();
    await expect(page.getByText('Доступна новая версия приложения. Данные сохранятся.')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Обновить' }).click();
    await page.waitForLoadState('load');
    await expect(page.getByRole('heading', { name: 'Луна' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Доступна новая версия приложения. Данные сохранятся.')).toHaveCount(0);
  } finally {
    fs.writeFileSync(swPath, original);
  }
});

test('15. Разные размеры экрана: без горизонтальной прокрутки', async ({ page }) => {
  await onboard(page);
  const routes = ['today', 'program?view=week', 'program?view=month', 'program?view=course', 'program/day/2026-11-09', 'exercises', 'exercises/loose-leash', 'progress', 'journal', 'journal/new', 'report/1', 'settings', 'profile', 'free'];
  for (const vp of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(vp);
    for (const r of routes) {
      await page.goto(`/#/${r}`);
      await page.waitForTimeout(120);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over, `${r} @ ${vp.width}px`).toBeLessThanOrEqual(0);
    }
  }
});

test('Наблюдения: выраженные реакции ведут к подсказке безопасности; «не было встреч» — не неудача', async ({ page }) => {
  await onboard(page);
  await page.goto('/#/free');
  await page.getByRole('button', { name: 'Добавить упражнение' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Наблюдение за раздражителями' }).click();
  await page.getByRole('button', { name: 'Добавить упражнение' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Спокойная реакция на других собак' }).click();
  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Начать тренировку' }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '10', exact: true }).click();
    await page.getByRole('button', { name: 'Лай', exact: true }).click();
    await page.getByRole('button', { name: 'Нет', exact: true }).click();
    await page.getByRole('button', { name: 'Сохранить наблюдение' }).click();
  }
  await expect(page.getByText('Две сильные реакции подряд', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Закончить упражнение' }).click();
  await expect(page.getByRole('heading', { name: 'Спокойная реакция на других собак' })).toBeVisible();
  await page.getByRole('button', { name: 'Не было подходящих встреч' }).click();
  await expect(page.getByText('Встреч не было')).toBeVisible();
  await page.getByRole('button', { name: 'Завершить тренировку' }).click();
  await saveWithMood(page, /^Немного возбуждённая/);
  await expect(page.getByText('Подходящих встреч не было — это не неудача.')).toBeVisible();
  await expect(page.getByText('Сначала спокойствие')).toBeVisible();
});

test('Дневник: быстрая запись одним касанием и подробная запись', async ({ page }) => {
  await onboard(page);
  await page.goto('/#/journal');
  await page.getByRole('button', { name: /мимо человека спокойно/ }).click();
  await expect(page.getByText('Записано')).toBeVisible();
  await page.getByRole('button', { name: 'Запись', exact: true }).click();
  await page.getByLabel('Ситуация').fill('Встретили бегуна, развернулись');
  await page.getByLabel('Место прогулки').fill('Набережная');
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByLabel('Ситуация')).toHaveValue('Встретили бегуна, развернулись');
  await page.getByRole('button', { name: 'Готово' }).click();
  await expect(page.getByText('Встретили бегуна, развернулись')).toBeVisible();
  await expect(page.getByRole('button', { name: /Хорошо Прошла мимо человека спокойно/ })).toBeVisible();
});
