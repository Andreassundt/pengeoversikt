import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');
const EXPORT1 = [
  'Transaksjonsliste-07-11-25-07-11-26.csv',
  'Transaksjonsliste-07-11-25-07-11-26_1.csv',
  'Transaksjonsliste-07-11-25-07-11-26_2.csv',
  'Transaksjonsliste-07-11-25-07-11-26_3.csv',
  'Transaksjonsliste-07-11-25-07-11-26_4.csv',
].map((f) => path.join(FIXTURES, 'eksport-1', f));

const plain = (s: string) => s.replace(/[  ]/g, ' ').trim();

async function pickForLine(page: Page, lineText: RegExp, category: string) {
  const line = page.getByTestId('person-line').filter({ hasText: lineText });
  await expect(line).toHaveCount(1);
  await line.getByRole('button', { name: category, exact: true }).click();
  await expect(line).toContainText(`→ ${category}`);
}

test('importerer eksport-1, kjører oppsettet og viser oktober 2026', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ingen data ennå' })).toBeVisible();

  await page.getByTestId('import-button').click();
  await page.getByTestId('file-input').setInputFiles(EXPORT1);
  await expect(page.getByTestId('import-file')).toHaveCount(5);
  await expect(page.getByTestId('import-file').filter({ hasText: 'Sparing' })).toContainText('200,00');
  await page.getByTestId('confirm-import').click();

  // Wizard, step 1: accounts.
  await expect(page.getByRole('heading', { name: /Oppsett 1\/4/ })).toBeVisible();
  await page.getByTestId('wizard-next').click();

  // Step 2: persons – the test setup.
  await expect(page.getByRole('heading', { name: /Oppsett 2\/4/ })).toBeVisible();
  await pickForLine(page, /Fra Mia Leietaker Hansen → Bolig/, 'Leieinntekt');
  await pickForLine(page, /Fra Mia Leietaker Hansen → Brukskonto/, 'Delt husholdning');
  await pickForLine(page, /Til Mia Leietaker Hansen/, 'Delt husholdning');
  await page.getByTestId('wizard-next').click();
  await expect(page.getByRole('heading', { name: /Oppsett 3\/4/ })).toBeVisible();
  await page.getByTestId('wizard-next').click();
  await expect(page.getByRole('heading', { name: /Oppsett 4\/4/ })).toBeVisible();
  await page.getByTestId('wizard-finish').click();
  await expect(page.getByTestId('month-title')).toBeVisible();

  // Overview for October 2026.
  await page.goto('/#/?m=2026-10');
  await expect(page.getByTestId('month-title')).toHaveText('oktober 2026');
  await expect(page.getByTestId('sum-forbruk-full')).toHaveText(/61\s878,87/);
  await expect(page.getByTestId('normalt-forbruk')).toHaveText(/39\s879,37/);
  expect(plain(await page.getByTestId('inntekt').innerText())).toBe('48 278');
  expect(plain(await page.getByTestId('sum-forbruk').innerText())).toBe('61 879');
  await expect(page.getByTestId('netto-spart')).toHaveText(/13\s601/);
});
