(function () {
  let viewer;
  let enlarged;
  let caption;
  let original;
  let trigger;

  function createViewer() {
    viewer = document.createElement("dialog");
    viewer.className = "image-viewer";
    viewer.setAttribute("aria-label", "Enlarged image");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "image-viewer-close";
    close.textContent = "Close \u00d7";
    close.setAttribute("aria-label", "Close enlarged image");
    close.autofocus = true;
    close.addEventListener("click", () => viewer.close());
    const figure = document.createElement("figure");
    enlarged = document.createElement("img");
    enlarged.addEventListener("load", () => {
      enlarged.style.setProperty("--image-ratio", enlarged.naturalWidth / enlarged.naturalHeight);
    });
    caption = document.createElement("figcaption");
    original = document.createElement("a");
    original.textContent = "Open full-size image";
    original.target = "_blank";
    original.rel = "noopener noreferrer";
    figure.append(enlarged, caption);
    viewer.append(close, figure, original);
    viewer.addEventListener("click", (event) => {
      if (event.target === viewer) viewer.close();
    });
    viewer.addEventListener("close", () => {
      document.documentElement.classList.remove("image-viewer-open");
      enlarged.removeAttribute("src");
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
    document.body.append(viewer);
  }

  function enhance(container) {
    for (const image of container.querySelectorAll("img")) {
      // Explicitly linked illustrations keep their author's destination.
      if (image.closest("a, button")) continue;
      const link = document.createElement("a");
      link.className = "image-enlarge";
      link.href = image.src;
      link.setAttribute("aria-label", image.alt ? `Enlarge image: ${image.alt}` : "Enlarge image");
      link.setAttribute("aria-haspopup", "dialog");
      link.title = "Click to enlarge";
      image.replaceWith(link);
      link.append(image);
      link.addEventListener("click", (event) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        if (!viewer) createViewer();
        trigger = link;
        enlarged.src = image.currentSrc || image.src;
        enlarged.alt = image.alt;
        enlarged.style.setProperty("--image-ratio", image.naturalWidth / image.naturalHeight || 1);
        const text = image.closest("figure")?.querySelector("figcaption")?.textContent.trim() || "";
        caption.textContent = text;
        caption.hidden = !text;
        original.href = image.src;
        viewer.showModal();
        document.documentElement.classList.add("image-viewer-open");
      });
    }
  }

  window.ArticleImages = { enhance };
})();
