(async function () {
  const header = document.querySelector("[data-site-header]");
  if (!header) return;

  const headerUrl = new URL("header.html", document.currentScript.src);

  try {
    const response = await fetch(headerUrl);
    if (!response.ok) throw new Error(`Could not load the header (${response.status}).`);
    header.innerHTML = await response.text();
    if (window.CampaignTheme) window.CampaignTheme.attach(header);

    const navigation = header.querySelector(".primary-nav");
    const menuToggle = header.querySelector(".menu-toggle");
    const currentUrl = new URL(window.location.href);
    const currentPage = currentUrl.searchParams.get("page") || "";
    const normalizePath = (pathname) => pathname.replace(/\/index\.html$/, "/");
    let selectedLink;
    let selectedPage = "";

    // Read the destinations from the shared markup, including article sections.
    for (const link of navigation.querySelectorAll("a[href]")) {
      link.removeAttribute("aria-current");
      const destination = new URL(link.href);
      if (destination.origin !== currentUrl.origin ||
          normalizePath(destination.pathname) !== normalizePath(currentUrl.pathname)) continue;

      const page = destination.searchParams.get("page") || "";
      if (page && page !== currentPage && !currentPage.startsWith(`${page}/`)) continue;
      if (!selectedLink || page.length > selectedPage.length) {
        selectedLink = link;
        selectedPage = page;
      }
    }

    if (selectedLink) {
      selectedLink.setAttribute("aria-current", selectedPage === currentPage ? "page" : "location");
    }

    menuToggle.addEventListener("click", () => {
      const expanded = menuToggle.getAttribute("aria-expanded") === "true";
      menuToggle.setAttribute("aria-expanded", String(!expanded));
      navigation.classList.toggle("is-open", !expanded);
    });
    if (window.CampaignSearch) window.CampaignSearch.attach(header);
  } catch (error) {
    const homeLink = document.createElement("a");
    homeLink.className = "wordmark";
    homeLink.href = new URL("../index.html", headerUrl).href;
    homeLink.textContent = "Return to the Adventurer's Guide";
    header.replaceChildren(homeLink);
    console.error(error);
  }
})();
