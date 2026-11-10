import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const test = (name, run) => nodeTest(name, { timeout: 1000 }, run);
const youtube = 'https://www.youtube.com/';
const other = 'https://example.com/';
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

// Explicitly drive browser events, independently of tabs.update(). In particular,
// an early update is NOT assumed to cancel an outstanding browser navigation.
function browser(source, scheme) {
  const handlers = {}, updates = [], errors = [], local = {}, session = {};
  const urls = new Map();
  let pauseRead, rejectUpdate = false;
  const event = name => ({ addListener(fn) { handlers[name] = fn; } });
  const storage = data => ({
    async get(keys) {
      if (pauseRead && (!pauseRead.key || keys.includes(pauseRead.key))) {
        const gate = pauseRead;
        pauseRead = undefined;
        await gate.promise;
      }
      return structuredClone(Object.fromEntries(keys.filter(key => key in data).map(key => [key, data[key]])));
    },
    async set(values) { Object.assign(data, structuredClone(values)); },
    async remove(keys) { keys.forEach(key => delete data[key]); },
  });
  const chrome = {
    runtime: {
      getURL: name => `${scheme}://focus-test/${name}`,
      onInstalled: event('installed'), onMessage: event('message'),
    },
    storage: { local: storage(local), session: storage(session) },
    webNavigation: { onBeforeNavigate: event('before'), onCommitted: event('committed') },
    tabs: {
      onRemoved: event('removed'),
      async update(tabId, { url }) {
        if (rejectUpdate === true || rejectUpdate === tabId) throw new Error('Tab no longer exists');
        updates.push({ tabId, url });
        urls.set(tabId, url);
      },
      async query() {
        return [...urls].map(([id, url]) => ({ id, url, active: id === activeTab }));
      },
    },
  };
  let activeTab = 1;
  vm.runInNewContext(source, { chrome, URL, setTimeout, console: { error: (...args) => errors.push(args) } });
  return {
    local, session, urls, updates, errors,
    pause(key) { pauseRead = { ...deferred(), key }; return pauseRead; },
    rejectUpdates(value = true) { rejectUpdate = value; },
    show(tabId, url) { urls.set(tabId, url); activeTab = tabId; },
    async emit(name, url, tabId = 1, frameId = 0) {
      if (name === 'committed' && frameId === 0) urls.set(tabId, url);
      await handlers[name]?.({ url, tabId, frameId });
      await tick();
    },
    async remove(tabId = 1) { await handlers.removed(tabId); await tick(); },
  };
}

