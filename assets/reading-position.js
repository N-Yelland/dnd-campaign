(function () {
  const storageKey = () => `erran-reading-position:${window.location.pathname}${window.location.search}${window.location.hash}`;
  const headingSelector = "h1, h2, h3, h4, h5, h6";
  let article;
  let ready = false;
  let saved = null;
  let observer;
  let timer;
  let framePending = false;
  const previousRestoration = window.history.scrollRestoration;

  try {
    const navigation = window.performance.getEntriesByType("navigation")[0];
    if (navigation && ["reload", "back_forward"].includes(navigation.type)) {
      const position = JSON.parse(window.sessionStorage.getItem(storageKey()));
      if (position && Number.isFinite(position.x) && position.x >= 0 &&
          Number.isFinite(position.y) && position.y >= 0) {
        saved = position;
        window.history.scrollRestoration = "manual";
      }
    }
  } catch { /* Reading still works when browser storage is unavailable. */ }

  function save() {
    if (!ready || saved) return;
    let heading = null;
    for (const candidate of article.querySelectorAll(headingSelector)) {
      if (candidate.getClientRects().length && candidate.getBoundingClientRect().top <= 0) heading = candidate;
    }
    try {
      window.sessionStorage.setItem(storageKey(), JSON.stringify({
        x: window.scrollX, y: window.scrollY,
        heading: heading?.id || null,
        offset: heading ? heading.getBoundingClientRect().top : 0
      }));
    } catch { /* Storage is optional. */ }
  }

  function finish() {
    if (!saved) return;
    saved = null;
    observer?.disconnect();
    article?.removeEventListener("load", schedule, true);
    article?.removeEventListener("error", schedule, true);
    window.removeEventListener("resize", schedule);
    window.clearTimeout(timer);
    window.history.scrollRestoration = previousRestoration;
    save();
  }

  function apply() {
    if (!saved) return;
    let top = saved.y;
    const heading = typeof saved.heading === "string" ? document.getElementById(saved.heading) : null;
    if (heading && article.contains(heading) && heading.getClientRects().length && Number.isFinite(saved.offset)) {
      top = window.scrollY + heading.getBoundingClientRect().top - saved.offset;
    }
    window.scrollTo({ left: saved.x, top: Math.max(0, top), behavior: "instant" });
  }

  function schedule() {
    if (!ready || framePending) return;
    framePending = true;
    window.requestAnimationFrame(() => {
      framePending = false;
      if (saved) apply();
      else save();
    });
  }

  // User navigation always takes priority over restoring a refresh.
  for (const event of ["wheel", "touchstart", "pointerdown", "hashchange"]) {
    window.addEventListener(event, finish, { passive: true });
  }
  window.addEventListener("keydown", (event) => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) finish();
  });
  window.addEventListener("scroll", () => { if (!saved) schedule(); }, { passive: true });
  window.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });

  async function restore(element) {
    article = element;
    ready = true;
    if (!saved) return;
    if (document.fonts) await document.fonts.ready;
    if (!saved) return;
    apply();
    // Images and the shared header can change the layout after Markdown renders.
    if ("ResizeObserver" in window) {
      observer = new window.ResizeObserver(schedule);
      observer.observe(article);
      observer.observe(document.body);
    }
    article.addEventListener("load", schedule, true);
    article.addEventListener("error", schedule, true);
    window.addEventListener("resize", schedule);
    timer = window.setTimeout(finish, 5000);
  }

  window.ReadingPosition = { restore, get shouldRestore() { return Boolean(saved); } };
})();
