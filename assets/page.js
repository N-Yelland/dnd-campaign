(async function () {
  const status = document.getElementById("content-status");
  const article = document.getElementById("article");
  const params = new URLSearchParams(window.location.search);
  const key = params.get("page") || "";

  try {
    const entry = await window.CampaignContent.getEntry(key);
    if (entry.missing) {
      const title = (params.get("title") || "").trim().slice(0, 160);
      if (title) entry.title = title;
      article.classList.add("is-missing");
      document.body.classList.add("missing-page");
    }
    const [rendered, relatedEntries, breadcrumbs] = await Promise.all([
      window.CampaignContent.getMarkdown(entry),
      window.CampaignContent.getRelatedEntries(entry),
      window.CampaignContent.getBreadcrumbs(entry)
    ]);

    document.title = `${entry.title} — Erran Adventurer's Guide`;
    const breadcrumbList = document.getElementById("article-breadcrumbs");
    breadcrumbList.replaceChildren();
    breadcrumbs.forEach((page, index) => {
      const item = document.createElement("li");
      if (index > 0) {
        const separator = document.createElement("span");
        separator.textContent = "/";
        separator.setAttribute("aria-hidden", "true");
        item.append(separator);
      }
      const isRoot = page.key === "";
      const isCurrent = index === breadcrumbs.length - 1;
      const label = document.createElement(isCurrent && !isRoot ? "span" : "a");
      label.textContent = isRoot ? "Adventurer's Guide" : page.title;
      if (label.tagName === "A") label.href = isRoot ? "page.html" : page.href;
      if (isCurrent) label.setAttribute("aria-current", "page");
      item.append(label);
      breadcrumbList.append(item);
    });
    const parent = relatedEntries.find((candidate) => candidate.key === entry.parent);
    const kicker = document.getElementById("article-kicker");
    kicker.textContent = parent ? parent.title : "";
    kicker.hidden = !parent;
    document.getElementById("article-title").textContent = entry.title;

    const summary = document.getElementById("article-summary");
    if (entry.summary) {
      summary.textContent = entry.summary;
      summary.hidden = false;
    }

    window.CampaignContent.renderBody(document.getElementById("article-body"), rendered, entry);
    if (entry.missing) {
      const actions = document.createElement("nav");
      actions.className = "missing-actions";
      actions.setAttribute("aria-label", "Find related content");
      const sourceKey = params.get("from");
      const sources = sourceKey === null ? [] : await window.CampaignContent.getEntriesByKeys([sourceKey]).catch(() => []);
      const source = sources[0] || parent;
      if (source) {
        const back = document.createElement("a");
        back.href = source.href;
        back.textContent = `Return to ${source.title}`;
        actions.append(back);
      }
      const search = document.createElement("a");
      search.href = `search.html?q=${encodeURIComponent(entry.title)}`;
      search.textContent = "Search for mentions";
      actions.append(search);
      document.getElementById("article-body").append(actions);
    }

    const childEntries = entry.children.map((child) => relatedEntries.find((candidate) => candidate.key === child));
    if (childEntries.length) {
      const childLinks = document.getElementById("child-links");
      for (const child of childEntries) {
        if (!child) continue;
        const link = document.createElement("a");
        link.className = "child-link";
        link.href = child.href;
        const title = document.createElement("strong");
        title.textContent = child.title;
        link.append(title);
        if (child.summary) {
          const description = document.createElement("span");
          description.textContent = child.summary;
          link.append(description);
        }
        childLinks.append(link);
      }
      document.getElementById("article-children").hidden = false;
    }

    if (parent) {
      const parentLink = document.getElementById("article-parent");
      parentLink.innerHTML = "";
      parentLink.append("Filed under ");
      const link = document.createElement("a");
      link.href = parent.href;
      link.textContent = parent.title;
      parentLink.append(link);
      parentLink.hidden = false;
    }

    article.hidden = false;
    status.hidden = true;
    window.ArticleContents.render(document.getElementById("article-body"));
    await window.CampaignSearch.highlightArticle(article, params);
  } catch (error) {
    status.classList.add("status-error");
    status.textContent = error.message;
  }
})();
