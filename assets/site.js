const backdrop = document.querySelector(".home-backdrop");

if (backdrop) {
  const scene = backdrop.querySelector("img");
  const masthead = document.querySelector(".masthead");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let framePending = false;

  function updateBackdrop() {
    framePending = false;
    if (reducedMotion.matches) {
      backdrop.style.removeProperty("--scene-top");
      scene.style.removeProperty("--scene-shift");
      return;
    }

    // Keep the image below the visible header as it scrolls out of view.
    const headerBottom = masthead ? masthead.getBoundingClientRect().bottom : 0;
    backdrop.style.setProperty("--scene-top", `${Math.max(0, headerBottom)}px`);

    const viewportHeight = backdrop.clientHeight;
    const scrollRange = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, window.scrollY / scrollRange));
    const imageTravel = Math.max(0, scene.clientHeight - viewportHeight);
    scene.style.setProperty("--scene-shift", `${-imageTravel * progress}px`);
  }

  function requestBackdropUpdate() {
    if (!framePending) {
      framePending = true;
      window.requestAnimationFrame(updateBackdrop);
    }
  }

  window.addEventListener("scroll", requestBackdropUpdate, { passive: true });
  window.addEventListener("resize", requestBackdropUpdate);
  window.addEventListener("pageshow", requestBackdropUpdate);
  scene.addEventListener("load", requestBackdropUpdate);
  reducedMotion.addEventListener("change", requestBackdropUpdate);
  if ("ResizeObserver" in window) {
    const layoutObserver = new ResizeObserver(requestBackdropUpdate);
    layoutObserver.observe(document.body);
    if (masthead) layoutObserver.observe(masthead);
  }
  requestBackdropUpdate();
}