for (const [platform, scheme, file] of [
  ['Chrome MV3', 'chrome-extension', new URL('background.js', root)],
  ['Safari event page', 'safari-web-extension', new URL('safari/Focus/Focus Extension/Resources/background.js', root)],
]) {
  const source = readFileSync(process.env.FOCUS_BACKGROUND_SOURCE || file, 'utf8');
  const setup = () => browser(source, scheme);
  const blocked = b => {
    const url = new URL(b.urls.get(1));
    assert.equal(url.protocol, `${scheme}:`);
    assert.equal(url.pathname, '/redirect.html');
    assert.equal(url.searchParams.get('domain'), 'youtube.com');
    return url;
  };

  test(`${platform}: a provisional navigation that outlives an early redirect is still blocked at commit`, async () => {
    const b = setup();
    await b.emit('before', youtube);
    // Model the browser committing the original navigation after any early update.
    await b.emit('committed', youtube);
    const redirect = blocked(b);
    assert.equal(redirect.searchParams.get('count'), '1');
    // Deliver the extension's own full navigation lifecycle; it must stay put.
    await b.emit('before', redirect.href);
    await b.emit('committed', redirect.href);
    assert.equal(b.urls.get(1), redirect.href);
    assert.equal(b.updates.length, 1);
  });

  test(`${platform}: a committed blocked page is intercepted without an observed before event`, async () => {
    const b = setup();
    await b.emit('committed', youtube);
    blocked(b);
  });

  test(`${platform}: repeated blocked commits cannot leave the website visible`, async () => {
    const b = setup();
    await b.emit('committed', youtube);
    blocked(b);
    await b.emit('committed', youtube);
    blocked(b);
    assert.equal(b.updates.length, 2);
  });

  test(`${platform}: aborted provisional departures preserve a confirmed daily visit`, async () => {
    const b = setup();
    b.local.blockedSites = [{ domain: 'youtube.com', name: 'YouTube', dailyLimit: 1 }];
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const visit = `${day}|youtube.com`;
    b.session.tabVisits = { 1: visit };
    await b.emit('before', other); // Aborted: no commit on the other site.
    assert.equal(b.session.tabVisits[1], visit);
    await b.emit('committed', youtube);
    assert.equal(b.updates.length, 0);
    await b.emit('before', other);
    await b.emit('committed', other);
    await b.emit('committed', youtube);
    assert.equal(new URL(b.urls.get(1)).pathname, '/confirm.html');
  });

  test(`${platform}: an unblocked commit or an iframe never redirects`, async () => {
    const b = setup();
    await b.emit('committed', other);
    await b.emit('committed', youtube, 1, 2);
    assert.equal(b.urls.get(1), other);
    assert.equal(b.updates.length, 0);
  });

  test(`${platform}: slow policy reads cannot redirect a newer navigation`, async () => {
    const b = setup();
    const gate = b.pause();
    const pending = b.emit('committed', youtube);
    await b.emit('before', other);
    await b.emit('committed', other);
    gate.resolve();
    await pending;
    assert.equal(b.urls.get(1), other);
    assert.equal(b.updates.length, 0);
    assert.equal(b.local.visitStats, undefined);
  });

  test(`${platform}: a newer provisional navigation invalidates old work before it commits`, async () => {
    const b = setup();
    const gate = b.pause();
    const pending = b.emit('committed', youtube);
    await b.emit('before', other);
    gate.resolve();
    await pending;
    assert.equal(b.updates.length, 0);
  });

  test(`${platform}: navigation during a stats read cannot trigger a stale redirect`, async () => {
    const b = setup();
    const gate = b.pause('visitStats');
    const pending = b.emit('committed', youtube);
    await tick();
    await b.emit('before', other);
    await b.emit('committed', other);
    gate.resolve();
    await pending;
    assert.equal(b.urls.get(1), other);
    assert.equal(b.updates.length, 0);
  });

  test(`${platform}: a closed tab invalidates pending policy work`, async () => {
    const b = setup();
    const gate = b.pause();
    const pending = b.emit('committed', youtube);
    await b.remove();
    gate.resolve();
    await pending;
    assert.equal(b.updates.length, 0);
  });

  test(`${platform}: slow policy work in one tab does not block another tab`, async () => {
    const b = setup();
    const gate = b.pause();
    const pending = b.emit('committed', youtube);
    await b.emit('committed', youtube, 2);
    assert.equal(b.updates[0].tabId, 2);
    gate.resolve();
    await pending;
    blocked(b);
  });

  test(`${platform}: rejected redirect updates are handled and a later commit can retry`, async () => {
    const b = setup();
    b.rejectUpdates();
    await b.emit('committed', youtube);
    assert.equal(b.errors.length, 1);
    assert.match(String(b.errors[0]), /Tab no longer exists/);
    b.rejectUpdates(false);
    await b.emit('committed', youtube);
    blocked(b);
  });

  // Safari 预载地址栏最佳匹配：在隐藏页（tab 9）提交，回车后换进可见标签页（tab 1），
  // 隐藏页 id 失效且不再有 onCommitted。
  test(`${platform}: a preloaded page swapped into a visible tab is still blocked`, async () => {
    const b = setup();
    b.rejectUpdates(9);
    await b.emit('committed', youtube, 9);
    b.urls.delete(9);
    b.show(1, youtube);
    await new Promise(resolve => setTimeout(resolve, 400));
    const url = blocked(b);
    assert.equal(url.searchParams.get('count'), '1');
  });

  test(`${platform}: swap recovery gives up when no tab shows the site`, async () => {
    const b = setup();
    b.rejectUpdates(9);
    await b.emit('committed', youtube, 9);
    b.urls.delete(9);
    b.show(1, other);
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(b.urls.get(1), other);
    assert.equal(b.updates.length, 0);
  });
}
