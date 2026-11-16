const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

class Element {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.events = {};
    this.hidden = false;
    this.value = "";
    this.textContent = "";
    this.style = { setProperty() {} };
    const classes = new Set();
    this.classList = {
      add: (name) => classes.add(name),
      contains: (name) => classes.has(name),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
    };
  }
  append(...children) {
    for (const child of children) {
      if (child.parentElement) {
        child.parentElement.children = child.parentElement.children.filter((item) => item !== child);
      }
      child.parentElement = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...children);
  }
  insertBefore(child, sibling) {
    this.append(child);
    if (!sibling) return;
    this.children.pop();
    this.children.splice(this.children.indexOf(sibling), 0, child);
  }
  focus() { this.focused = true; }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, callback) { this.events[name] = callback; }
  setPointerCapture(pointerId) { this.capturedPointer = pointerId; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }
}

const location = {
  key: "locations/valley-of-lem/lembrow", title: "Lembrow", label: "Lembrow",
  file: "locations/valley-of-lem/lembrow.md", parent: "locations/valley-of-lem",
  children: [], summary: "A fortified town", type: "town", coords: [0.4, 0.2],
  map: { type: "town", coords: [0.4, 0.2] }
};

async function articleRuntime(entry) {
  const elements = Object.fromEntries([...read("page.html").matchAll(/id="([^"]+)"/g)]
    .map((match) => [match[1], new Element()]));
  elements["article-map-link"].hidden = true;
  const context = vm.createContext({
    URLSearchParams,
    document: { body: new Element(), getElementById: (id) => elements[id], createElement: (tag) => new Element(tag) },
    window: {
      location: { search: `?page=${encodeURIComponent(entry.key)}` },
      CampaignContent: {
        getEntry: async () => entry, getMarkdown: async () => "<p>Notes</p>",
        getRelatedEntries: async () => [], getBreadcrumbs: async () => [entry], renderBody() {}
      },
      ArticleContents: { render() {} }, CampaignSearch: { highlightArticle: async () => {} }
    }
  });
  await vm.runInContext(read("assets/page.js"), context);
  assert.equal(elements["content-status"].hidden, true, elements["content-status"].textContent);
  return elements["article-map-link"];
}

async function mapRuntime({ search = "", type = "town", saved = null, labelEntry = {} } = {}) {
  const elements = Object.fromEntries([...read("map.html").matchAll(/id="([^"]+)"/g)]
    .map((match) => [match[1], new Element()]));
  const panelParent = new Element();
  panelParent.append(elements["location-panel"]);
  Object.assign(elements["map-image"], { decode: async () => {}, naturalWidth: 2000, naturalHeight: 1000 });
  const entry = { ...location, type, ...labelEntry };
  let selected = null;
  const documentEvents = {};
  const mapFrame = new Element();
  const document = {
    getElementById: (id) => elements[id], createElement: (tag) => new Element(tag),
    createElementNS: (namespace, tag) => new Element(tag),
    querySelector: () => mapFrame, addEventListener: (name, callback) => { documentEvents[name] = callback; },
    fullscreenEnabled: true, fullscreenElement: null,
    exitFullscreen: async () => {
      document.fullscreenElement = null;
      documentEvents.fullscreenchange();
    }
  };
  mapFrame.requestFullscreen = async () => {
    document.fullscreenElement = mapFrame;
    documentEvents.fullscreenchange();
  };
  const context = vm.createContext({
    URLSearchParams,
    document,
    localStorage: { getItem: () => saved === null ? null : JSON.stringify(saved), setItem() {} },
    ResizeObserver: class { observe() {} },
    window: {
      location: { search }, setTimeout() {}, clearTimeout() {}, addEventListener() {},
      CampaignContent: {
        getMapEntries: async () => [entry],
        getEntry: async (key) => { selected = key; return entry; },
        getMarkdown: async () => "<p>Location preview</p>",
        getRelatedEntries: async () => [{ key: location.parent, title: "The Valley of Lem" }],
        renderBody: (container, html) => { container.innerHTML = html; }
      }
    }
  });
  vm.runInContext(read("assets/map.js"), context);
  await new Promise(setImmediate);
  return { elements, selected, document, mapFrame, panelParent };
}

