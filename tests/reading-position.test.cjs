const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../assets/reading-position.js"), "utf8");
const key = "erran-reading-position:/dnd/page.html?page=locations%2Flembrow#section-history";
const position = { x: 0, y: 900, heading: "section-history", offset: -100 };

function setup({ type = "reload", storage = new Map([[key, JSON.stringify(position)]]), blocked = false, fonts = Promise.resolve() } = {}) {
  const events = {};
  const documentEvents = {};
  const frames = [];
  const timers = new Map();
  const scrolls = [];
  const observers = [];
  const articleEvents = {};
  const heading = { id: "section-history", top: 800, getClientRects: () => [{}], getBoundingClientRect: () => ({ top: heading.top - window.scrollY }) };
  const hiddenHeading = { id: "related-heading", getClientRects: () => [], getBoundingClientRect: () => ({ top: 0 }) };
  const article = {
    querySelectorAll: () => [heading, hiddenHeading], contains: (element) => element === heading || element === hiddenHeading,
    addEventListener: (name, callback) => { articleEvents[name] = callback; },
    removeEventListener: (name) => { delete articleEvents[name]; }
  };
  const document = {
    body: {}, hidden: false, fonts: { ready: fonts },
    getElementById: (id) => id === heading.id ? heading : id === hiddenHeading.id ? hiddenHeading : null,
    addEventListener: (name, callback) => { documentEvents[name] = callback; }
  };
  const window = {
    location: { pathname: "/dnd/page.html", search: "?page=locations%2Flembrow", hash: "#section-history" },
    history: { scrollRestoration: "auto" }, performance: { getEntriesByType: () => [{ type }] },
    sessionStorage: {
      getItem: (name) => { if (blocked) throw new Error("Blocked"); return storage.get(name) || null; },
      setItem: (name, value) => { if (blocked) throw new Error("Blocked"); storage.set(name, value); }
    },
    scrollX: 0, scrollY: 0,
    scrollTo: (options) => { scrolls.push(options); window.scrollX = options.left; window.scrollY = options.top; },
    addEventListener: (name, callback) => {
      if (!events[name]) events[name] = [];
      events[name].push(callback);
    },
    removeEventListener: (name, callback) => { events[name] = (events[name] || []).filter((handler) => handler !== callback); },
    requestAnimationFrame: (callback) => frames.push(callback),
    setTimeout: (callback) => { const id = timers.size + 1; timers.set(id, callback); return id; },
    clearTimeout: (id) => timers.delete(id),
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    }
  };
  const context = vm.createContext({ window, document });
  vm.runInContext(source, context);
  return {
    api: window.ReadingPosition, window, document, article, heading, storage, scrolls, observers, articleEvents,
    emit: (name, event = {}) => (events[name] || []).forEach((callback) => callback(event)),
    visibility: () => documentEvents.visibilitychange(),
    flush: () => frames.splice(0).forEach((callback) => callback()),
    expire: () => [...timers.values()].forEach((callback) => callback())
  };
}

