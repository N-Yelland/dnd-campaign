(function () {
  function appendHighlighted(container, text, query) {
    let offset = 0;
    for (const range of window.CampaignContent.getSearchMatches(text, query)) {
      container.append(document.createTextNode(text.slice(offset, range.start)));
      const mark = document.createElement("mark");
      mark.className = "search-highlight";
      mark.textContent = text.slice(range.start, range.end);
      container.append(mark);
      offset = range.end;
    }
    container.append(document.createTextNode(text.slice(offset)));
  }

  function resultLink(result, preview, query) {
    const link = document.createElement("a");
    link.href = result.href;
    const path = document.createElement("span");
    path.className = "search-result-path";
    path.textContent = result.path;
    const title = document.createElement(preview ? "strong" : "h2");
    appendHighlighted(title, result.title, query);
    const snippet = document.createElement(preview ? "span" : "p");
    snippet.className = "search-result-snippet";
    appendHighlighted(snippet, result.snippet, query);
    link.append(path, title, snippet);
    return link;
  }

  function attach(header) {
    const form = header.querySelector("#site-search");
    const input = form.querySelector("input");
    const popup = form.querySelector(".search-suggestions");
    const status = popup.querySelector("[role=status]");
    const list = popup.querySelector("ul");
    const allResults = popup.querySelector(".search-all");
    let timer;
    let revision = 0;

    input.value = (new URLSearchParams(window.location.search).get("q") || "").slice(0, 160);

    function close() {
      clearTimeout(timer);
      revision++;
      popup.hidden = true;
    }

    async function showSuggestions(query, request) {
      popup.hidden = false;
      list.replaceChildren();
      allResults.hidden = true;
      status.textContent = "Searching the guide…";
      try {
        const results = await window.CampaignContent.search(query);
        if (request !== revision) return;
        status.textContent = results.length ? `${results.length} ${results.length === 1 ? "article" : "articles"} found` : "No articles found. Try a different name or phrase.";
        for (const result of results.slice(0, 5)) {
          const item = document.createElement("li");
          item.append(resultLink(result, true, query));
          list.append(item);
        }
        if (results.length) {
          allResults.href = `search.html?q=${encodeURIComponent(query)}`;
          allResults.textContent = `View all ${results.length} ${results.length === 1 ? "result" : "results"}`;
          allResults.hidden = false;
        }
      } catch (error) {
        if (request !== revision) return;
        status.textContent = "Search is unavailable right now. Please try again.";
        console.error(error);
      }
    }

    function closeMenu() {
      header.querySelector(".menu-toggle").setAttribute("aria-expanded", "false");
      header.querySelector(".primary-nav").classList.remove("is-open");
    }

    function schedule() {
      closeMenu();
      close();
      const query = input.value.trim();
      if (query.length < 2) return;
      const request = revision;
      timer = setTimeout(() => showSuggestions(query, request), 200);
    }

    input.addEventListener("input", schedule);
    input.addEventListener("focus", schedule);
    input.addEventListener("click", closeMenu);
    form.addEventListener("submit", close);
    form.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        input.focus();
        close();
        return;
      }
      if (popup.hidden || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
      const links = [...popup.querySelectorAll("a[href]")].filter((link) => !link.hidden);
      if (!links.length) return;
      const index = links.indexOf(document.activeElement);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        links[Math.min(index + 1, links.length - 1)].focus();
      } else if (index >= 0) {
        event.preventDefault();
        if (index === 0) input.focus();
        else links[index - 1].focus();
      }
    });
    document.addEventListener("click", (event) => {
      if (!form.contains(event.target)) close();
    });
    form.addEventListener("focusout", () => {
      setTimeout(() => {
        if (!form.contains(document.activeElement)) close();
      }, 0);
    });
  }

  async function renderResults() {
    const list = document.getElementById("search-results-list");
    if (!list) return;
    const status = document.getElementById("search-results-status");
    const retry = document.getElementById("search-retry");
    const query = (new URLSearchParams(window.location.search).get("q") || "").trim().slice(0, 160);
    retry.hidden = true;
    list.replaceChildren();
    if (query.length < 2) {
      status.textContent = "Enter at least two characters in the search field above to find an article.";
      return;
    }
    document.title = `Search: ${query} — Erran Adventurer's Guide`;
    document.getElementById("search-title").textContent = `Results for “${query}”`;
    status.textContent = "Searching the guide…";
    list.setAttribute("aria-busy", "true");
    try {
      const results = await window.CampaignContent.search(query);
      status.textContent = results.length ? `${results.length} ${results.length === 1 ? "article" : "articles"} found` : "No articles found. Try a different name or phrase.";
      for (const result of results) {
        const item = document.createElement("li");
        item.append(resultLink(result, false, query));
        list.append(item);
      }
    } catch (error) {
      status.textContent = "Search is unavailable right now. Please try again.";
      retry.hidden = false;
      retry.onclick = renderResults;
      console.error(error);
    } finally {
      list.removeAttribute("aria-busy");
    }
  }

  function highlightText(root, query) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const positions = [];
    let text = "";
    let node;
    while ((node = walker.nextNode())) {
      for (let offset = 0; offset < node.data.length; offset++) {
        const character = node.data[offset];
        if (/\s/.test(character)) {
          if (text.endsWith(" ")) continue;
          text += " ";
        } else text += character;
        positions.push({ node, start: offset, end: offset + 1 });
      }
    }
    const byNode = new Map();
    for (const range of window.CampaignContent.getSearchMatches(text, query)) {
      for (let offset = range.start; offset < range.end; offset++) {
        const position = positions[offset];
        if (!byNode.has(position.node)) byNode.set(position.node, []);
        const ranges = byNode.get(position.node);
        const previous = ranges[ranges.length - 1];
        if (previous && position.start <= previous.end) previous.end = position.end;
        else ranges.push({ start: position.start, end: position.end });
      }
    }
    let firstMark;
    for (const [node, ranges] of byNode) {
      const fragment = document.createDocumentFragment();
      let offset = 0;
      for (const range of ranges) {
        fragment.append(document.createTextNode(node.data.slice(offset, range.start)));
        const mark = document.createElement("mark");
        mark.className = "search-highlight";
        mark.textContent = node.data.slice(range.start, range.end);
        fragment.append(mark);
        if (!firstMark) firstMark = mark;
        offset = range.end;
      }
      fragment.append(document.createTextNode(node.data.slice(offset)));
      node.replaceWith(fragment);
    }
    return firstMark;
  }

  async function highlightArticle(article, params) {
    const query = (params.get("q") || "").trim().slice(0, 160);
    if (!query) return;
    const matches = new Map();
    for (const [scope, id] of [["body", "article-body"], ["summary", "article-summary"], ["title", "article-title"]]) {
      const root = article.querySelector(`#${id}`);
      if (root && !root.hidden) matches.set(scope, highlightText(root, query));
    }
    const target = matches.get(params.get("match")) || matches.get("body") || matches.get("summary") || matches.get("title");
    if (!target) return;
    target.id = "search-match";
    target.setAttribute("tabindex", "-1");
    if (window.location.hash && window.location.hash !== "#search-match") return;
    if (document.fonts) await document.fonts.ready;
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "center", behavior: "instant" });
  }

  window.CampaignSearch = { attach, highlightArticle };
  renderResults();
})();
