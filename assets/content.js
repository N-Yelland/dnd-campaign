(function () {
  const markdown = window.markdownit({
    html: false,
    linkify: true,
    typographer: true
  });
  markdown.core.ruler.after("inline", "image_captions", (state) => {
    const result = [];
    for (let index = 0; index < state.tokens.length; index++) {
      const open = state.tokens[index];
      const inline = state.tokens[index + 1];
      const close = state.tokens[index + 2];
      if (open.type !== "paragraph_open" || inline?.type !== "inline" || close?.type !== "paragraph_close") {
        result.push(open);
        continue;
      }
      const children = inline.children || [];
      const split = children.findIndex((token) => ["softbreak", "hardbreak"].includes(token.type));
      const image = children.slice(0, split);
      const caption = children.slice(split + 1);
      const standalone = (image.length === 1 && image[0].type === "image") ||
        (image.length === 3 && image[0].type === "link_open" && image[1].type === "image" && image[2].type === "link_close");
      if (split < 0 || !standalone || caption.some((token) => token.type === "image") ||
          !caption.some((token) => token.content.trim())) {
        result.push(open);
        continue;
      }
      open.type = "figure_open";
      open.tag = "figure";
      open.hidden = false;
      close.type = "figure_close";
      close.tag = "figure";
      close.hidden = false;
      inline.children = image;
      const captionOpen = new state.Token("figcaption_open", "figcaption", 1);
      captionOpen.block = true;
      const captionInline = new state.Token("inline", "", 0);
      captionInline.children = caption;
      const captionClose = new state.Token("figcaption_close", "figcaption", -1);
      captionClose.block = true;
      result.push(open, inline, captionOpen, captionInline, captionClose, close);
      index += 2;
    }
    state.tokens = result;
  });
  markdown.inline.ruler.after("link", "article_reference", (state, silent) => {
    if (state.src[state.pos] !== "[" || state.linkLevel > 0 || !state.env.resolveArticle) return false;
    const end = state.src.indexOf("]", state.pos + 1);
    if (end < 0 || end >= state.posMax || /[\[(\]]/.test(state.src[end + 1] || "")) return false;
    const name = state.src.slice(state.pos + 1, end);
    if (!name || /^[?#]/.test(name) || /[\s\[\]()*]/.test(name)) return false;
    const target = state.env.resolveArticle(name);
    if (!target) return false;
    if (!silent) {
      const open = state.push("link_open", "a", 1);
      open.attrs = [["href", target.href]];
      const text = state.push("text", "", 0);
      text.content = target.title || name;
      text.meta = { articleReference: target.key };
      state.push("link_close", "a", -1);
    }
    state.pos = end + 1;
    return true;
  });
  const sourceRequests = new Map();
  let fileIndexPromise;
  let mapEntriesPromise;
  let searchIndexPromise;

  function getSource(file) {
    if (!sourceRequests.has(file)) {
      const sourceUrl = new URL(`content/${file}`, document.baseURI);
      const request = fetch(sourceUrl).then((response) => {
        if (!response.ok) throw new Error(`Could not load "${file}" (${response.status}).`);
        return response.text();
      }).catch((error) => {
        sourceRequests.delete(file);
        throw error;
      });
      sourceRequests.set(file, request);
    }
    return sourceRequests.get(file);
  }

  function keyFromFile(file) {
    return file.replace(/(?:^|\/)index\.md$/i, "").replace(/\.md$/i, "");
  }

  function parentFromFile(file) {
    if (file === "index.md") return null;
    const parts = file.split("/");
    parts.pop();
    if (file.endsWith("/index.md")) parts.pop();
    return parts.join("/");
  }

  function fileFromChild(file, child) {
    const name = child.replace(/\/$/, "");
    if (!name || name === "." || name === ".." || name.toLowerCase() === "index.md" ||
        /[/\\?#%:\u0000-\u001f]/.test(name)) {
      throw new Error(`${file}: child_pages must name immediate files or directories (ending in /): ${child}`);
    }
    const directory = file.slice(0, file.lastIndexOf("/") + 1);
    return `${directory}${child}${child.endsWith("/") ? "index.md" : ""}`;
  }

  function getFileIndex() {
    if (!fileIndexPromise) {
      fileIndexPromise = (async () => {
        const files = [];
        const filesByKey = new Map();

        function addFile(file) {
          const key = keyFromFile(file);
          if (filesByKey.has(key)) throw new Error(`Duplicate content key: ${key}`);
          filesByKey.set(key, file);
          files.push(file);
        }

        async function visitIndex(file) {
          addFile(file);
          const entry = parseFile(file, await getSource(file));
          await Promise.all(entry.childPages.map((child) => {
            const childFile = fileFromChild(file, child);
            if (child.endsWith("/")) return visitIndex(childFile);
            addFile(childFile);
          }));
        }

        await visitIndex("index.md");
        const keysByName = new Map();
        for (const [key, file] of filesByKey) {
          if (!key || !file.endsWith(".md")) continue;
          const name = key.slice(key.lastIndexOf("/") + 1).toLowerCase();
          if (!keysByName.has(name)) keysByName.set(name, []);
          keysByName.get(name).push(key);
        }
        return { files, filesByKey, keysByName };
      })().catch((error) => {
        fileIndexPromise = null;
        throw error;
      });
    }
    return fileIndexPromise;
  }

  function articleTitle(title, topText = "") {
    const prefix = topText.trim();
    if (!prefix) return title;
    const name = title.trim();
    const lowerName = name.toLowerCase();
    const lowerPrefix = prefix.toLowerCase();
    return lowerName === lowerPrefix || lowerName.startsWith(`${lowerPrefix} `)
      ? name : `${prefix} ${name}`;
  }

  function parseFile(file, source) {
    const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match) throw new Error(`${file}: missing YAML front matter.`);
    const metadata = window.jsyaml.safeLoad(match[1]) || {};
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new Error(`${file}: YAML front matter must be an object.`);
    }
    const childPages = metadata.child_pages === undefined ? [] : metadata.child_pages;
    if (!Array.isArray(childPages) || childPages.some((child) => typeof child !== "string")) {
      throw new Error(`${file}: child_pages must be a list of relative file or directory paths.`);
    }
    if (new Set(childPages).size !== childPages.length) {
      throw new Error(`${file}: child_pages contains duplicate paths.`);
    }
    if (childPages.length && !/(?:^|\/)index\.md$/.test(file)) {
      throw new Error(`${file}: child_pages belongs in the folder's index.md.`);
    }
    const entry = {
      key: keyFromFile(file),
      file,
      href: `page.html?page=${encodeURIComponent(keyFromFile(file))}`,
      title: metadata.title,
      summary: metadata.summary || "",
      order: Number.isFinite(metadata.order) ? metadata.order : 1000,
      parent: parentFromFile(file),
      childPages,
      children: childPages.map((child) => keyFromFile(fileFromChild(file, child))),
      map: metadata.map || null,
      body: source.slice(match[0].length)
    };
    if (!entry.title) throw new Error(`${file}: front matter must include a title.`);
    if (typeof entry.title !== "string" || typeof entry.summary !== "string") {
      throw new Error(`${file}: title and summary must be text.`);
    }
    if (entry.map) {
      if (typeof entry.map !== "object" || Array.isArray(entry.map)) {
        throw new Error(`${file}: map metadata must be an object.`);
      }
      const coords = entry.map.coords;
      if (!Array.isArray(coords) || coords.length !== 2) {
        throw new Error(`${file}: map.coords must contain two numbers between 0 and 1.`);
      }
      const [x, y] = coords;
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
        throw new Error(`${file}: map.coords must contain two numbers between 0 and 1.`);
      }
      for (const field of ["label", "type", "topText"]) {
        if (entry.map[field] !== undefined && typeof entry.map[field] !== "string") {
          throw new Error(`${file}: map.${field} must be text.`);
        }
      }
      // Keep the atlas's main label separate from its smaller prefix.
      entry.map = { ...entry.map, label: entry.map.label || entry.title };
      entry.title = articleTitle(entry.title, entry.map.topText);
    }
    return entry;
  }

  async function getEntryFromIndex(key, index) {
    const file = index.filesByKey.get(key);
    if (!file) throw new Error(`No notes were found for "${key}".`);
    if (!file.endsWith(".md")) {
      return {
        key,
        file,
        href: new URL(`content/${file}`, document.baseURI).href,
        title: file.slice(file.lastIndexOf("/") + 1),
        summary: "",
        parent: parentFromFile(file),
        children: []
      };
    }
    return parseFile(file, await getSource(file));
  }

  function validArticleKey(key) {
    return typeof key === "string" && /^[\p{L}\p{N}_-][\p{L}\p{N}_.-]*(?:\/[\p{L}\p{N}_-][\p{L}\p{N}_.-]*)*$/u.test(key);
  }

  async function getEntry(key) {
    const index = await getFileIndex();
    if (index.filesByKey.has(key)) return getEntryFromIndex(key, index);
    if (!validArticleKey(key)) throw new Error(`No notes were found for "${key}".`);
    const parts = key.split("/");
    const name = parts.pop();
    while (parts.length && !index.filesByKey.has(parts.join("/"))) parts.pop();
    return {
      key, file: `${key}.md`, href: `page.html?page=${encodeURIComponent(key)}`,
      title: name.replace(/[-_]/g, " ").replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase()),
      summary: "This content doesn't exist yet.", missing: true,
      parent: parts.join("/"), children: [], childPages: [], map: null, body: ""
    };
  }

  function resolveArticle(value, fromFile, index, allowMissing = false) {
    if (!value || value.startsWith("#") || value.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(value)) return null;
    const contentUrl = new URL("content/", document.baseURI);
    const sourceUrl = new URL(fromFile, contentUrl);
    const sourceTarget = new URL(value, sourceUrl);

    function keyForUrl(url) {
      if (url.origin !== contentUrl.origin || !url.pathname.startsWith(contentUrl.pathname)) return null;
      let path;
      try { path = decodeURIComponent(url.pathname.slice(contentUrl.pathname.length)); }
      catch { return null; }
      if (/\.[^/]+$/.test(path) && !path.endsWith(".md")) return null;
      path = path.replace(/\/$/, "");
      const key = /(?:^|\/)index$/.test(path) ? path.replace(/(?:^|\/)index$/, "") : keyFromFile(path);
      const file = index.filesByKey.get(key);
      return file && file.endsWith(".md") ? key : null;
    }

    let key = keyForUrl(sourceTarget);
    let ambiguous = false;
    if (key === null && !value.startsWith(".")) {
      key = keyForUrl(new URL(value.replace(/^\//, ""), contentUrl));
    }
    if (key === null && !value.startsWith(".") && !value.startsWith("/")) {
      let name;
      try { name = decodeURIComponent(value.split(/[?#]/)[0]); }
      catch { return null; }
      if (!name.includes("/")) {
        const candidates = index.keysByName.get(name.replace(/\.md$/, "").toLowerCase()) || [];
        if (candidates.length === 1) key = candidates[0];
        ambiguous = candidates.length > 1;
      }
    }
    let missing = false;
    if (key === null && allowMissing && !ambiguous) {
      const path = value.split(/[?#]/)[0];
      const target = !value.startsWith(".") && path.includes("/") ? new URL(value.replace(/^\//, ""), contentUrl) : sourceTarget;
      if (target.origin !== contentUrl.origin || !target.pathname.startsWith(contentUrl.pathname)) return null;
      let name;
      try { name = decodeURIComponent(target.pathname.slice(contentUrl.pathname.length)); }
      catch { return null; }
      if (/\.[^/]+$/.test(name) && !name.endsWith(".md")) return null;
      key = keyFromFile(name.replace(/\/$/, ""));
      if (!validArticleKey(key)) return null;
      missing = true;
    }
    if (key === null) return null;
    const reader = new URL("page.html", document.baseURI);
    reader.search = sourceTarget.search;
    reader.searchParams.set("page", key);
    reader.hash = sourceTarget.hash;
    return { key, href: reader.href, missing };
  }

  async function getEntriesByKeys(keys) {
    const index = await getFileIndex();
    return Promise.all([...new Set(keys)].map((key) => getEntryFromIndex(key, index)));
  }

  async function getRelatedEntries(entry) {
    const keys = [...(entry.parent !== null ? [entry.parent] : []), ...entry.children];
    const related = await getEntriesByKeys(keys);
    const byKey = new Map(related.map((candidate) => [candidate.key, candidate]));
    if (!entry.missing && entry.parent !== null && !byKey.get(entry.parent).children.includes(entry.key)) {
      throw new Error(`${entry.file}: parent "${entry.parent}" does not list this page as a child.`);
    }
    for (const child of entry.children) {
      if (byKey.get(child).parent !== entry.key) {
        throw new Error(`${entry.file}: child "${child}" does not point back to this parent.`);
      }
    }
    return related;
  }

  async function getBreadcrumbs(entry) {
    const index = await getFileIndex();
    const trail = [entry];
    let current = entry;
    while (current.parent !== null) {
      current = await getEntryFromIndex(current.parent, index);
      trail.push(current);
    }
    return trail.reverse();
  }

  async function getMapEntries() {
    if (!mapEntriesPromise) {
      mapEntriesPromise = (async () => {
        const index = await getFileIndex();
        const locationFiles = index.files.filter((file) => file.startsWith("locations/") && file.endsWith(".md"));
        const locations = await Promise.all(locationFiles.map(async (file) =>
          parseFile(file, await getSource(file))
        ));
        return locations.filter((entry) => entry.map).map((entry) => ({
          key: entry.key,
          title: entry.title,
          label: entry.map.label || entry.title,
          parent: entry.parent,
          children: entry.children,
          summary: entry.summary,
          ...entry.map
        }));
      })().catch((error) => {
        mapEntriesPromise = null;
        throw error;
      });
    }
    return mapEntriesPromise;
  }

  function normalizeSearch(text) {
    return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function getSearchMatches(text, query) {
    const terms = [...new Set(normalizeSearch(query.trim().slice(0, 160)).match(/[\p{L}\p{N}]+/gu) || [])];
    if (!terms.length) return [];
    let folded = "";
    let offset = 0;
    const positions = [];
    for (const character of text) {
      const normalized = normalizeSearch(character);
      const end = offset + character.length;
      for (let index = 0; index < normalized.length; index++) positions.push({ start: offset, end });
      if (!normalized && positions.length) positions[positions.length - 1].end = end;
      folded += normalized;
      offset = end;
    }
    const ranges = [];
    for (const term of terms) {
      let start = folded.indexOf(term);
      while (start >= 0) {
        ranges.push({ start: positions[start].start, end: positions[start + term.length - 1].end });
        start = folded.indexOf(term, start + term.length);
      }
    }
    ranges.sort((a, b) => a.start - b.start || b.end - a.end);
    const merged = [];
    for (const range of ranges) {
      const previous = merged[merged.length - 1];
      if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
      else merged.push({ ...range });
    }
    return merged;
  }

  function markdownBody(entry) {
    let body = entry.body.trimStart();
    const heading = body.match(/^#\s+(.+)\r?\n+/);
    if (heading && articleTitle(heading[1].trim(), entry.map ? entry.map.topText : undefined) === entry.title) {
      body = body.slice(heading[0].length);
    }
    return body;
  }

  function plainText(body, env = {}) {
    const parts = [];
    for (const token of markdown.parse(body, env)) {
      if (token.type === "inline") {
        for (const child of token.children || []) {
          if (["text", "code_inline", "image"].includes(child.type)) parts.push(child.content);
          if (["softbreak", "hardbreak"].includes(child.type)) parts.push(" ");
        }
        parts.push(" ");
      } else if (["fence", "code_block"].includes(token.type)) {
        parts.push(token.content, " ");
      }
    }
    return parts.join("").replace(/\s+/g, " ").trim();
  }

  function getSearchIndex() {
    if (!searchIndexPromise) {
      searchIndexPromise = (async () => {
        const index = await getFileIndex();
        const files = index.files.filter((file) => file.endsWith(".md") && !file.startsWith("_static/"));
        const entries = await Promise.all(files.map((file) => getEntryFromIndex(keyFromFile(file), index)));
        const byKey = new Map(entries.map((entry) => [entry.key, entry]));
        return entries.map((entry) => {
          const ancestors = [];
          let parent = byKey.get(entry.parent);
          while (parent) {
            if (parent.key) ancestors.unshift(parent.title);
            parent = byKey.get(parent.parent);
          }
          const text = plainText(markdownBody(entry), {
            resolveArticle: (value) => {
              const target = resolveArticle(value, entry.file, index);
              return target && { ...target, title: byKey.get(target.key)?.title };
            }
          });
          return {
            entry, text,
            path: ancestors.join(" / ") || "Adventurer's Guide",
            titleSearch: normalizeSearch(entry.title),
            summarySearch: normalizeSearch(entry.summary),
            bodySearch: normalizeSearch(text)
          };
        });
      })().catch((error) => {
        searchIndexPromise = null;
        throw error;
      });
    }
    return searchIndexPromise;
  }

  async function search(query) {
    const normalized = normalizeSearch(query.trim().slice(0, 160));
    const terms = [...new Set(normalized.match(/[\p{L}\p{N}]+/gu) || [])];
    if (!terms.length) return [];
    const index = await getSearchIndex();
    const matches = [];
    for (const candidate of index) {
      const { entry, titleSearch, summarySearch, bodySearch } = candidate;
      if (!terms.every((term) => titleSearch.includes(term) || summarySearch.includes(term) || bodySearch.includes(term))) continue;
      let score = terms.reduce((total, term) => total +
        (titleSearch.includes(term) ? 20 : 0) + (summarySearch.includes(term) ? 5 : 0) + (bodySearch.includes(term) ? 1 : 0), 0);
      if (titleSearch === normalized) score += 100;
      else if (titleSearch.startsWith(normalized)) score += 40;
      else if (titleSearch.includes(normalized)) score += 20;

      const summaryMatches = getSearchMatches(entry.summary, query);
      const bodyMatches = getSearchMatches(candidate.text, query);
      const matchScope = summaryMatches.length ? "summary" : bodyMatches.length ? "body" : "title";
      const text = matchScope === "summary" ? entry.summary : candidate.text || entry.summary || entry.title;
      const firstMatch = (matchScope === "summary" ? summaryMatches : bodyMatches)[0];
      let start = Math.max(0, (firstMatch ? firstMatch.start : 0) - 55);
      if (start > 0) {
        const nextSpace = text.indexOf(" ", start);
        if (nextSpace >= 0 && nextSpace < start + 25) start = nextSpace + 1;
      }
      const end = Math.min(text.length, start + 190);
      const snippet = `${start ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
      const href = `${entry.href}&q=${encodeURIComponent(query.trim().slice(0, 160))}&match=${matchScope}#search-match`;
      matches.push({ key: entry.key, title: entry.title, href, matchScope, path: candidate.path, snippet, score });
    }
    return matches.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title) || a.key.localeCompare(b.key));
  }

  async function getMarkdown(entry) {
    if (entry.missing) {
      return markdown.render("This topic does not have an article yet. Browse its section or search the guide to find the places where it is mentioned.");
    }
    const [source, index] = await Promise.all([getSource(entry.file), getFileIndex()]);
    const env = { resolveArticle: (value) => resolveArticle(value, entry.file, index) };
    const tokens = markdown.parse(markdownBody(parseFile(entry.file, source)), env);
    const references = [];
    function visit(token, position, siblings) {
      if (token.type === "link_open") {
        const target = resolveArticle(token.attrGet("href"), entry.file, index, true);
        if (target) {
          if (target.missing) {
            let label = "";
            for (let cursor = position + 1; cursor < siblings.length && siblings[cursor].type !== "link_close"; cursor++) {
              if (["text", "code_inline", "image"].includes(siblings[cursor].type)) label += siblings[cursor].content;
            }
            const url = new URL(target.href);
            url.searchParams.set("title", label.trim().slice(0, 160) || target.key.split("/").pop());
            url.searchParams.set("from", entry.key);
            target.href = url.href;
            token.attrJoin("class", "missing-article");
            token.attrSet("title", "This article hasn't been written yet.");
          }
          token.attrSet("href", target.href);
        }
      }
      if (typeof token.meta?.articleReference === "string") references.push(token);
      (token.children || []).forEach(visit);
    }
    tokens.forEach(visit);
    const keys = [...new Set(references.map((token) => token.meta.articleReference))];
    const targets = await Promise.allSettled(keys.map((key) => getEntryFromIndex(key, index)));
    const titles = new Map();
    targets.forEach((target, position) => {
      if (target.status === "fulfilled") titles.set(keys[position], target.value.title);
    });
    for (const token of references) token.content = titles.get(token.meta.articleReference) || token.content;
    return markdown.renderer.render(tokens, markdown.options, env);
  }

  function renderBody(container, html, entry) {
    container.innerHTML = html;
    const sourceUrl = new URL(`content/${entry.file}`, document.baseURI);
    for (const element of container.querySelectorAll("img, a")) {
      const attribute = element.tagName === "IMG" ? "src" : "href";
      const value = element.getAttribute(attribute);
      if (!value || value.startsWith("#") || /^[a-z][a-z\d+.-]*:/i.test(value)) continue;
      element.setAttribute(attribute, new URL(value, sourceUrl).href);
      if (element.tagName === "A") {
        element.setAttribute("rel", "noopener noreferrer");
      }
    }
    for (const image of container.querySelectorAll("img")) {
      image.loading = "lazy";
      image.decoding = "async";
    }
    window.ArticleImages?.enhance(container);
  }

  window.CampaignContent = {
    getEntry,
    getEntriesByKeys,
    getRelatedEntries,
    getBreadcrumbs,
    getMapEntries,
    search,
    getSearchMatches,
    getMarkdown,
    renderBody
  };
})();
