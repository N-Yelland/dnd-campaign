const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const baseURI = "https://example.test/dnd/page.html";
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function createRuntime({ overrides = {}, failOnce } = {}) {
  const requests = [];
  const context = vm.createContext({
    URL,
    document: { baseURI },
    fetch: async (input) => {
      const url = new URL(input, baseURI);
      assert.equal(url.origin, "https://example.test");
      assert.ok(url.pathname.startsWith("/dnd/content/"));
      const file = url.pathname.slice("/dnd/".length);
      requests.push(file);
      if (file === failOnce && requests.filter((request) => request === file).length === 1) {
        return { ok: false, status: 503 };
      }
      if (Object.hasOwn(overrides, file)) {
        return { ok: true, text: async () => overrides[file] };
      }
      if (!fs.existsSync(path.join(root, file))) return { ok: false, status: 404 };
      return { ok: true, text: async () => read(file) };
    }
  });
  context.window = context;
  for (const file of ["assets/vendor/js-yaml.min.js", "assets/vendor/markdown-it.min.js", "assets/content.js"]) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return { api: context.CampaignContent, yaml: context.jsyaml, requests };
}

function contentFiles(directory = "content") {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const file = `${directory}/${entry.name}`;
    return entry.isDirectory() ? contentFiles(file) : [file];
  });
}

function keyFromPath(file) {
  return file.slice("content/".length).replace(/(?:^|\/)index\.md$/, "").replace(/\.md$/, "");
}

