import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const resources = process.env.FOCUS_RESOURCES || path.join(root, 'safari/Focus/Focus Extension/Resources');
const read = name => readFileSync(path.join(resources, name), 'utf8');
const today = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function background(seed = {}) {
  const local = structuredClone(seed), session = {}, updates = [];
  const listeners = {};
  let now = new Date(2026, 9, 30, 12), rejectUpdates = false;
  const event = key => ({ addListener: listener => { listeners[key] = listener; }, hasListener: listener => listeners[key] === listener });
  const area = data => ({
    async get(keys) { return structuredClone(Object.fromEntries(keys.filter(k => k in data).map(k => [k, data[k]]))); },
    async set(values) { Object.assign(data, structuredClone(values)); },
    async remove(keys) { keys.forEach(key => delete data[key]); },
  });
  const chrome = {
    storage: { local: area(local), session: area(session) },
    runtime: {
      getURL: name => `safari-web-extension://focus-test/${name}`,
      onInstalled: event('installed'), onMessage: event('message'),
    },
    webNavigation: { onBeforeNavigate: event('before'), onCommitted: event('committed') },
    tabs: {
      onRemoved: event('removed'),
      update: async (tabId, properties) => {
        if (rejectUpdates) throw new Error('Tab no longer exists');
        updates.push({ tabId, ...properties });
      },
    },
  };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now.getTime(); }
  }
  const context = vm.createContext({ chrome, URL, console: { ...console, debug() {} }, Date: Clock });
  vm.runInContext(read('background.js'), context);
  return {
    local, session, updates, listeners,
    rejectUpdates() { rejectUpdates = true; },
    nextDay() { now = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12); },
    day: () => today(now),
    navigate: async (url, tabId = 1, frameId = 0) => {
      const details = { url, tabId, frameId };
      await listeners.before?.(details);
      await listeners.committed?.(details);
    },
    message: (request, tabId = 1) => new Promise((resolve, reject) => {
      if (listeners.message(request, { tab: { id: tabId } }, resolve) !== true) reject(new Error('Missing async response channel'));
    }),
  };
}

