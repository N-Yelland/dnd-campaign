(function () {
  const markdown = window.markdownit({
    html: false,
    linkify: true,
    typographer: true
  });
  const sourceRequests = new Map();
  let fileIndexPromise;
  let mapEntriesPromise;

  function getSource(file) {
    if (!sourceRequests.has(file)) {
      const sourceUrl = new URL(`source/${file}`, document.baseURI);
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

  function getFileIndex() {
    if (!fileIndexPromise) {
      fileIndexPromise = fetch("source/content-files.json")
        .then((response) => {
          if (!response.ok) throw new Error(`Could not load the Markdown file list (${response.status}).`);
          return response.json();
        })
        .then((files) => {
          if (!Array.isArray(files)) throw new Error("The Markdown file list must be an array.");
          const filesByKey = new Map();
          for (const file of files) {
            if (typeof file !== "string" || file.startsWith("/") ||
                file.split("/").some((part) => !part || part === "." || part === "..") ||
                !file.endsWith(".md")) {
              throw new Error(`Invalid Markdown path in source/content-files.json: ${file}`);
            }
            const key = keyFromFile(file);
            if (filesByKey.has(key)) throw new Error(`Duplicate Markdown content key: ${key}`);
            filesByKey.set(key, file);
          }
          return { files, filesByKey };
        })
        .catch((error) => {
          fileIndexPromise = null;
          throw error;
        });
    }
    return fileIndexPromise;
  }

  function parseFile(file, source) {
    const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match) throw new Error(`${file}: missing YAML front matter.`);
    const metadata = window.jsyaml.safeLoad(match[1]) || {};
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new Error(`${file}: YAML front matter must be an object.`);
    }
    const entry = {
      key: keyFromFile(file),
      file,
      title: metadata.title,
      summary: metadata.summary || "",
      section: metadata.section || "",
      order: Number.isFinite(metadata.order) ? metadata.order : 1000,
      parent: metadata.parent || "",
      children: metadata.children || [],
      map: metadata.map || null,
      body: source.slice(match[0].length)
    };
    if (!entry.title) throw new Error(`${file}: front matter must include a title.`);
    if (typeof entry.title !== "string" || typeof entry.parent !== "string" ||
        typeof entry.summary !== "string" || typeof entry.section !== "string") {
      throw new Error(`${file}: title, parent, summary, and section must be text.`);
    }
    if (!Array.isArray(entry.children) || entry.children.some((child) => typeof child !== "string")) {
      throw new Error(`${file}: children must be a list of content keys.`);
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
    }
    return entry;
  }

  async function getEntryFromIndex(key, index) {
    const file = index.filesByKey.get(key);
    if (!file) throw new Error(`No field notes were found for "${key}".`);
    return parseFile(file, await getSource(file));
  }

  async function getEntriesByKeys(keys) {
    const index = await getFileIndex();
    return Promise.all([...new Set(keys)].map((key) => getEntryFromIndex(key, index)));
  }

  async function getRelatedEntries(entry) {
    const keys = [...(entry.parent ? [entry.parent] : []), ...entry.children];
    const related = await getEntriesByKeys(keys);
    const byKey = new Map(related.map((candidate) => [candidate.key, candidate]));
    if (entry.parent && !byKey.get(entry.parent).children.includes(entry.key)) {
      throw new Error(`${entry.file}: parent "${entry.parent}" does not list this page as a child.`);
    }
    for (const child of entry.children) {
      if (byKey.get(child).parent !== entry.key) {
        throw new Error(`${entry.file}: child "${child}" does not point back to this parent.`);
      }
    }
    return related;
  }

  async function getMapEntries() {
    if (!mapEntriesPromise) {
      mapEntriesPromise = (async () => {
        const index = await getFileIndex();
        const locationFiles = index.files.filter((file) => file.startsWith("locations/"));
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

  async function getMarkdown(entry) {
    const source = await getSource(entry.file);
    let body = parseFile(entry.file, source).body.trimStart();
    const heading = body.match(/^#\s+(.+)\r?\n+/);
    if (heading && heading[1].trim() === entry.title) {
      body = body.slice(heading[0].length);
    }
    return markdown.render(body);
  }

  function renderBody(container, html, entry) {
    container.innerHTML = html;
    const sourceUrl = new URL(`source/${entry.file}`, document.baseURI);
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
  }

  window.CampaignContent = {
    getEntry: async (key) => getEntryFromIndex(key, await getFileIndex()),
    getEntriesByKeys,
    getRelatedEntries,
    getMapEntries,
    getMarkdown,
    renderBody
  };
})();