const checks = [
  ["reading positions are saved per URL and restored only after a reload's article is rendered", async () => {
    const storage = new Map();
    const first = setup({ type: "navigate", storage });
    await first.api.restore(first.article);
    first.window.scrollY = 900;
    first.emit("scroll");
    first.flush();
    assert.deepEqual(JSON.parse(storage.get(key)), position);
    const refreshed = setup({ storage });
    assert.equal(refreshed.api.shouldRestore, true);
    assert.equal(refreshed.window.history.scrollRestoration, "manual");
    assert.equal(refreshed.scrolls.length, 0);
    refreshed.emit("pagehide");
    assert.deepEqual(JSON.parse(storage.get(key)), position, "Loading must not overwrite the saved position with zero");
    await refreshed.api.restore(refreshed.article);
    assert.equal(refreshed.window.scrollY, 900);
    assert.equal(refreshed.scrolls[0].behavior, "instant");
    refreshed.expire();
    assert.equal(refreshed.window.history.scrollRestoration, "auto");
  }],
  ["section offsets survive edits above the section, font loading, and late image layout changes", async () => {
    let fontsReady;
    const page = setup({ fonts: new Promise((resolve) => { fontsReady = resolve; }) });
    page.heading.top += 200;
    const restoring = page.api.restore(page.article);
    assert.equal(page.scrolls.length, 0);
    fontsReady();
    await restoring;
    assert.equal(page.window.scrollY, 1100);
    page.heading.top += 300;
    page.observers[0].callback();
    page.flush();
    assert.equal(page.window.scrollY, 1400);
    assert.equal(page.heading.getBoundingClientRect().top, -100);
    page.expire();
    assert.equal(page.observers[0].disconnected, true);
    assert.equal(JSON.parse(page.storage.get(key)).y, 1400);
  }],
  ["wheel, keyboard, touch, pointer and section navigation immediately stop restoration", async () => {
    for (const [name, event] of [["wheel", {}], ["keydown", { key: "PageDown" }], ["touchstart", {}], ["pointerdown", {}], ["hashchange", {}]]) {
      const page = setup();
      await page.api.restore(page.article);
      page.emit(name, event);
      assert.equal(page.api.shouldRestore, false, name);
      page.window.scrollY = 1250;
      page.heading.top += 500;
      page.observers[0].callback();
      page.flush();
      assert.equal(page.window.scrollY, 1250, name);
      page.emit("pagehide");
      assert.equal(JSON.parse(page.storage.get(key)).y, 1250);
    }
    const loading = setup();
    loading.emit("wheel");
    await loading.api.restore(loading.article);
    assert.equal(loading.scrolls.length, 0, "User interaction during content loading also takes priority");
  }],
  ["new article and fragment visits ignore saved positions, while history visits can restore them", async () => {
    const fresh = setup({ type: "navigate" });
    await fresh.api.restore(fresh.article);
    assert.equal(fresh.api.shouldRestore, false);
    assert.equal(fresh.scrolls.length, 0);
    const otherArticle = setup({ storage: new Map([[`${key}-other-page`, JSON.stringify(position)]]) });
    await otherArticle.api.restore(otherArticle.article);
    assert.equal(otherArticle.scrolls.length, 0);
    const back = setup({ type: "back_forward" });
    await back.api.restore(back.article);
    assert.equal(back.window.scrollY, 900);
  }],
  ["deleted sections fall back to the saved scroll offset and visibility changes save the latest position", async () => {
    const page = setup();
    page.heading.id = "section-new-heading";
    await page.api.restore(page.article);
    assert.equal(page.window.scrollY, 900);
    page.expire();
    page.window.scrollY = 1000;
    page.document.hidden = true;
    page.visibility();
    assert.equal(JSON.parse(page.storage.get(key)).y, 1000);
  }],
  ["hidden related-section headings are never saved as anchors and old hidden anchors fall back to the scroll offset", async () => {
    const page = setup({ type: "navigate", storage: new Map() });
    await page.api.restore(page.article);
    page.window.scrollY = 900;
    page.emit("pagehide");
    assert.equal(JSON.parse(page.storage.get(key)).heading, "section-history");
    const old = setup({ storage: new Map([[key, JSON.stringify({ ...position, heading: "related-heading", offset: 0 })]]) });
    await old.api.restore(old.article);
    assert.equal(old.window.scrollY, 900);
  }],
  ["blocked storage and invalid saved data leave normal reading available", async () => {
    for (const options of [
      { blocked: true },
      { storage: new Map([[key, "invalid JSON"]]) },
      { storage: new Map([[key, JSON.stringify({ x: 0, y: -1 })]]) }
    ]) {
      const page = setup(options);
      await page.api.restore(page.article);
      page.emit("pagehide");
      assert.equal(page.api.shouldRestore, false);
      assert.equal(page.scrolls.length, 0);
    }
  }],
  ["search result highlighting preserves refreshed positions while fresh search links still jump to their match", async () => {
    for (const restoring of [false, true]) {
      let mark;
      const text = { data: "Lembrow", replaceWith() {} };
      const body = {};
      const context = vm.createContext({
        URLSearchParams, NodeFilter: { SHOW_TEXT: 4 },
        document: {
          getElementById: () => null,
          createTreeWalker: () => { let visited = false; return { nextNode: () => { if (visited) return null; visited = true; return text; } }; },
          createDocumentFragment: () => ({ append() {} }), createTextNode: (data) => ({ data }),
          createElement: () => {
            mark = { setAttribute() {}, focus() { this.focused = true; }, scrollIntoView() { this.scrolled = true; } };
            return mark;
          }
        },
        window: {
          location: { hash: "#search-match" }, ReadingPosition: { shouldRestore: restoring },
          CampaignContent: { getSearchMatches: () => [{ start: 0, end: 7 }] },
          requestAnimationFrame: (callback) => callback()
        }
      });
      vm.runInContext(fs.readFileSync(path.join(__dirname, "../assets/search.js"), "utf8"), context);
      await context.window.CampaignSearch.highlightArticle({ querySelector: (selector) => selector === "#article-body" ? body : null }, new URLSearchParams("q=Lembrow&match=body"));
      assert.equal(mark.textContent, "Lembrow");
      assert.equal(Boolean(mark.scrolled), !restoring);
      assert.equal(Boolean(mark.focused), !restoring);
    }
  }]
];

(async () => {
  for (const [name, check] of checks) {
    await check();
    console.log(`PASS ${name}`);
  }
  console.log(`${checks.length} reading position checks passed.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
