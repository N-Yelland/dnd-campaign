(function () {
  const storageKey = "erran-theme";
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  const attached = new WeakSet();
  const valid = (value) => value === "dark" || value === "light";
  let preference = null;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (valid(stored)) preference = stored;
  } catch { /* The toggle still works when browser storage is unavailable. */ }

  function updateButton(button) {
    const dark = document.documentElement.dataset.theme === "dark";
    button.setAttribute("aria-pressed", String(dark));
    button.title = dark ? "Switch to light theme" : "Switch to dark theme";
  }

  function apply() {
    const theme = preference || (system.matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "dark" ? "#0b151e" : "#102f43";
    document.querySelectorAll("[data-theme-toggle]").forEach(updateButton);
  }

  function attach(container) {
    for (const button of container.querySelectorAll("[data-theme-toggle]")) {
      updateButton(button);
      if (attached.has(button)) continue;
      attached.add(button);
      button.addEventListener("click", () => {
        preference = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        try { window.localStorage.setItem(storageKey, preference); } catch { /* Keep the current-page choice. */ }
        apply();
      });
    }
  }

  system.addEventListener("change", () => { if (!preference) apply(); });
  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey && event.key !== null) return;
    preference = valid(event.newValue) ? event.newValue : null;
    apply();
  });
  apply();
  window.CampaignTheme = { attach };
})();
