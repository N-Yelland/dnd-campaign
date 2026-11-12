const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "assets/contents.js"), "utf8");

class Element {
  constructor(tagName, textContent = "") {
    this.tagName = tagName.toUpperCase();
    this.textContent = textContent;
    this.id = "";
    this.children = [];
    this.attributes = {};
    this.top = 100;
  }
  append(child) { this.children.push(child); }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  getBoundingClientRect() { return { top: this.top }; }
  scrollIntoView() { this.scrolled = true; }
}

function setup(sections, { wide = true, hash = "", existingIds = [] } = {}) {
  const headings = sections.map(([level, title]) => new Element(`h${level}`, title));
  const elements = {
    "article-contents": new Element("nav"),
    "contents-panel": new Element("details"),
    "contents-list": new Element("ol")
  };
  elements["article-contents"].hidden = true;
  const events = {};
  const frames = [];
  const media = { matches: wide, addEventListener: (name, callback) => { media.onChange = callback; } };
  const context = vm.createContext({
    document: {
      getElementById: (id) => elements[id],
      querySelectorAll: () => existingIds.map((id) => ({ id })),
      createElement: (tagName) => new Element(tagName)
    },
    window: {
      location: { hash },
      matchMedia: (query) => {
        assert.equal(query, "(min-width: 1280px)");
        return media;
      },
      addEventListener: (name, callback) => { events[name] = callback; },
      requestAnimationFrame: (callback) => { frames.push(callback); }
    }
  });
  vm.runInContext(script, context);
  const body = { querySelectorAll: () => headings };
  context.window.ArticleContents.render(body);
  return {
    headings, elements, events, frames, media,
    flush: () => { frames.splice(0).forEach((callback) => callback()); }
  };
}

function linksIn(element) {
  return element.children.flatMap((child) => child.tagName === "A" ? [child] : linksIn(child));
}

const checks = [
  ["contents stay hidden for articles with fewer than two nonempty headings", () => {
    for (const sections of [[], [[2, "Overview"]], [[2, "Overview"], [3, "  "]]]) {
      const { elements } = setup(sections);
      assert.equal(elements["article-contents"].hidden, true);
      assert.equal(elements["contents-list"].children.length, 0);
    }
  }],
  ["nested and skipped heading levels produce correctly nested, labelled links", () => {
    const { elements, headings } = setup([
      [2, "Locations"], [3, "Sanatoria"], [5, "Brightwater"], [3, "Refineries"], [2, "Hierarchy"]
    ]);
    assert.equal(elements["article-contents"].hidden, false);
    const list = elements["contents-list"];
    assert.equal(list.children.length, 2);
    const locations = list.children[0];
    assert.equal(locations.children[0].textContent, "Locations");
    const locationsList = locations.children[1];
    assert.deepEqual(locationsList.children.map((item) => item.children[0].textContent), ["Sanatoria", "Refineries"]);
    assert.equal(locationsList.children[0].children[1].children[0].children[0].textContent, "Brightwater");
    const links = linksIn(list);
    assert.equal(links.length, headings.length);
    links.forEach((link, index) => assert.equal(decodeURIComponent(link.href.slice(1)), headings[index].id));
  }],
  ["heading anchors are unique and support punctuation, accents, and non-Latin text", () => {
    const { headings } = setup([
      [2, "Overview"], [2, "Overview"], [2, "Overview 2"], [2, "Über beliefs"], [2, "宗教"], [2, "!!!"]
    ], { existingIds: ["section-overview"] });
    assert.equal(new Set(headings.map((heading) => heading.id)).size, headings.length);
    assert.equal(headings[0].id, "section-overview-2");
    assert.equal(headings[3].id, "section-uber-beliefs");
    assert.equal(headings[4].id, "section-宗教");
    assert.equal(headings[5].id, "section-heading");
  }],
  ["direct section URLs work after rendering, including pages without contents", () => {
    const multiple = setup([[2, "Overview"], [2, "Origins"]], { hash: "#section-origins", wide: false });
    assert.equal(multiple.headings[1].scrolled, true);
    const single = setup([[2, "Overview"]], { hash: "#section-overview" });
    assert.equal(single.headings[0].scrolled, true);
    assert.doesNotThrow(() => setup([[2, "Overview"], [2, "Origins"]], { hash: "#%broken" }));
  }],
  ["scrolling highlights the current section and batches updates into one frame", () => {
    const view = setup([[2, "Overview"], [2, "Origins"], [3, "Details"]]);
    const links = linksIn(view.elements["contents-list"]);
    assert.equal(links[0].attributes["aria-current"], "location");
    view.headings[0].top = -500;
    view.headings[1].top = 30;
    view.headings[2].top = 400;
    view.events.scroll();
    view.events.scroll();
    assert.equal(view.frames.length, 1);
    view.flush();
    assert.equal(links[0].attributes["aria-current"], undefined);
    assert.equal(links[1].attributes["aria-current"], "location");
    view.headings[2].top = 20;
    view.events.hashchange();
    view.flush();
    assert.equal(links[2].attributes["aria-current"], "location");
    assert.equal(links.filter((link) => link.attributes["aria-current"]).length, 1);
  }],
  ["contents open on wide screens and collapse when switching to a narrow screen", () => {
    const view = setup([[2, "Overview"], [2, "Origins"]]);
    assert.equal(view.elements["contents-panel"].open, true);
    view.media.matches = false;
    view.media.onChange();
    assert.equal(view.elements["contents-panel"].open, false);
    assert.equal(setup([[2, "Overview"], [2, "Origins"]], { wide: false }).elements["contents-panel"].open, false);
  }]
];

for (const [name, check] of checks) {
  check();
  console.log(`PASS ${name}`);
}
console.log(`${checks.length} contents checks passed.`);
