(async function () {
  const footer = document.querySelector("[data-site-footer]");
  if (!footer) return;

  const footerUrl = new URL("footer.html", document.currentScript.src);

  try {
    const response = await fetch(footerUrl);
    if (!response.ok) throw new Error(`Could not load the footer (${response.status}).`);
    footer.innerHTML = await response.text();
  } catch (error) {
    const homeLink = document.createElement("a");
    homeLink.href = new URL("../index.html", footerUrl).href;
    homeLink.textContent = "Return to the Adventurer's Guide";
    footer.replaceChildren(homeLink);
    console.error(error);
  }
})();
