(async function () {
  const status = document.getElementById("content-status");
  const article = document.getElementById("article");
  const params = new URLSearchParams(window.location.search);
  const key = params.get("page") || "";

  try {
    if (!key) throw new Error("Choose a chapter from the field guide to begin.");
    const entry = await window.CampaignContent.getEntry(key);
    const [rendered, relatedEntries] = await Promise.all([
      window.CampaignContent.getMarkdown(entry),
      window.CampaignContent.getRelatedEntries(entry)
    ]);

    document.title = `${entry.title} — Erran Field Guide`;
    document.getElementById("breadcrumb-current").textContent = entry.title;
    document.getElementById("article-kicker").textContent = entry.section || "Field notes from Erran";
    document.getElementById("article-title").textContent = entry.title;

    const summary = document.getElementById("article-summary");
    if (entry.summary) {
      summary.textContent = entry.summary;
      summary.hidden = false;
    }

    window.CampaignContent.renderBody(document.getElementById("article-body"), rendered, entry);

    const childEntries = entry.children.map((child) => relatedEntries.find((candidate) => candidate.key === child));
    if (childEntries.length) {
      const childLinks = document.getElementById("child-links");
      for (const child of childEntries) {
        if (!child) continue;
        const link = document.createElement("a");
        link.className = "child-link";
        link.href = `page.html?page=${encodeURIComponent(child.key)}`;
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

    if (entry.parent) {
      const parent = relatedEntries.find((candidate) => candidate.key === entry.parent);
      if (parent) {
        const parentLink = document.getElementById("article-parent");
        parentLink.innerHTML = "";
        parentLink.append("Filed under ");
        const link = document.createElement("a");
        link.href = `page.html?page=${encodeURIComponent(parent.key)}`;
        link.textContent = parent.title;
        parentLink.append(link);
        parentLink.hidden = false;
      }
    }

    article.hidden = false;
    status.hidden = true;
  } catch (error) {
    status.classList.add("status-error");
    status.textContent = error.message;
  }
})();