function mapCenter(elements) {
  const transform = elements["map-plane"].style.transform;
  assert.ok(transform, elements["map-status"].textContent);
  const [, x, y, scale] = transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px, 0\) scale\(([-\d.]+)\)/).map(Number);
  return [(400 - x) / scale / 2000, (300 - y) / scale / 1000];
}

const checks = [
  ["fullscreen location details can be closed and selecting a location reopens them", async () => {
    const { elements, document, mapFrame } = await mapRuntime();
    const panel = elements["location-panel"];
    const close = elements["location-panel-close"];
    const fullscreen = elements["map-fullscreen"];
    await fullscreen.events.click();
    assert.equal(document.fullscreenElement, mapFrame);
    assert.equal(panel.parentElement, mapFrame);
    close.events.click();
    assert.equal(panel.hidden, true, "the initial empty panel can also be closed");
    assert.equal(elements["map-viewport"].focused, true, "focus returns to the map");
    assert.equal(document.fullscreenElement, mapFrame, "closing details keeps the map fullscreen");
    const label = elements["map-labels"].children[0];
    for (let attempt = 0; attempt < 2; attempt++) {
      await label.events.click();
      assert.equal(panel.hidden, false);
      assert.equal(panel.children.filter((child) => child === close).length, 1,
        "the close button survives replacement of the selected location's content");
      close.events.click();
      assert.equal(panel.hidden, true);
    }
  }],
  ["leaving fullscreen restores a closed panel to the normal page layout", async () => {
    const { elements, document, panelParent } = await mapRuntime({ search: `?location=${encodeURIComponent(location.key)}` });
    const panel = elements["location-panel"];
    const close = elements["location-panel-close"];
    const fullscreen = elements["map-fullscreen"];
    await fullscreen.events.click();
    close.events.click();
    assert.equal(panel.hidden, true);
    await document.exitFullscreen();
    assert.equal(panel.hidden, false);
    assert.equal(panel.parentElement, panelParent);
    assert.ok(panel.children.some((child) => child.textContent === location.title));
    close.events.click();
    assert.equal(panel.hidden, false, "the normal sidebar cannot be dismissed");
    await fullscreen.events.click();
    assert.equal(panel.hidden, false, "entering fullscreen again starts with visible details");
  }],
  ["Great Burnton's multiline label uses normal text spacing", async () => {
    const { elements } = await mapRuntime({ labelEntry: {
      title: "Great Burnton", label: "Great Burnton", type: "town", labelOffset: "right"
    } });
    const group = elements["map-labels"].children[0];
    const content = group.children.find((child) => child.attributes.transform?.startsWith("rotate(")).children[0];
    const lines = content.children;
    assert.deepEqual(lines.map((line) => line.textContent), ["Great", "Burnton"]);
    const fontSize = Number(lines[0].attributes["font-size"]);
    const separation = Number(lines[1].attributes.y) - Number(lines[0].attributes.y);
    assert.ok(separation >= fontSize && separation <= fontSize * 1.3,
      "line spacing should be similar to normal text, without overlapping lines");
    assert.equal(Number(lines[0].attributes.y) + Number(lines[1].attributes.y), 0,
      "the multiline block stays centered on the marker");
  }],
  ["above, below, and automatic labels sit close to markers with room for every line", async () => {
    for (const label of ["Ashwood", "Great Burnton", "Great\\Burnton\\Fort"]) {
      for (const labelOffset of ["above", "below", undefined]) {
        const { elements } = await mapRuntime({ labelEntry: { label, type: "landmark", labelOffset } });
        const group = elements["map-labels"].children[0];
        const marker = group.children.find((child) => child.tagName === "CIRCLE");
        const content = group.children.find((child) => child.attributes.transform?.startsWith("rotate(")).children[0];
        const [, x, y] = content.attributes.transform.match(/translate\(([-\d.]+) ([-\d.]+)\)/).map(Number);
        assert.equal(x, 0);
        assert.equal(Math.sign(y), labelOffset === "above" ? -1 : 1);
        const fontSize = Number(content.children[0].attributes["font-size"]);
        const lineCenters = content.children.map((line) => y + Number(line.attributes.y));
        const nearestLine = labelOffset === "above" ? Math.max(...lineCenters) : Math.min(...lineCenters);
        const gap = Math.abs(nearestLine) - fontSize * 0.4 - Number(marker.attributes.r);
        assert.ok(gap > 0 && gap < fontSize * 0.3,
          `${label}, ${labelOffset || "automatic"}: text should have a small clear gap from the marker`);
      }
    }
  }],
  ["Fort Ashwood's existing right-aligned label sits close to its marker", async () => {
    const { elements } = await mapRuntime({ labelEntry: {
      title: "Fort Ashwood", label: "Fort Ashwood", type: "landmark",
      coords: [0.71733, 0.20136], labelOffset: "left", align: "right"
    } });
    const group = elements["map-labels"].children[0];
    assert.equal(group.attributes.transform, "translate(1434.66 201.36)");
    const marker = group.children.find((child) => child.tagName === "CIRCLE");
    const content = group.children.find((child) => child.attributes.transform?.startsWith("rotate(")).children[0];
    const text = content.children[0];
    assert.equal(text.textContent, "Fort Ashwood");
    assert.equal(text.attributes["text-anchor"], "end");
    const [, x, y] = content.attributes.transform.match(/translate\(([-\d.]+) ([-\d.]+)\)/).map(Number);
    const gap = -x - Number(marker.attributes.r);
    assert.equal(y, 0);
    assert.ok(gap > 0 && gap <= Number(text.attributes["font-size"]) / 2,
      "the aligned text edge should sit within half a font size of the marker");
  }],
  ["edge-aligned marker labels keep a small gap regardless of label length or side", async () => {
    for (const label of ["A", "Ashwood", "Fort Ashwood"]) {
      for (const side of ["left", "right"]) {
        const { elements } = await mapRuntime({ labelEntry: {
          label, type: "ruin", labelOffset: side, align: side === "left" ? "right" : "left"
        } });
        const group = elements["map-labels"].children[0];
        const marker = group.children.find((child) => child.tagName === "CIRCLE");
        const content = group.children.find((child) => child.attributes.transform?.startsWith("rotate(")).children[0];
        const text = content.children[0];
        const x = Number(content.attributes.transform.match(/translate\(([-\d.]+)/)[1]);
        assert.equal(Math.sign(x), side === "left" ? -1 : 1);
        const gap = Math.abs(x) - Number(marker.attributes.r);
        assert.ok(gap > 0 && gap <= Number(text.attributes["font-size"]) / 2, `${label}: ${side}`);
      }
    }
    const { elements } = await mapRuntime({ labelEntry: {
      type: "landmark", align: "right", labelOffset: [-300, 50], labelRotation: 20
    } });
    const group = elements["map-labels"].children[0];
    const rotated = group.children.find((child) => child.attributes.transform === "rotate(20)");
    assert.equal(rotated.children[0].attributes.transform, "translate(-63 10.5)", "explicit numeric offsets are preserved");
  }],
  ["mapped location articles link to their exact atlas entry; other articles have no map button", async () => {
    const link = await articleRuntime(location);
    assert.equal(link.hidden, false);
    const url = new URL(link.href, "https://example.test/dnd/page.html");
    assert.equal(url.pathname, "/dnd/map.html");
    assert.equal(url.searchParams.get("location"), location.key);
    for (const entry of [
      { ...location, map: null },
      { ...location, key: "lore/silverblight", map: null },
      { ...location, key: "locations/unwritten", map: null, missing: true }
    ]) assert.equal((await articleRuntime(entry)).hidden, true);
  }],
  ["atlas links override saved views, center the location, and open its summary and full-page link", async () => {
    const { elements, selected } = await mapRuntime({
      search: `?location=${encodeURIComponent(location.key)}`,
      saved: { center: { x: 0.9, y: 0.8 }, zoom: 2 }
    });
    assert.equal(selected, location.key);
    assert.deepEqual(mapCenter(elements), location.coords);
    assert.equal(elements["map-status"].hidden, true);
    assert.equal(elements["location-query"].value, location.label);
    const panel = elements["location-panel"];
    assert.equal(panel.children[0].textContent, "town · The Valley of Lem");
    assert.ok(panel.children.some((child) => child.textContent === location.title));
    assert.ok(panel.children.some((child) => child.innerHTML === "<p>Location preview</p>"));
    const link = panel.children.find((child) => child.className === "panel-read-more");
    assert.equal(new URL(link.href, "https://example.test/").searchParams.get("page"), location.key);
    assert.equal(panel.attributes["aria-busy"], undefined);
  }],
  ["smaller locations open at progressively closer zooms while their labels remain visible", async () => {
    let previousZoom = 0;
    for (const type of ["major-region", "region", "minor-region", "city", "town", "village", "landmark"]) {
      const { elements, selected } = await mapRuntime({ search: `?location=${encodeURIComponent(location.key)}`, type });
      assert.equal(selected, location.key);
      mapCenter(elements).forEach((coordinate, index) => {
        assert.ok(Math.abs(coordinate - location.coords[index]) < 1e-10, `${type} stays centered`);
      });
      assert.equal(elements["map-labels"].children[0].attributes["aria-hidden"], "false", type);
      const zoom = Number.parseInt(elements["map-zoom-level"].textContent, 10);
      assert.ok(zoom > previousZoom, `${type} should open closer than the larger location type`);
      if (type === "town") assert.ok(zoom > 450, "Towns should open closer than the previous default");
      previousZoom = zoom;
    }
  }],
  ["normal map visits retain the saved view and unknown locations leave the map usable", async () => {
    const saved = { center: { x: 0.7, y: 0.5 }, zoom: 3 };
    for (const search of ["", "?location=locations%2Funknown"]) {
      const { elements, selected } = await mapRuntime({ search, saved });
      assert.equal(selected, null);
      assert.deepEqual(mapCenter(elements), [0.7, 0.5]);
      assert.equal(elements["map-status"].hidden, search === "");
      if (search) assert.match(elements["map-status"].textContent, /could not be found/);
    }
  }],
  ["zoom readout toggles to normalized mouse coordinates and back to the current zoom", async () => {
    const { elements } = await mapRuntime();
    const viewport = elements["map-viewport"];
    const readout = elements["map-zoom-level"];
    assert.equal(readout.textContent, "100%");
    readout.events.click();
    assert.equal(readout.attributes["aria-pressed"], "true");
    assert.equal(readout.attributes["aria-live"], "off");
    assert.equal(readout.textContent, "X: —, Y: —");
    const move = (clientX, clientY) => viewport.events.pointermove({
      pointerId: 1, pointerType: "mouse", clientX, clientY, target: { closest: () => null }
    });
    // The fitted image is 800 by 400, with 100 pixels of space above it.
    move(200, 200);
    assert.equal(readout.textContent, "X: 0.2500, Y: 0.2500");
    elements["zoom-in"].events.click();
    assert.equal(readout.textContent, "X: 0.3148, Y: 0.3148");
    readout.events.click();
    assert.equal(readout.textContent, "135%");
    assert.equal(readout.attributes["aria-pressed"], "false");
    assert.equal(readout.attributes["aria-live"], "polite");
    move(400, 300);
    assert.equal(readout.textContent, "135%");
  }],
  ["mouse coordinates account for viewport position, saved pan and zoom, and dragging", async () => {
    const { elements } = await mapRuntime({ saved: { center: { x: 0.7, y: 0.5 }, zoom: 3 } });
    const viewport = elements["map-viewport"];
    viewport.getBoundingClientRect = () => ({ left: 120, top: 80, width: 800, height: 600 });
    const readout = elements["map-zoom-level"];
    readout.events.click();
    const pointer = {
      pointerId: 1, pointerType: "mouse", button: 0, clientX: 520, clientY: 380,
      target: { closest: () => null }
    };
    viewport.events.pointermove(pointer);
    assert.equal(readout.textContent, "X: 0.7000, Y: 0.5000");
    viewport.events.pointerdown(pointer);
    viewport.events.pointermove({ ...pointer, clientX: 640 });
    assert.equal(readout.textContent, "X: 0.7000, Y: 0.5000", "drag keeps the same map point under the mouse");
    viewport.events.pointerup(pointer);
    viewport.events.pointermove(pointer);
    assert.equal(readout.textContent, "X: 0.6500, Y: 0.5000");
  }],
  ["coordinates clear outside the map and clicking the readout does not start a drag", async () => {
    const { elements } = await mapRuntime();
    const viewport = elements["map-viewport"];
    const readout = elements["map-zoom-level"];
    readout.events.click();
    const pointer = {
      pointerId: 1, pointerType: "mouse", clientX: 400, clientY: 300,
      target: { closest: () => null }
    };
    viewport.events.pointermove(pointer);
    assert.equal(readout.textContent, "X: 0.5000, Y: 0.5000");
    viewport.events.pointermove({ ...pointer, clientY: 50 });
    assert.equal(readout.textContent, "X: —, Y: —", "blank space is outside the map image");
    viewport.events.pointermove(pointer);
    viewport.events.pointerleave();
    assert.equal(readout.textContent, "X: —, Y: —");
    const controlPointer = { ...pointer, target: { closest: (selector) => selector.includes(".map-zoom-level") ? readout : null } };
    viewport.events.pointermove(controlPointer);
    assert.equal(readout.textContent, "X: —, Y: —");
    viewport.events.pointerdown(controlPointer);
    assert.equal(viewport.capturedPointer, undefined);
    const transform = elements["map-plane"].style.transform;
    viewport.events.pointermove({ ...pointer, clientX: 500 });
    assert.equal(elements["map-plane"].style.transform, transform);
  }],
  ["clicking the map freezes coordinates through movement and zoom; clicking again resumes tracking", async () => {
    const { elements } = await mapRuntime();
    const viewport = elements["map-viewport"];
    const readout = elements["map-zoom-level"];
    readout.events.click();
    const pointer = {
      pointerId: 1, pointerType: "mouse", button: 0, clientX: 200, clientY: 200,
      target: { closest: () => null }
    };
    viewport.events.pointerdown(pointer);
    viewport.events.pointerup(pointer);
    const frozen = "X: 0.2500, Y: 0.2500 (frozen)";
    assert.equal(readout.textContent, frozen);
    viewport.events.pointermove({ ...pointer, clientX: 400, clientY: 300 });
    viewport.events.pointerleave();
    elements["zoom-in"].events.click();
    assert.equal(readout.textContent, frozen, "frozen map coordinates survive leaving and zooming");
    assert.match(readout.title, /Click the map to resume/);
    const center = { ...pointer, clientX: 400, clientY: 300 };
    viewport.events.pointerdown(center);
    viewport.events.pointerup(center);
    assert.equal(readout.textContent, "X: 0.5000, Y: 0.5000");
    viewport.events.pointermove({ ...center, clientX: 508 });
    assert.equal(readout.textContent, "X: 0.6000, Y: 0.5000");
    viewport.events.pointerdown(center);
    viewport.events.pointerup(center);
    readout.events.click();
    assert.equal(readout.textContent, "135%");
    readout.events.click();
    assert.equal(readout.textContent, "X: 0.5000, Y: 0.5000", "changing display mode clears the freeze");
  }],
  ["dragging, cancelling, controls, and clicks outside the image do not freeze coordinates", async () => {
    const { elements } = await mapRuntime();
    const viewport = elements["map-viewport"];
    const readout = elements["map-zoom-level"];
    readout.events.click();
    const pointer = {
      pointerId: 1, pointerType: "mouse", button: 0, clientX: 400, clientY: 300,
      target: { closest: () => null }
    };
    viewport.events.pointerdown(pointer);
    viewport.events.pointermove({ ...pointer, clientX: 420 });
    viewport.events.pointermove(pointer);
    viewport.events.pointerup(pointer);
    assert.doesNotMatch(readout.textContent, /frozen/, "a drag returning to its start is still a drag");
    viewport.events.pointerdown(pointer);
    viewport.events.pointercancel(pointer);
    viewport.events.pointerup(pointer);
    assert.doesNotMatch(readout.textContent, /frozen/);
    for (const ignored of [
      { ...pointer, clientY: 50 },
      { ...pointer, button: 2 },
      { ...pointer, target: { closest: () => elements["zoom-in"] } }
    ]) {
      viewport.events.pointerdown(ignored);
      viewport.events.pointerup(ignored);
      assert.doesNotMatch(readout.textContent, /frozen/);
    }
    viewport.events.pointermove({ ...pointer, clientX: 600 });
    assert.equal(readout.textContent, "X: 0.7500, Y: 0.5000");
  }]
];

(async () => {
  for (const [name, check] of checks) {
    await check();
    console.log(`PASS ${name}`);
  }
  console.log(`${checks.length} map navigation checks passed.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
