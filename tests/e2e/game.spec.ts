import { test, expect, type Browser, type Page, type BrowserContext } from '@playwright/test';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createGameServer } from '../../apps/server/src/server';
import {
  createDeck,
  DEFAULT_OPTIONS,
  type Game,
  type Options,
} from '../../packages/game-engine/src/index';
let server: ReturnType<typeof createGameServer>;
const contexts: BrowserContext[] = [];
test.beforeEach(async () => {
  server = createGameServer({
    origins: ['http://127.0.0.1:3101'],
    webRoot: resolve('apps/web/dist'),
    shuffle: (cards) => cards,
  });
  await new Promise<void>((done) => server.http.listen(3101, '127.0.0.1', done));
});
test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
  await server.close();
});
async function page(browser: Browser, mobile = false) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 375, height: 812 } : { width: 1440, height: 1000 },
  });
  contexts.push(context);
  const p = await context.newPage();
  await p.goto('/');
  await expect(p.getByText('Connected', { exact: true })).toBeVisible();
  return p;
}
async function table(browser: Browser, count = 2) {
  const a = await page(browser);
  await a.getByLabel('Your name').fill('Ada');
  await a.getByRole('button', { name: 'Create a table' }).click();
  await expect(a.getByText('Your table is ready.')).toBeVisible();
  const code = await a.locator('.room-code strong').innerText();
  const all = [a];
  for (let i = 1; i < count; i++) {
    const b = await page(browser);
    await b.getByLabel('Your name').fill(`Friend ${i}`);
    await b
      .getByRole('button', {
        name: ['Hearts', 'Spades', 'Diamonds', 'Clubs'][count === 2 ? 2 : i],
        exact: true,
      })
      .click();
    await b.getByLabel('Room code', { exact: true }).fill(code);
    await b.getByRole('button', { name: 'Join table' }).click();
    await expect(b.getByText('Your table is ready.')).toBeVisible();
    all.push(b);
  }
  for (const p of all) {
    await p.getByRole('button', { name: 'I’m ready', exact: true }).click();
    await expect(p.getByRole('button', { name: 'Ready ✓ · undo' })).toBeVisible();
  }
  await expect(a.getByRole('button', { name: 'Start the game' })).toBeEnabled();
  await a.getByRole('button', { name: 'Start the game' }).click();
  for (const p of all) await expect(p.getByText('The race is on.')).toBeVisible();
  return all;
}
function fixture(rank: number, setup: (g: Game) => void, options: Partial<Options> = {}) {
  const r = server.rooms.values().next().value!;
  const g = r.game!;
  g.turn = 0;
  g.phase = 'playing';
  g.winner = null;
  g.pendingDiscard = null;
  g.skips = { 0: 0, 1: 0, 2: 0, 3: 0 };
  g.options = { ...DEFAULT_OPTIONS, ...options };
  r.options = { ...g.options };
  r.phase = 'playing';
  for (const m of g.marbles) {
    m.location = { kind: 'break' };
    m.progress = 0;
    m.eligible = false;
  }
  g.hands = { 0: [{ id: `0-${rank}`, rank, suit: 0 }], 1: [], 2: [], 3: [] };
  for (const s of g.seats) if (s !== 0) g.hands[s] = [{ id: `${s}-2`, rank: 2, suit: s }];
  const ids = Object.values(g.hands)
    .flat()
    .map((c) => c.id);
  g.deck = createDeck().filter((c) => !ids.includes(c.id));
  g.discard = [];
  setup(g);
  r.version++;
  server.publish(r);
  return r;
}
function track(g: Game, id: string, index: number, progress = 0) {
  const m = g.marbles.find((m) => m.id === id)!;
  m.location = { kind: 'track', index };
  m.progress = progress;
  m.eligible = progress >= 72;
}
async function select(p: Page, rank: string, suit = '♥') {
  await p.getByRole('button', { name: `Select ${rank}${suit}`, exact: true }).click();
}
async function confirm(p: Page, label: RegExp) {
  await p.getByRole('button', { name: label }).click();
  await p.getByRole('button', { name: /^Confirm move/ }).click();
}
test('desktop and mobile landing, keyboard rules and no horizontal overflow', async ({
  browser,
}) => {
  const desktop = await page(browser);
  await expect(desktop.getByRole('heading', { name: /A little luck/ })).toBeVisible();
  await desktop.screenshot({ path: 'test-results/landing-desktop.png', fullPage: true });
  const mobile = await page(browser, true);
  expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await mobile.getByRole('button', { name: /How to play/ }).focus();
  await mobile.keyboard.press('Enter');
  await expect(mobile.getByRole('dialog')).toBeVisible();
  await mobile.keyboard.press('Escape');
  await expect(mobile.getByRole('dialog')).toHaveCount(0);
  await mobile.screenshot({ path: 'test-results/landing-mobile.png', fullPage: true });
});
test('isolated browsers synchronize a legal turn and preserve private hands on refresh', async ({
  browser,
}) => {
  const [a, b] = await table(browser);
  const r = fixture(1, () => {});
  await select(a!, 'A');
  await confirm(a!, /A♥: start Hearts 1/);
  expect(r.game!.marbles[0]!.location.kind).toBe('track');
  await expect(b!.getByText('Hearts played A♥ · start')).toBeVisible();
  const before = await b!.locator('.playing-card').allTextContents();
  await b!.reload();
  await expect(b!.getByText('The race is on.')).toBeVisible();
  await expect(b!.locator('.playing-card')).toHaveCount(1);
  expect(await b!.locator('.playing-card').allTextContents()).toEqual(before);
  await expect(a!.getByText(/game is paused/)).toHaveCount(0);
  await a!.screenshot({ path: 'test-results/game-desktop.png', fullPage: true });
});
test('finishes an individual match and returns both players to rematch lobby', async ({
  browser,
}) => {
  const [a, b] = await table(browser);
  fixture(1, (g) => {
    for (let i = 0; i < 3; i++) g.marbles[i]!.location = { kind: 'home', slot: 3 - i };
    track(g, '0:3', 0, 72);
  });
  await select(a!, 'A');
  await confirm(a!, /A♥: move Hearts 4/);
  for (const p of [a!, b!])
    await expect(p.getByRole('heading', { name: 'Ada won!' })).toBeVisible();
  await a!.getByRole('button', { name: /Back to lobby/ }).click();
  await expect(b!.getByText('Your table is ready.')).toBeVisible();
});
test('heaven entry, capture and exit choices', async ({ browser }) => {
  const [a] = await table(browser);
  let r = fixture(10, (g) => {
    track(g, '0:0', 10, 20);
    g.marbles.find((m) => m.id === '2:0')!.location = { kind: 'heaven' };
  });
  await select(a!, '10');
  await confirm(a!, /10♥: Hearts 1 to heaven/);
  expect(r.game!.marbles.find((m) => m.id === '2:0')!.location.kind).toBe('break');
  r = fixture(1, (g) => {
    g.marbles[0]!.location = { kind: 'heaven' };
  });
  await select(a!, 'A');
  await confirm(a!, /A♥: Hearts 1 to track 46/);
  expect(r.game!.marbles[0]!.location).toEqual({ kind: 'track', index: 46 });
});
test('Jack, backward four, opponent five and King sweep', async ({ browser }) => {
  const [a] = await table(browser);
  let r = fixture(11, (g) => {
    track(g, '0:0', 4);
    track(g, '2:0', 20);
  });
  await select(a!, 'J');
  await confirm(a!, /J♥: swap Hearts 1 with Diamonds 1/);
  expect(r.game!.marbles[0]!.location).toEqual({ kind: 'track', index: 20 });
  r = fixture(4, (g) => track(g, '0:0', 5), { backward4: true });
  await select(a!, '4');
  await confirm(a!, /4♥: move Hearts 1/);
  expect(r.game!.marbles[0]!.location).toEqual({ kind: 'track', index: 1 });
  r = fixture(
    5,
    (g) => {
      track(g, '2:0', 10);
      track(g, '0:0', 15);
    },
    { opponent5: true },
  );
  await select(a!, '5');
  await confirm(a!, /5♥: move Diamonds 1/);
  expect(r.game!.marbles[0]!.location.kind).toBe('break');
  r = fixture(
    13,
    (g) => {
      track(g, '0:0', 1);
      track(g, '0:1', 3);
      track(g, '2:0', 6);
    },
    { sweepKing: true },
  );
  await select(a!, 'K');
  await confirm(a!, /K♥: move Hearts 1/);
  expect(r.game!.marbles[1]!.location.kind).toBe('break');
  expect(r.game!.marbles.find((m) => m.id === '2:0')!.location.kind).toBe('break');
});
test('split seven allocation and private discard-and-skip', async ({ browser }) => {
  const [a, b] = await table(browser);
  let r = fixture(
    7,
    (g) => {
      track(g, '0:0', 1);
      track(g, '0:1', 20);
    },
    { split7: true },
  );
  await select(a!, '7');
  await a!.getByRole('button', { name: '♥ Marble 1 · 3 steps', exact: true }).click();
  await a!.getByRole('button', { name: '♥ Marble 2 · 4 steps', exact: true }).click();
  await a!.getByRole('button', { name: 'Confirm seven steps' }).click();
  expect(r.game!.marbles[0]!.location).toEqual({ kind: 'track', index: 4 });
  r = fixture(10, () => {}, { skip10: true });
  await select(a!, '10');
  await confirm(a!, /10♥: discard & skip next player/);
  await select(b!, '2', '♦');
  await b!.getByRole('button', { name: 'Discard 2♦', exact: true }).click();
  await b!.getByRole('button', { name: 'Confirm discard' }).click();
  expect(r.game!.pendingDiscard).toBeNull();
});
test('four browsers complete a partnership win', async ({ browser }) => {
  const all = await table(browser, 4);
  fixture(
    1,
    (g) => {
      for (let i = 0; i < 4; i++)
        g.marbles.find((m) => m.id === `2:${i}`)!.location = { kind: 'home', slot: i };
      for (let i = 0; i < 3; i++) g.marbles[i]!.location = { kind: 'home', slot: 3 - i };
      track(g, '0:3', 0, 72);
    },
    { teams: true },
  );
  await select(all[0]!, 'A');
  await confirm(all[0]!, /A♥: move Hearts 4/);
  for (const p of all)
    await expect(p.getByRole('heading', { name: 'Ada & Friend 2 won!' })).toBeVisible();
});
test('three-player mobile game supports keyboard moves and forced discard after card selection', async ({
  browser,
}) => {
  const all = await table(browser, 3);
  const a = all[0]!;
  await a.setViewportSize({ width: 375, height: 812 });
  const r = fixture(1, () => {});
  await a.getByRole('button', { name: 'Select A♥', exact: true }).focus();
  await a.keyboard.press('Enter');
  await a.getByRole('button', { name: 'A♥: start Hearts 1', exact: true }).focus();
  await a.keyboard.press('Enter');
  await a.getByRole('button', { name: /^Confirm move/ }).focus();
  await a.keyboard.press('Enter');
  expect(r.game!.marbles[0]!.location.kind).toBe('track');
  fixture(2, () => {});
  await select(a, '2');
  await a.getByRole('button', { name: /No legal moves · discard remaining hand/ }).click();
  await a.getByRole('button', { name: /^Confirm move/ }).click();
  expect(r.game!.hands[0]).toHaveLength(0);
  expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await a.screenshot({ path: 'test-results/game-mobile.png', fullPage: true });
});
test('built production entry serves the app and accepts same-origin rooms', async ({ browser }) => {
  const child = spawn(process.execPath, ['apps/server/dist/index.js'], {
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '3102',
      CLIENT_ORIGIN: 'http://127.0.0.1:3102',
      SESSION_SECRET: randomBytes(48).toString('hex'),
    },
  });
  const exited = new Promise<void>((done) => child.once('exit', () => done()));
  try {
    await expect
      .poll(
        async () => {
          try {
            return (await fetch('http://127.0.0.1:3102/health')).status;
          } catch {
            return 0;
          }
        },
        { timeout: 10000 },
      )
      .toBe(200);
    const context = await browser.newContext();
    contexts.push(context);
    const p = await context.newPage();
    await p.goto('http://127.0.0.1:3102');
    await expect(p.getByText('Connected', { exact: true })).toBeVisible();
    await p.getByLabel('Your name').fill('Production guest');
    await p.getByRole('button', { name: 'Create a table' }).click();
    await expect(p.getByText('Your table is ready.')).toBeVisible();
  } finally {
    child.kill();
    await exited;
  }
});