const checks = [
  ["every folder lists exactly its immediate children, and every article is reachable", async () => {
    const { api, requests } = createRuntime();
    const files = contentFiles();
    assert.ok(!fs.existsSync(path.join(root, "source")));
    assert.ok(!files.some((file) => file.endsWith("content-files.json")));
    const articles = await api.getEntriesByKeys(files.filter((file) => file.endsWith(".md")).map(keyFromPath));
    for (const entry of articles) {
      await api.getRelatedEntries(entry);
      await api.getMarkdown(entry);
      if (!entry.file.endsWith("index.md")) continue;
      const directory = path.join(root, "content", path.posix.dirname(entry.file));
      const expected = fs.readdirSync(directory, { withFileTypes: true })
        .filter((child) => child.name !== "index.md")
        .map((child) => child.name + (child.isDirectory() ? "/" : ""));
      assert.deepEqual(Array.from(entry.childPages).sort(), expected.sort(), entry.file);
    }
    assert.equal(new Set(requests).size, requests.length, "Repeated requests should reuse cached files");
  }],
  ["root and image landing pages link to sections and resources without fetching article bodies", async () => {
    const { api, requests } = createRuntime();
    const landing = await api.getEntry("");
    assert.equal(landing.parent, null);
    assert.deepEqual(Array.from(landing.children), [
      "player-introduction", "locations", "people", "cultures", "organisations",
      "history", "lore", "creatures", "campaign", "_static"
    ]);
    assert.ok(requests.every((file) => file.endsWith("/index.md")));
    const sections = await api.getRelatedEntries(landing);
    assert.ok(sections.every((entry) => entry.parent === ""));
    const images = await api.getEntry("_static/img");
    const related = await api.getRelatedEntries(images);
    for (const key of images.children) {
      const image = related.find((entry) => entry.key === key);
      assert.equal(new URL(image.href).pathname, `/dnd/content/${image.file}`);
      assert.ok(fs.existsSync(path.join(root, "content", image.file)));
    }
    assert.ok(requests.every((file) => file.endsWith("/index.md")));
  }],
  ["existing article URLs, reading order, and atlas metadata survive discovery through indexes", async () => {
    const { api, yaml } = createRuntime();
    const town = await api.getEntry("locations/valley-of-lem/lembrow");
    assert.equal(town.title, "Lembrow");
    assert.equal(town.parent, "locations/valley-of-lem");
    assert.ok((await api.getMarkdown(town)).replace(/<\/?a\b[^>]*>/g, "").includes("Nestled in the Valley of Lem"));
    const introduction = await api.getEntry("player-introduction");
    assert.deepEqual(Array.from(introduction.childPages), [
      "prologue.md", "backstories.md", "origins.md", "history-of-erran.md", "knowledge-of-silverblight.md"
    ]);
    const expectedMapKeys = contentFiles().filter((file) => {
      if (!file.endsWith(".md")) return false;
      const header = read(file).match(/^---\r?\n([\s\S]*?)\r?\n---/);
      return Boolean(yaml.safeLoad(header[1]).map);
    }).map(keyFromPath).sort();
    const map = await api.getMapEntries();
    assert.deepEqual(Array.from(map, (entry) => entry.key).sort(), expectedMapKeys);
    const marker = map.find((entry) => entry.key === town.key);
    assert.deepEqual(Array.from(marker.coords), [0.41238, 0.23209]);
    assert.equal(marker.label, "Lembrow");
  }],
  ["map prefixes form complete article titles throughout the guide without changing atlas labels", async () => {
    const { api } = createRuntime();
    for (const [key, expected] of [
      ["locations/plains/tears", "Bay of Tears"],
      ["locations/plains/dreams", "Gulf of Dreams"],
      ["locations/plains/thosk", "Sea of Thosk"],
      ["locations/plains", "The Plains"]
    ]) {
      const entry = await api.getEntry(key);
      assert.equal(entry.title, expected);
      const trail = await api.getBreadcrumbs(entry);
      assert.equal(trail[trail.length - 1].title, expected);
    }
    const result = (await api.search("Bay of Tears")).find((entry) => entry.key === "locations/plains/tears");
    assert.equal(result.title, "Bay of Tears");
    assert.equal(result.matchScope, "title");
    const marker = (await api.getMapEntries()).find((entry) => entry.key === "locations/plains/tears");
    assert.equal(marker.title, "Bay of Tears");
    assert.equal(marker.label, "Tears");
    assert.equal(marker.topText, "Bay of");

    for (const title of ["Tears", "Bay of Tears"]) {
      const { api: custom } = createRuntime({ overrides: {
        "content/locations/plains/tears.md": `---\ntitle: ${title}\nmap:\n  coords: [0.5, 0.5]\n  topText: '  Bay of  '\n---\n# ${title}\n\nThe shore.`,
        "content/cultures/customs.md": "---\ntitle: Customs\n---\nVisit [tears] or [the bay](tears)."
      } });
      const entry = await custom.getEntry("locations/plains/tears");
      assert.equal(entry.title, "Bay of Tears");
      assert.equal((await custom.getMapEntries()).find((item) => item.key === entry.key).label, title);
      assert.equal((await custom.getMarkdown(entry)).trim(), "<p>The shore.</p>");
      const links = await custom.getMarkdown(await custom.getEntry("cultures/customs"));
      assert.ok(links.includes(">Bay of Tears</a>"));
      assert.ok(links.includes(">the bay</a>"), "Custom link text must stay unchanged");
    }
  }],
  ["failed index requests can be retried", async () => {
    const { api } = createRuntime({ failOnce: "content/locations/index.md" });
    await assert.rejects(() => api.getEntry("locations"), /locations\/index\.md.*503/);
    assert.equal((await api.getEntry("locations")).title, "The Continent of Erran");
  }],
  ["breadcrumbs include every parent from the root index to the current article", async () => {
    const { api } = createRuntime();
    const cases = [
      ["", [""]],
      ["cultures", ["", "cultures"]],
      ["campaign/sessions", ["", "campaign", "campaign/sessions"]],
      ["locations/valley-of-lem/lembrow", ["", "locations", "locations/valley-of-lem", "locations/valley-of-lem/lembrow"]]
    ];
    for (const [key, expected] of cases) {
      const trail = await api.getBreadcrumbs(await api.getEntry(key));
      assert.deepEqual(Array.from(trail, (entry) => entry.key), expected);
      assert.equal(trail[0].file, "index.md");
      assert.equal(trail[trail.length - 1].key, key);
    }
  }],
  ["invalid child paths, duplicate keys, and missing subsection indexes are rejected", async () => {
    const invalid = [
      ["child_pages: text", /child_pages must be a list/],
      ["child_pages: [null]", /child_pages must be a list/],
      ["child_pages: [locations/, locations/]", /duplicate paths/],
      ...["../outside.md", "/outside.md", "nested/page.md", "index.md", "https:example.md", "x%2fy.md", "x?y.md", "x#y.md"]
        .map((value) => [`child_pages: [${JSON.stringify(value)}]`, /immediate files or directories/]),
      ["child_pages: [missing/]", /missing\/index\.md.*404/],
      ["child_pages: [locations/, locations.md]", /Duplicate content key/]
    ];
    for (const [header, message] of invalid) {
      const { api } = createRuntime({ overrides: { "content/index.md": `---\ntitle: Test\n${header}\n---\n` } });
      await assert.rejects(() => api.getEntry(""), message, header);
    }
  }],
  ["article search ranks titles first and finds terms only mentioned in body text", async () => {
    const { api } = createRuntime();
    const titles = await api.search("LEMBROW");
    assert.equal(titles[0].key, "locations/valley-of-lem/lembrow");
    assert.ok(titles[0].path.includes("The Valley of Lem"));
    const body = await api.search("Fallowgrove");
    const hollow = body.find((result) => result.key === "locations/valley-of-lem/nim-s-hollow");
    assert.ok(hollow, "A family mentioned in an article should find that article");
    assert.ok(hollow.snippet.includes("Fallowgrove"));
    const destination = new URL(hollow.href, baseURI);
    assert.equal(destination.searchParams.get("q"), "Fallowgrove");
    assert.equal(destination.searchParams.get("match"), "body");
    assert.equal(destination.hash, "#search-match");
  }],
  ["article search handles accents, multiple terms, and formatted Markdown excerpts", async () => {
    const { api } = createRuntime({ overrides: {
      "content/cultures/customs.md": "---\ntitle: Café Traditions\nsummary: Everyday celebrations\n---\n# Café Traditions\n\nThe **Copper Lantern** festival welcomes travellers."
    } });
    const titleMatch = (await api.search("CAFE"))[0];
    assert.equal(titleMatch.key, "cultures/customs");
    assert.equal(titleMatch.matchScope, "title", "The duplicated Markdown title is not a body-text match");
    const match = (await api.search("copper lantern"))[0];
    assert.equal(match.key, "cultures/customs");
    assert.ok(match.snippet.includes("Copper Lantern"));
    assert.ok(!match.snippet.includes("**"));
    assert.equal((await api.search("copper nonexistentword")).length, 0);
    const summaryMatch = (await api.search("celebrations"))[0];
    assert.equal(summaryMatch.key, "cultures/customs");
    assert.equal(summaryMatch.matchScope, "summary");
  }],
  ["highlight ranges preserve accented text, repeated matches, and original offsets", () => {
    const { api, requests } = createRuntime();
    const text = "Caf\u00e9, Cafe\u0301, and CAF\u00c9 beside a \ufb03 ligature.";
    const ranges = api.getSearchMatches(text, "cafe ffi");
    assert.deepEqual(Array.from(ranges, (range) => text.slice(range.start, range.end)), ["Caf\u00e9", "Cafe\u0301", "CAF\u00c9", "\ufb03"]);
    const overlap = api.getSearchMatches("Silverblight", "blight silverblight");
    assert.equal(overlap.length, 1);
    assert.equal("Silverblight".slice(overlap[0].start, overlap[0].end), "Silverblight");
    assert.equal(api.getSearchMatches("A normal article", "[.*]").length, 0);
    assert.equal(requests.length, 0);
  }],
  ["search excludes YAML and resources, and reuses fetched content across queries", async () => {
    const { api, requests } = createRuntime();
    assert.equal((await api.search(" !! ")).length, 0);
    assert.equal(requests.length, 0, "An empty query should not fetch the wiki");
    await api.search("Lembrow");
    const count = requests.length;
    const results = await api.search("Erran");
    assert.ok(results.every((result) => !result.key.startsWith("_static/")));
    assert.equal((await api.search("labelCurvature")).length, 0);
    assert.equal(requests.length, count);
    assert.ok(requests.every((file) => file.endsWith(".md")), "Search must not download images");
    assert.equal(new Set(requests).size, requests.length);
  }],
  ["article search retries a failed content request", async () => {
    const { api } = createRuntime({ failOnce: "content/locations/valley-of-lem/lembrow.md" });
    await assert.rejects(() => api.search("Lembrow"), /lembrow\.md.*503/);
    assert.equal((await api.search("Lembrow"))[0].key, "locations/valley-of-lem/lembrow");
  }],
  ["extensionless article links resolve locally, across sections, and to headings", async () => {
    const { api } = createRuntime({ overrides: {
      "content/organisations/aldovian-academy.md": [
        "---", "title: Link Fixture", "---", "",
        "[Church](church-of-brightwater)",
        "[Blight](silverblight)",
        "[Places](locations)",
        "[Valley](locations/valley-of-lem)",
        "[History](../player-introduction/history-of-erran.md#section-the-years-of-darkness)",
        "[This section](index)",
        "[External](https://example.org/page)",
        "[Local heading](#section-history)",
        "[Image](../_static/img/Akkamon.png)"
      ].join("\n")
    } });
    const html = await api.getMarkdown(await api.getEntry("organisations/aldovian-academy"));
    const links = new Map([...html.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((match) => [match[2], match[1].replace(/&amp;/g, "&")]));
    for (const [label, key] of [
      ["Church", "organisations/church-of-brightwater"], ["Blight", "lore/silverblight"],
      ["Places", "locations"], ["Valley", "locations/valley-of-lem"],
      ["History", "player-introduction/history-of-erran"], ["This section", "organisations"]
    ]) {
      const url = new URL(links.get(label), baseURI);
      assert.equal(url.pathname, "/dnd/page.html", label);
      assert.equal(url.searchParams.get("page"), key, label);
    }
    assert.equal(new URL(links.get("History"), baseURI).hash, "#section-the-years-of-darkness");
    assert.equal(links.get("External"), "https://example.org/page");
    assert.equal(links.get("Local heading"), "#section-history");
    assert.equal(links.get("Image"), "../_static/img/Akkamon.png");
  }],
  ["bare article references use page titles while notes, escapes, and code remain literal", async () => {
    const { api } = createRuntime({ overrides: {
      "content/organisations/aldovian-academy.md": [
        "---", "title: Reference Fixture", "---", "",
        "[klathrassian-bureaucracy]", "",
        "`[klathrassian-bureaucracy]`", "",
        "\\[klathrassian-bureaucracy]", "",
        "[Soldier, Guide] [not-a-real-page] [???]", "",
        "```", "[klathrassian-bureaucracy]", "```", "",
        "[outer [klathrassian-bureaucracy]](https://example.org)"
      ].join("\n")
    } });
    const html = await api.getMarkdown(await api.getEntry("organisations/aldovian-academy"));
    assert.ok(html.includes(">The Klathrassian Bureaucracy</a>"));
    assert.equal((html.match(/<a /g) || []).length, 2, "Only the bare reference and explicit external link become links");
    assert.ok(html.includes("<code>[klathrassian-bureaucracy]</code>"));
    assert.ok(html.includes("[Soldier, Guide] [not-a-real-page] [???]"));
    assert.ok(html.includes("outer [klathrassian-bureaucracy]</a>"));
  }],
  ["duplicate article names require a path unless a matching page is in the same folder", async () => {
    const overrides = {
      "content/people/index.md": "---\ntitle: People\nchild_pages:\n  - shared.md\n---\n",
      "content/people/shared.md": "---\ntitle: People Shared\n---\n[shared]",
      "content/lore/index.md": read("content/lore/index.md").replace("child_pages:", "child_pages:\n  - shared.md"),
      "content/lore/shared.md": "---\ntitle: Lore Shared\n---\nAn article.",
      "content/organisations/aldovian-academy.md": "---\ntitle: Ambiguous Fixture\n---\n[shared] [Specific](people/shared)"
    };
    const { api } = createRuntime({ overrides });
    const ambiguous = await api.getMarkdown(await api.getEntry("organisations/aldovian-academy"));
    assert.ok(ambiguous.includes("[shared]"));
    assert.equal((ambiguous.match(/<a /g) || []).length, 1);
    assert.ok(ambiguous.includes("page=people%2Fshared"));
    const local = await api.getMarkdown(await api.getEntry("people/shared"));
    assert.ok(local.includes(">People Shared</a>"));
    assert.ok(local.includes("page=people%2Fshared"));
  }],
  ["search excerpts use the same resolved article-reference labels as the reader", async () => {
    const { api } = createRuntime({ overrides: {
      "content/organisations/aldovian-academy.md": "---\ntitle: Reference Search Fixture\n---\nWorking with [klathrassian-bureaucracy]."
    } });
    const results = await api.search("Klathrassian Bureaucracy");
    const source = results.find((result) => result.key === "organisations/aldovian-academy");
    assert.ok(source.snippet.includes("The Klathrassian Bureaucracy"));
    assert.ok(!source.snippet.includes("[klathrassian-bureaucracy]"));
  }],
  ["links to unwritten articles open a contextual notice without fetching nonexistent files", async () => {
    const { api, requests } = createRuntime({ overrides: {
      "content/organisations/aldovian-academy.md": "---\ntitle: Missing Link Fixture\n---\n[Mariah Fairford](people/mariah-fairford)"
    } });
    const html = await api.getMarkdown(await api.getEntry("organisations/aldovian-academy"));
    assert.ok(html.includes('class="missing-article"'));
    const href = html.match(/href="([^"]+)"/)[1].replace(/&amp;/g, "&");
    const url = new URL(href);
    assert.equal(url.searchParams.get("page"), "people/mariah-fairford");
    assert.equal(url.searchParams.get("title"), "Mariah Fairford");
    assert.equal(url.searchParams.get("from"), "organisations/aldovian-academy");
    const entry = await api.getEntry("people/mariah-fairford");
    assert.equal(entry.missing, true);
    assert.equal(entry.parent, "people");
    assert.equal(entry.summary, "This content doesn't exist yet.");
    await api.getRelatedEntries(entry);
    const trail = await api.getBreadcrumbs(entry);
    assert.deepEqual(Array.from(trail, (page) => page.key), ["", "people", "people/mariah-fairford"]);
    assert.ok((await api.getMarkdown(entry)).includes("does not have an article yet"));
    assert.ok(!requests.some((file) => file.endsWith("mariah-fairford.md")));
  }],
  ["an unwritten link automatically opens the real article once it is indexed", async () => {
    const { api } = createRuntime({ overrides: {
      "content/people/index.md": "---\ntitle: People\nchild_pages:\n  - mariah-fairford.md\n---\n",
      "content/people/mariah-fairford.md": "---\ntitle: Mariah Fairford\n---\nAn existing article.",
      "content/organisations/aldovian-academy.md": "---\ntitle: Link Fixture\n---\n[Mariah Fairford](people/mariah-fairford)"
    } });
    const html = await api.getMarkdown(await api.getEntry("organisations/aldovian-academy"));
    assert.ok(!html.includes("missing-article"));
    assert.ok(html.includes("page=people%2Fmariah-fairford"));
    assert.ok(!(await api.getEntry("people/mariah-fairford")).missing);
  }],
  ["missing-page navigation rejects unsafe keys and retains the nearest existing section", async () => {
    const { api } = createRuntime();
    const entry = await api.getEntry("locations/beyond-erran/ajrazan");
    assert.equal(entry.parent, "locations");
    for (const key of ["../outside", "people//name", ".git/config", "people/name?query"]) {
      await assert.rejects(() => api.getEntry(key), /No (?:field )?notes/);
    }
  }],
  ["image captions group adjacent text into semantic figures and preserve inline Markdown and search", async () => {
    const { api } = createRuntime({ overrides: {
      "content/cultures/customs.md": `---\ntitle: Customs\n---\n![A stone](../_static/img/ancient_guidestone.png)\n*Ancient **guidestone** near [Lembrow](lembrow).*\nSecond caption line with https://example.com and <script>unsafe</script>.\n\nOrdinary paragraph.\n\n[![Linked illustration](../_static/img/Akkamon.png)](https://example.com)  \nA linked image caption.`
    } });
    const html = await api.getMarkdown(await api.getEntry("cultures/customs"));
    assert.equal((html.match(/<figure>/g) || []).length, 2);
    assert.match(html, /<figure>\s*<img[^>]+>[\s]*<figcaption>\s*<em>Ancient <strong>guidestone<\/strong> near <a[^>]+>Lembrow<\/a>\.<\/em>/);
    assert.ok(html.includes("page=locations%2Fvalley-of-lem%2Flembrow"));
    assert.match(html, /Second caption line with <a href="https:\/\/example.com"/);
    assert.ok(html.includes("&lt;script&gt;unsafe&lt;/script&gt;"));
    assert.match(html, /<\/figcaption>\s*<\/figure>\s*<p>Ordinary paragraph\.<\/p>/);
    assert.match(html, /<figure>\s*<a href="https:\/\/example.com"><img[^>]+><\/a>\s*<figcaption>\s*A linked image caption\./);
    const result = (await api.search("guidestone")).find((entry) => entry.key === "cultures/customs");
    assert.equal(result.matchScope, "body");
    assert.ok(result.snippet.includes("Ancient guidestone near Lembrow"));
  }],
  ["images without adjacent captions, inline images, and code keep normal Markdown behavior", async () => {
    const body = "![A stone](stone.png)\n\nSeparate paragraph.\n\nAn inline ![stone](stone.png)\ncontinues as prose.\n\n![First](first.png)\n![Second](second.png)\n\n```markdown\n![Example](example.png)\nNot a caption inside code.\n```";
    const { api } = createRuntime({ overrides: {
      "content/cultures/customs.md": `---\ntitle: Customs\n---\n${body}`
    } });
    const html = await api.getMarkdown(await api.getEntry("cultures/customs"));
    assert.ok(!html.includes("<figure>"));
    assert.match(html, /<p>Separate paragraph\.<\/p>/);
    assert.match(html, /<p>An inline <img[^>]+>\ncontinues as prose\.<\/p>/);
    assert.match(html, /<pre><code class="language-markdown">!\[Example\]/);
  }],
  ["existing religious illustrations have captions", async () => {
    const { api } = createRuntime();
    const html = await api.getMarkdown(await api.getEntry("organisations/order-of-scarlet"));
    assert.equal((html.match(/<figcaption>/g) || []).length, 2);
    assert.match(html, /<figcaption>\s*<em><a[^>]+>Akkamon<\/a>, the God of Order<\/em>/);
    assert.match(html, /<figcaption>\s*<em><a[^>]+>Ithikku<\/a>, the God of Chaos<\/em>/);
  }],
  ["article illustrations and the atlas image resolve under the renamed content directory", async () => {
    const { api } = createRuntime();
    const entry = await api.getEntry("organisations/order-of-scarlet");
    const html = await api.getMarkdown(entry);
    const images = [...html.matchAll(/<img src="([^"]+)"/g)].map((match) => ({
      tagName: "IMG",
      attributes: { src: match[1] },
      getAttribute(name) { return this.attributes[name]; },
      setAttribute(name, value) { this.attributes[name] = value; }
    }));
    assert.equal(images.length, 2);
    const container = { querySelectorAll: () => images };
    api.renderBody(container, html, entry);
    for (const image of images) {
      const url = new URL(image.attributes.src);
      assert.ok(url.pathname.startsWith("/dnd/content/_static/img/"));
      assert.ok(fs.existsSync(path.join(root, url.pathname.slice("/dnd/".length))));
      assert.equal(image.loading, "lazy");
    }
    const mapSource = read("map.html").match(/id="map-image" src="([^"]+)"/)[1];
    assert.equal(mapSource, "content/_static/img/map_of_erran.jpg");
    assert.ok(fs.existsSync(path.join(root, mapSource)));
  }]
];

(async () => {
  for (const [name, check] of checks) {
    await check();
    console.log(`PASS ${name}`);
  }
  console.log(`${checks.length} content checks passed.`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
