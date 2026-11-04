import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const MODEL = resolve(root, 'samples/office-3f.glb');

test('success criteria: model to acknowledged alarm on the dashboard', async ({
  page,
  request,
}) => {
  let key = '';
  const event = () => ({
    deviceId: 'cam-e2e-1',
    eventType: 'intrusion',
    occurredAt: new Date().toISOString(),
    x: 0,
    y: 0,
    objectId: 'p-1',
    objectType: 'person',
  });

  await test.step('log in', async () => {
    await page.goto('/login');
    await page.getByTestId('login-username').fill('admin');
    await page.getByTestId('login-password').fill('e2e-password-123');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('nav-badge')).toBeVisible();
  });

  await test.step('create the site', async () => {
    await page.goto('/settings/sites');
    await page.getByTestId('site-create-name').fill('E2E Office');
    await page.getByTestId('site-create-submit').click();
    await page.getByTestId('site-row').filter({ hasText: 'E2E Office' }).getByRole('link').click();
    await expect(page.getByRole('heading', { name: 'E2E Office' })).toBeVisible();
  });

  await test.step('upload the model and apply the floor suggestion', async () => {
    await page.getByTestId('model-file-input').setInputFiles(MODEL);
    await page.getByTestId('floor-apply-suggestion').click();
    const rows = page.getByTestId('floor-row');
    await expect(rows).toHaveCount(3);
    for (const [i, name] of ['1F', '2F', '3F'].entries()) {
      await expect(rows.nth(i).getByRole('textbox').first()).toHaveValue(name);
    }
    await page.getByTestId('floors-save').click();
    await expect(page.getByRole('status').filter({ hasText: /saved/i })).toBeVisible();
  });

  await test.step('place a camera', async () => {
    await page
      .getByRole('link', { name: /devices/i })
      .first()
      .click();
    await page.getByTestId('floor-option').filter({ hasText: /^1F$/ }).click();
    await page.getByTestId('view-top').click();
    await page.getByTestId('tool-place-camera').click();
    const canvas = page.getByTestId('canvas-3d');
    await expect(canvas).toHaveAttribute('data-model-state', 'ready');
    await expect(page.getByTestId('view-top')).toBeEnabled();
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('device-form-id')).toBeVisible();
    await page.getByTestId('device-form-id').fill('cam-e2e-1');
    await page.getByTestId('device-form-yaw').fill('90');
    await page.getByTestId('device-form-save').click();
    const row = page.getByTestId('device-row').filter({ hasText: 'cam-e2e-1' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('1F');
  });

  await test.step('create an integration key', async () => {
    await page.goto('/settings/keys');
    await page.getByTestId('key-create-name').fill('e2e');
    await page.getByTestId('key-create-submit').click();
    const plain = page.getByTestId('key-plaintext');
    await expect(plain).toBeVisible();
    key = ((await plain.textContent()) ?? '').trim();
    expect(key.length).toBeGreaterThan(10);
    await page.getByRole('button', { name: /close/i }).click();
    await expect(plain).toHaveCount(0);
  });

  await test.step('first event raises an alarm', async () => {
    await page.getByRole('link', { name: /monitor/i }).click();
    await expect(page.getByTestId('realtime-status')).toHaveAttribute('data-state', 'open');
    const siteId = new URL(page.url()).pathname.split('/')[2];
    await expect(page.getByTestId('realtime-status')).toHaveAttribute('data-snapshot', siteId);
    const res = await request.post('/api/ingest/events', {
      headers: { Authorization: `Bearer ${key}` },
      data: event(),
    });
    expect(res.status()).toBe(201);
    await expect(page.getByTestId('alarm-item')).toHaveCount(1);
    await expect(page.getByTestId('alarm-item')).toContainText('intrusion');
    await expect(page.getByTestId('kpi-unacked')).toHaveText('1');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const w = window as unknown as {
            __dtStore: { getState(): { objects: Map<string, unknown> } };
          };
          return [...w.__dtStore.getState().objects.keys()].some((k) => k.endsWith('p-1'));
        }),
      )
      .toBe(true);
  });

  await test.step('second event merges into the alarm', async () => {
    const res = await request.post('/api/ingest/events', {
      headers: { Authorization: `Bearer ${key}` },
      data: event(),
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'merged' });
    await expect(page.getByTestId('alarm-count')).toHaveText('×2');
    await expect(page.getByTestId('nav-badge')).toHaveText('1');
  });

  await test.step('screenshot', async () => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(root, 'e2e/artifacts/monitor.png') });
  });

  await test.step('acknowledge', async () => {
    await page.getByTestId('alarm-ack').click();
    await expect(page.getByTestId('kpi-unacked')).toHaveText('0');
    await expect(page.getByTestId('alarm-item')).toHaveCount(0);
  });

  await test.step('dashboard counts the event', async () => {
    await page.getByRole('link', { name: /dashboard/i }).click();
    await expect(page.getByTestId('stats-timeseries-total')).toHaveText('1');
    const byType = page.getByTestId('stats-bytype');
    await expect(byType.getByRole('listitem').filter({ hasText: 'intrusion' })).toContainText('1');
  });
});
