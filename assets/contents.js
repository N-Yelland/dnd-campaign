(function () {
  function render(body) {
    const navigation = document.getElementById("article-contents");
    const panel = document.getElementById("contents-panel");
    const list = document.getElementById("contents-list");
    const headings = [...body.querySelectorAll("h1, h2, h3, h4, h5, h6")]
      .filter((heading) => heading.textContent.trim());
    const usedIds = new Set([...document.querySelectorAll("[id]")].map((element) => element.id));

    for (const heading of headings) {
      const slug = heading.textContent.trim().normalize("NFKD").toLowerCase()
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "heading";
      const base = `section-${slug}`;
      let id = base;
      let suffix = 2;
      while (usedIds.has(id)) id = `${base}-${suffix++}`;
      heading.id = id;
      usedIds.add(id);
    }

    function openInitialSection() {
      let id;
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      const target = headings.find((heading) => heading.id === id);
      if (target) target.scrollIntoView();
    }

    if (headings.length < 2) {
      openInitialSection();
      return;
    }

    const parents = [];
    const links = [];
    for (const heading of headings) {
      const level = Number(heading.tagName.slice(1));
      while (parents.length && parents[parents.length - 1].level >= level) parents.pop();
      const parent = parents[parents.length - 1];
      let targetList = list;
      if (parent) {
        if (!parent.list) {
          parent.list = document.createElement("ol");
          parent.item.append(parent.list);
        }
        targetList = parent.list;
      }
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = `#${encodeURIComponent(heading.id)}`;
      link.textContent = heading.textContent.trim();
      item.append(link);
      targetList.append(item);
      links.push(link);
      parents.push({ level, item, list: null });
    }

    const wideScreen = window.matchMedia("(min-width: 1280px)");
    function updatePanel() {
      panel.open = wideScreen.matches;
    }
    updatePanel();
    wideScreen.addEventListener("change", updatePanel);
    navigation.hidden = false;

    let framePending = false;
    let activeLink;
    function updateCurrentSection() {
      framePending = false;
      let current = 0;
      for (let index = 0; index < headings.length; index++) {
        if (headings[index].getBoundingClientRect().top <= 48) current = index;
      }
      if (activeLink === links[current]) return;
      if (activeLink) activeLink.removeAttribute("aria-current");
      activeLink = links[current];
      activeLink.setAttribute("aria-current", "location");
    }
    function requestUpdate() {
      if (framePending) return;
      framePending = true;
      window.requestAnimationFrame(updateCurrentSection);
    }
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    window.addEventListener("hashchange", requestUpdate);
    // Wait until the contents panel occupies its space before navigating.
    // The Markdown arrives after the browser's initial fragment navigation.
    openInitialSection();
    updateCurrentSection();
  }

  window.ArticleContents = { render };
})();
