const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "assets/theme.js"), "utf8");

function runtime({ saved = null, dark = false, blocked = false } = {}) {
  const documentElement = { dataset: {} };
  const meta = {};
  const buttons = [];
  const events = new Map();
  const changes = [];
  const storage = new Map(saved === null ? [] : [["erran-theme", saved]]);
  const media = { matches: dark, addEventListener: (type, handler) => changes.push(handler) };
  const context = vm.createContext({
    document: { documentElement, querySelector: () => meta, querySelectorAll: () => buttons },
    matchMedia: (query) => {
      assert.equal(query, "(prefers-color-scheme: dark)");
      return media;
    },
    localStorage: {
      getItem(key) { if (blocked) throw new Error("Blocked storage"); return storage.get(key) || null; },
      setItem(key, value) { if (blocked) throw new Error("Blocked storage"); storage.set(key, value); }
    },
    addEventListener: (type, handler) => events.set(type, handler)
  });
  context.window = context;
  vm.runInContext(source, context, { filename: "assets/theme.js" });
  function addButton() {
    const handlers = [];
    const button = { attributes: {}, setAttribute(key, value) { this.attributes[key] = value; },
      addEventListener(type, handler) { assert.equal(type, "click"); handlers.push(handler); },
      click() { handlers.forEach((handler) => handler()); } };
    buttons.push(button);
    context.CampaignTheme.attach(context.document);
    return button;
  }
  return { root: documentElement, meta, storage, addButton, api: context.CampaignTheme, document: context.document,
    changeSystem(value) { media.matches = value; changes.forEach((handler) => handler()); },
    changeStorage(key, newValue) { events.get("storage")({ key, newValue }); } };
}

const checks = [
  ["first visit follows system theme, including later system changes", () => {
    const app = runtime({ dark: true });
    assert.equal(app.root.dataset.theme, "dark");
    assert.equal(app.meta.content, "#0b151e");
    const button = app.addButton();
    assert.equal(button.attributes["aria-pressed"], "true");
    app.changeSystem(false);
    assert.equal(app.root.dataset.theme, "light");
    assert.equal(button.attributes["aria-pressed"], "false");
    assert.equal(app.meta.content, "#102f43");
    assert.equal(app.storage.size, 0);
  }],
  ["explicit choice overrides the system and survives a new page", () => {
    const app = runtime({ saved: "light", dark: true });
    assert.equal(app.root.dataset.theme, "light");
    const button = app.addButton();
    button.click();
    assert.equal(app.root.dataset.theme, "dark");
    assert.equal(button.title, "Switch to light theme");
    assert.equal(app.storage.get("erran-theme"), "dark");
    app.changeSystem(false);
    assert.equal(app.root.dataset.theme, "dark");
    assert.equal(runtime({ saved: app.storage.get("erran-theme") }).root.dataset.theme, "dark");
    button.click();
    assert.equal(app.storage.get("erran-theme"), "light");
  }],
  ["toggle keeps working when browser storage is blocked", () => {
    const app = runtime({ blocked: true });
    const button = app.addButton();
    button.click();
    assert.equal(app.root.dataset.theme, "dark");
    button.click();
    assert.equal(app.root.dataset.theme, "light");
  }],
  ["other tabs synchronize choices and clearing storage restores system preference", () => {
    const app = runtime();
    const button = app.addButton();
    app.changeStorage("erran-theme", "dark");
    assert.equal(app.root.dataset.theme, "dark");
    assert.equal(button.attributes["aria-pressed"], "true");
    app.changeStorage("unrelated", "light");
    assert.equal(app.root.dataset.theme, "dark");
    app.changeStorage(null, null);
    assert.equal(app.root.dataset.theme, "light");
    app.changeSystem(true);
    assert.equal(app.root.dataset.theme, "dark");
  }],
  ["invalid stored values are ignored and repeated attachment does not duplicate toggles", () => {
    const app = runtime({ saved: "invalid", dark: true });
    const button = app.addButton();
    app.api.attach(app.document);
    button.click();
    assert.equal(app.root.dataset.theme, "light");
  }],
  ["every page initializes its theme before loading styles and the shared header", () => {
    for (const file of ["index.html", "page.html", "map.html", "search.html"]) {
      const html = fs.readFileSync(path.join(root, file), "utf8");
      assert.ok(html.indexOf('src="assets/theme.js"') < html.indexOf('href="assets/site.css"'), file);
      assert.ok(html.includes('src="assets/theme.js"></script>'), "Theme initialization must run immediately");
    }
  }]
];
for (const [name, check] of checks) { check(); console.log(`PASS ${name}`); }
console.log(`${checks.length} theme checks passed.`);
