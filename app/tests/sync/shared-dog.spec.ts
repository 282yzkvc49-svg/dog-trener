import { test, expect, type Browser, type Page } from 'playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
// @ts-expect-error — заглушка написана на JS
import { startMockSupabase } from '../mock/aussie-server.mjs';

// Муж и жена ведут одну собаку на двух телефонах. Облако — заглушка с правилами как в aussie_trainer.sql.
const MON = new Date('2026-11-09T10:00:00+03:00');
const PASSWORD = 'secret-123';
let mock: { server: import('node:http').Server; state: any };

test.beforeAll(async () => { mock = await startMockSupabase(54400); });
test.afterAll(async () => { await new Promise((r) => mock.server.close(r)); });

async function phone(browser: Browser) {
  const context = await browser.newContext({ baseURL: 'http://localhost:4174/', locale: 'ru-RU', timezoneId: 'Europe/Moscow', viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.clock.setFixedTime(MON);
  return { context, page };
}

async function onboard(page: Page, name = 'Луна') {
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

async function signUp(page: Page, email: string) {
  const sheet = page.locator('dialog[open]');
  await sheet.getByRole('radio', { name: 'Новый аккаунт' }).click();
  await sheet.getByLabel('Почта').fill(email);
  await sheet.getByLabel('Пароль').fill(PASSWORD);
  await sheet.getByRole('button', { name: 'Создать аккаунт' }).click();
}

async function tap(page: Page, name: string, times: number) {
  for (let i = 0; i < times; i++) await page.getByRole('button', { name, exact: true }).click();
}

function tinyPng(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aussie-sync-'));
  const file = path.join(dir, 'luna.png');
  // 2×2, зелёный.
  fs.writeFileSync(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGNgaGBgYGBgYGBgAAAJBAGBk2PzgAAAAABJRU5ErkJggg==', 'base64'));
  return file;
}

const SYNC = { timeout: 20_000 };

test('Общая собака: муж создаёт, жена присоединяется по коду, данные и попытки сходятся', async ({ browser }) => {
  // ---------- Муж: собака, фото, аккаунт, «Сделать общей» ----------
  const husband = await phone(browser);
  const a = husband.page;
  await onboard(a);
  await a.getByRole('button', { name: 'Профиль собаки' }).click();
  await a.locator('input[type=file]').first().setInputFiles(tinyPng());
  await expect(a.getByRole('img', { name: 'Фото: Луна' }).first()).toBeVisible();

  await a.goto('/#/settings');
  await a.getByRole('button', { name: 'Войти или создать аккаунт' }).click();
  await signUp(a, 'sasha@example.com');
  await expect(a.getByText('Вы вошли как')).toBeVisible();
  await a.getByRole('button', { name: 'Сделать собаку общей' }).click();
  await a.locator('dialog[open]').getByLabel('Как подписывать ваши тренировки').fill('Саша');
  await a.locator('dialog[open]').getByRole('button', { name: 'Сделать общей' }).click();
  await expect(a.getByRole('heading', { name: 'Общая собака: Луна' })).toBeVisible();
  await expect(a.getByText(/Синхронизировано в/).first()).toBeVisible(SYNC);
  const label = await a.getByLabel(/^Код приглашения [A-Z0-9]/).getAttribute('aria-label');
  const code = label!.replace('Код приглашения', '').replace(/\s/g, '');
  expect(code).toMatch(/^[A-Z0-9]{8}$/);
  expect(mock.state.files.size).toBe(1);
  expect([...mock.state.records.values()].some((r: any) => r.store === 'dogs' && r.data.name === 'Луна')).toBe(true);

  // Муж начинает тренировку и отмечает 3 удачные попытки.
  await a.goto('/#/today');
  await a.getByRole('button', { name: 'Начать тренировку' }).first().click();
  await a.locator('dialog[open]').getByRole('radio', { name: /Дом/ }).click();
  await a.locator('dialog[open]').getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(a.getByRole('heading', { name: 'Контакт глазами' })).toBeVisible();
  await tap(a, 'Посмотрела', 3);
  await expect(a.getByText('Посмотрела: 3')).toBeVisible();

  // ---------- Жена: новый телефон, «Присоединиться к общей собаке» ----------
  const wife = await phone(browser);
  const b = wife.page;
  await b.goto('/');
  await b.getByRole('button', { name: 'Присоединиться к общей собаке' }).click();
  await signUp(b, 'anya@example.com');
  const join = b.locator('dialog[open]');
  await join.getByRole('textbox', { name: 'Код приглашения' }).fill(`${code.slice(0, 4).toLowerCase()} ${code.slice(4)}`);
  await join.getByLabel('Как подписывать ваши тренировки').fill('Аня');
  await join.getByRole('button', { name: 'Присоединиться' }).click();
  await expect(b.getByRole('heading', { name: 'Луна' })).toBeVisible(SYNC);
  await expect(b.getByRole('img', { name: 'Фото: Луна' }).first()).toBeVisible(SYNC);
  await expect(b.getByText('Идёт тренировка — проводит Саша')).toBeVisible(SYNC);

  // ---------- Одновременные попытки в одном упражнении ----------
  await b.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(b.getByRole('heading', { name: 'Контакт глазами' })).toBeVisible();
  await expect(b.getByText('Посмотрела: 3')).toBeVisible();
  await Promise.all([tap(b, 'Посмотрела', 2), tap(a, 'Не посмотрела', 1)]);
  for (const p of [a, b]) {
    await expect(p.getByText('Посмотрела: 5')).toBeVisible(SYNC);
    await expect(p.getByText('Не посмотрела: 1')).toBeVisible(SYNC);
  }

  // Муж завершает тренировку — у жены она появляется завершённой, с подписью «Саша».
  await a.getByRole('button', { name: 'Завершить тренировку' }).click();
  await a.getByRole('radio', { name: /^Спокойная/ }).click();
  await a.getByRole('button', { name: 'Сохранить тренировку' }).click();
  await expect(a.getByRole('heading', { name: 'Тренировка завершена' })).toBeVisible();
  await expect(a.getByText(/проводил\(а\) Саша/)).toBeVisible();
  await b.goto('/#/program/day/2026-11-09');
  await expect(b.getByText('6 попыт.', { exact: false })).toBeVisible(SYNC);
  await expect(b.getByText('· Саша')).toBeVisible();

  // ---------- Жена без сети: запись в дневник уходит, когда сеть возвращается ----------
  await b.goto('/#/today');
  await wife.context.setOffline(true);
  await b.goto('/#/journal');
  await b.getByRole('button', { name: 'Прошла мимо человека спокойно', exact: true }).click();
  await expect(b.getByText('Записано')).toBeVisible();
  await b.goto('/#/today');
  await expect(b.getByRole('button', { name: /Общая собака: Нет сети: 1/ })).toBeVisible(SYNC);
  await a.goto('/#/journal');
  await expect(a.getByRole('button', { name: /Хорошо Прошла мимо человека спокойно/ })).toHaveCount(0);
  await wife.context.setOffline(false);
  await expect(a.getByRole('button', { name: /Хорошо Прошла мимо человека спокойно/ })).toBeVisible(SYNC);
  await expect(b.getByRole('button', { name: /Общая собака: Синхронизировано/ })).toBeVisible(SYNC);

  // ---------- Правка с другой стороны и удаление ----------
  await a.getByRole('button', { name: /Хорошо Прошла мимо человека спокойно/ }).click();
  await a.getByLabel('Ситуация').fill('Сосед с самокатом');
  await a.getByRole('button', { name: 'Готово' }).click();
  await b.goto('/#/journal');
  await expect(b.getByText('Сосед с самокатом')).toBeVisible(SYNC);
  await a.getByText('Сосед с самокатом').click();
  await a.getByRole('button', { name: 'Удалить запись' }).click();
  await a.locator('dialog[open]').getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(b.getByText('Сосед с самокатом')).toHaveCount(0, SYNC);

  // После перезапуска жена остаётся подключённой, участники видны.
  await b.reload();
  await b.goto('/#/settings');
  await expect(b.getByRole('heading', { name: 'Общая собака: Луна' })).toBeVisible();
  await expect(b.getByText('Аня — это вы')).toBeVisible();
  await expect(b.getByText('Саша', { exact: true })).toBeVisible();

  // В облаке: одна стая, два участника, удачных попыток 5 — у обоих одинаково.
  expect(mock.state.packs.size).toBe(1);
  expect(mock.state.members.map((m: any) => m.display_name).sort()).toEqual(['Аня', 'Саша']);
  const res = [...mock.state.records.values()].filter((r: any) => r.store === 'results' && !r.deleted);
  expect(res.some((r: any) => r.data.successful === 5 && r.data.unsuccessful === 1)).toBe(true);

  await husband.context.close();
  await wife.context.close();
});

test('Неверный код приглашения и чужая стая', async ({ browser }) => {
  const p = await phone(browser);
  const page = p.page;
  await page.goto('/');
  await page.getByRole('button', { name: 'Присоединиться к общей собаке' }).click();
  await signUp(page, 'guest@example.com');
  const sheet = page.locator('dialog[open]');
  await sheet.getByRole('textbox', { name: 'Код приглашения' }).fill('ZZZZ2222');
  await sheet.getByRole('button', { name: 'Присоединиться' }).click();
  await expect(sheet.getByRole('alert')).toHaveText(/Код приглашения не найден/);
  // Чужой пользователь не может читать данные стаи, даже зная её id.
  const packId = [...mock.state.packs.keys()][0];
  const r = await page.evaluate(async (pid) => {
    const s = JSON.parse(localStorage.getItem('aussie-trainer:session')!);
    const res = await fetch('http://127.0.0.1:54400/rest/v1/rpc/aussie_pull', { method: 'POST', headers: { apikey: 'sb_publishable_e2e_key_000000', Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_pack: pid, p_since: null, p_limit: 10 }) });
    return { status: res.status, text: await res.text() };
  }, packId);
  expect(r.status).toBe(400);
  expect(r.text).toMatch(/не участник/);
  await p.context.close();
});