test('Safari resources retain Chrome 1.5 behavior with Safari manifest adaptations', () => {
  for (const name of ['background.js', 'popup.js', 'settings.js', 'confirm.js', 'redirect.js', 'popup.html', 'settings.html', 'confirm.html', 'redirect.html', 'styles.css']) {
    assert.equal(read(name), readFileSync(path.join(root, name), 'utf8'), name);
  }
  const manifest = JSON.parse(read('manifest.json'));
  assert.deepEqual(manifest.host_permissions, ['http://*/*', 'https://*/*']);
  delete manifest.host_permissions;
  assert.deepEqual(manifest.background, { scripts: ['background.js'], persistent: false });
  manifest.background = { service_worker: 'background.js' };
  assert.deepEqual(manifest, JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8')));
  for (const icon of Object.values(manifest.icons)) {
    assert.deepEqual(readFileSync(path.join(resources, icon)), readFileSync(path.join(root, icon)));
  }
});

test('live diagnostics distinguish missing defaults, explicit empty rules, allow rules and redirect errors without mutating rules', async () => {
  const missing = background();
  let info = await missing.message({ action: 'getNavigationDiagnostics' });
  assert.equal(info.build, 'safari-nav-20261109');
  assert.equal(info.stored.blockedSites, undefined);
  assert.equal(info.effective.blockedSites.some(s => s.domain === 'youtube.com'), true);
  assert.deepEqual(structuredClone(info.listeners), { before: true, committed: true });
  assert.equal(missing.local.blockedSites, undefined);

  const empty = background({ blockedSites: [] });
  await empty.navigate('https://www.youtube.com/private?token=secret');
  info = await empty.message({ action: 'getNavigationDiagnostics' });
  assert.equal(info.events.at(-1).stage, 'no-block-rule');
  assert.equal(info.effective.blockedSites.length, 0);

  const allowed = background({ allowList: ['youtube.com'] });
  await allowed.navigate('https://www.youtube.com/');
  info = await allowed.message({ action: 'getNavigationDiagnostics' });
  assert.equal(info.events.at(-1).stage, 'allowed');

  missing.rejectUpdates();
  await missing.navigate('https://www.youtube.com/private?token=secret');
  info = await missing.message({ action: 'getNavigationDiagnostics' });
  assert.equal(info.events.at(-1).stage, 'error');
  assert.equal(info.events.at(-1).error, 'Tab no longer exists');
  for (let n = 0; n < 20; n++) await empty.navigate('https://www.youtube.com/private?token=secret');
  info = await empty.message({ action: 'getNavigationDiagnostics' });
  assert.equal(info.events.length, 32);
  assert.equal(JSON.stringify(info.events).includes('private'), false);
  assert.equal(JSON.stringify(info.events).includes('secret'), false);
  assert.equal(empty.local.blockedSites.length, 0);
});

test('confirmation reports tabs.update rejection instead of claiming a successful entry', async () => {
  const limited = background({ blockedSites: [{ domain: 'youtube.com', name: 'YouTube', dailyLimit: 1 }] });
  limited.rejectUpdates();
  let result = await limited.message({ action: 'confirmVisit', domain: 'youtube.com', target: 'https://www.youtube.com/' });
  assert.equal(result.success, false);
  assert.equal(result.error, 'Tab no longer exists');
  const changed = background({ blockedSites: [] });
  changed.rejectUpdates();
  result = await changed.message({ action: 'confirmVisit', domain: 'youtube.com', target: 'https://www.youtube.com/' });
  assert.equal(result.success, false);
  assert.equal(result.error, 'Tab no longer exists');
});

test('blocks main-frame domains/subdomains, prioritizes domain/path allow rules', async () => {
  const b = background();
  await b.listeners.installed();
  await b.navigate('https://creator.xiaohongshu.com/publish');
  await b.navigate('https://youtube.com/watch', 1, 2);
  await b.navigate('https://notyoutube.com/');
  assert.equal(b.updates.length, 0);
  await b.navigate('https://www.youtube.com/watch?v=1');
  const redirect = new URL(b.updates.at(-1).url);
  assert.equal(redirect.protocol, 'safari-web-extension:');
  assert.equal(redirect.pathname, '/redirect.html');
  assert.equal(redirect.searchParams.get('domain'), 'youtube.com');
  assert.equal(b.local.visitStats[b.day()]['youtube.com'], 1);
  await b.message({ action: 'addAllowRule', rule: 'https://space.bilibili.com/12345/' });
  await b.navigate('https://space.bilibili.com/12345/video');
  assert.equal(b.updates.length, 1);
  await b.navigate('https://space.bilibili.com/123456');
  assert.equal(b.updates.length, 2);
});

test('confirmation counts once, survives background reload, expires on exit and next day', async () => {
  const b = background({ blockedSites: [{ domain: 'youtube.com', name: 'YouTube', dailyLimit: 1 }] });
  const url = 'https://www.youtube.com/watch?v=1&list=2';
  await b.navigate(url);
  const confirm = new URL(b.updates.at(-1).url);
  assert.equal(confirm.pathname, '/confirm.html');
  assert.equal(confirm.searchParams.get('target'), url);
  assert.equal(b.local.dailyVisitCounts, undefined);
  const result = await b.message({ action: 'confirmVisit', domain: 'youtube.com', target: url });
  assert.equal(result.success, true);
  assert.equal(b.local.dailyVisitCounts[b.day()]['youtube.com'], 1);
  await b.navigate(url);
  await b.navigate('https://youtube.com/another');
  assert.equal(b.updates.length, 2);
  // A separate background VM with restored storage has the same visit pass.
  const restarted = background(b.local);
  Object.assign(restarted.session, structuredClone(b.session));
  await restarted.navigate(url);
  assert.equal(restarted.updates.length, 0);
  await b.navigate('https://example.com/');
  await b.navigate(url);
  assert.equal(new URL(b.updates.at(-1).url).pathname, '/redirect.html');
  assert.equal((await b.message({ action: 'confirmVisit', domain: 'youtube.com', target: url }, 2)).exhausted, true);
  b.nextDay();
  await b.navigate(url);
  assert.equal(new URL(b.updates.at(-1).url).pathname, '/confirm.html');
  assert.equal((await b.message({ action: 'confirmVisit', domain: 'youtube.com', target: url })).success, true);
  assert.deepEqual(Object.keys(b.local.dailyVisitCounts), [b.day()]);
});

test('settings messages edit daily limits and allow rules; popup receives remaining counts', async () => {
  const b = background({ blockedSites: [] });
  assert.equal((await b.message({ action: 'addBlockedSite', domain: 'example.com', name: '测试', dailyLimit: 2 })).success, true);
  await b.message({ action: 'updateBlockedSite', domain: 'example.com', name: '测试', dailyLimit: 3 });
  const info = await b.message({ action: 'getDailyVisitInfo' });
  assert.equal(info.info[0].dailyLimit, 3);
  assert.equal(info.info[0].used, 0);
  await b.message({ action: 'updateBlockedSite', domain: 'example.com', name: '测试', dailyLimit: 0 });
  await b.navigate('https://example.com');
  assert.equal(new URL(b.updates.at(-1).url).pathname, '/redirect.html');
  await b.message({ action: 'addAllowRule', rule: 'example.com/path' });
  await b.message({ action: 'removeAllowRule', rule: 'example.com/path' });
  assert.equal((await b.message({ action: 'getAllowList' })).rules.includes('example.com/path'), false);
  await b.message({ action: 'removeBlockedSite', domain: 'example.com' });
  assert.equal((await b.message({ action: 'getBlockedSites' })).sites.length, 0);
});

test('1.5 migration preserves lists/counts and removes obsolete fields', async () => {
  const b = background({ blockedSites: [{ domain: 'example.com', dailyLimit: 2, avgTime: 10 }], visitStats: { day: { 'example.com': 4 } }, disableEndTime: 999, avgTime: 20 });
  await b.listeners.installed();
  assert.equal(b.local.blockedSites[0].dailyLimit, 2);
  assert.equal('avgTime' in b.local.blockedSites[0], false);
  assert.equal('disableEndTime' in b.local, false);
  assert.equal('avgTime' in b.local, false);
  assert.equal(b.local.visitStats.day['example.com'], 4);
});

test('typed confirmation blocks paste/drop/replacement but permits IME composition', () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', disabled: false, textContent: '', classList: { toggle() {}, remove() {}, add() {} }, handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn; } });
    return elements.get(id);
  };
  const context = vm.createContext({ URLSearchParams, window: { location: { search: '?site=YouTube' } }, document: { addEventListener() {}, getElementById: element, body: { classList: { toggle() {} } } } });
  vm.runInContext(read('confirm.js'), context);
  vm.runInContext("guardInput(document.getElementById('phraseInput'))", context);
  const input = element('phraseInput');
  for (const type of ['paste', 'drop', 'dragover']) {
    let prevented = false;
    input.handlers[type]({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  }
  for (const inputType of ['insertFromPaste', 'insertFromDrop', 'insertReplacementText', 'insertFromYank', 'insertCompositionText']) {
    let prevented = false;
    input.handlers.beforeinput({ inputType, preventDefault() { prevented = true; } });
    assert.equal(prevented, inputType !== 'insertCompositionText');
  }
  input.value = 'wrong'; input.handlers.input();
  assert.equal(element('confirmBtn').disabled, true);
  input.value = '是的，我确定一定以及肯定现在就要访问 ＹｏｕＴｕｂｅ'; input.handlers.input();
  assert.equal(element('confirmBtn').disabled, false);
});
