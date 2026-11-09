(function () {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const viewport = document.getElementById("map-viewport");
  const plane = document.getElementById("map-plane");
  const image = document.getElementById("map-image");
  const labels = document.getElementById("map-labels");
  const status = document.getElementById("map-status");
  const zoomLevel = document.getElementById("map-zoom-level");
  const locationPanel = document.getElementById("location-panel");
  const searchForm = document.getElementById("location-search");
  const searchInput = document.getElementById("location-query");
  const searchOptions = document.getElementById("location-options");
  const pointers = new Map();
  const labelGroups = [];
  const view = { x: 0, y: 0, scale: 1, width: 0, height: 0 };
  const savedViewKey = "erran-atlas-view-v1";
  const maxZoomRatio = 24;
  const panelParent = locationPanel.parentElement;
  const panelNextSibling = locationPanel.nextSibling;
  let mapEntries = [];
  let dragState = null;
  let pinchState = null;
  let fitScale = 1;
  let initialized = false;
  let saveViewTimer;
  let lastMapCenter = null;
  let lastZoomRatio = 1;

  const labelSizes = {
    feature: 22, ruin: 21, river: 22, region: 36, "major-region": 68,
    "minor-region": 30, landmark: 21, town: 24, city: 28,
    village: 20, water: 25
  };
  const labelZoomRanges = {
    feature: { in: [3, 3.5] },
    ruin: { in: [2.5, 3] },
    river: { in: [1.5, 2] },
    region: { in: [1.25, 1.6], out: [4, 9] },
    "major-region": { in: [0.75, 0.9], out: [4, 9] },
    "minor-region": { in: [1.5, 1.9] },
    landmark: { in: [2.5, 3] },
    town: { in: [2.2, 2.8] },
    city: { in: [1.2, 1.7] },
    village: { in: [4.8, 5.6] },
    water: { in: [1.5, 2] }
  };

  function svgElement(tag, attributes) {
    const element = document.createElementNS(svgNamespace, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    return element;
  }

  function applyView() {
    plane.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
    zoomLevel.textContent = `${Math.round((view.scale / fitScale) * 100)}%`;
    updateVisibleLabels();
    rememberView();
    saveView();
  }

  function getZoomRatio() {
    return fitScale ? view.scale / fitScale : 1;
  }

  function getMapCenter() {
    const bounds = viewport.getBoundingClientRect();
    return {
      x: (bounds.width / 2 - view.x) / view.scale / view.width,
      y: (bounds.height / 2 - view.y) / view.scale / view.height
    };
  }

  function rememberView() {
    if (!view.width || !view.height) return;
    lastMapCenter = getMapCenter();
    lastZoomRatio = getZoomRatio();
  }

  function setViewFromCenter(center, zoomRatio) {
    const bounds = viewport.getBoundingClientRect();
    fitScale = Math.min(bounds.width / view.width, bounds.height / view.height);
    view.scale = fitScale * Math.max(0.75, Math.min(maxZoomRatio, zoomRatio));
    view.x = bounds.width / 2 - center.x * view.width * view.scale;
    view.y = bounds.height / 2 - center.y * view.height * view.scale;
    applyView();
  }

  function fitMap() {
    setViewFromCenter({ x: 0.5, y: 0.5 }, 1);
  }

  function resizeMap() {
    if (!view.width || !view.height) return;
    setViewFromCenter(lastMapCenter || getMapCenter(), lastZoomRatio);
  }

  function writeSavedView() {
    if (!view.width || !view.height) return;
    try {
      localStorage.setItem(savedViewKey, JSON.stringify({
        center: getMapCenter(),
        zoom: getZoomRatio()
      }));
    } catch (error) {
      status.hidden = false;
      status.classList.add("map-status-error");
      status.textContent = `Could not save the map view: ${error.message}`;
    }
  }

  function saveView() {
    window.clearTimeout(saveViewTimer);
    saveViewTimer = window.setTimeout(writeSavedView, 180);
  }

  function loadSavedView() {
    try {
      const saved = JSON.parse(localStorage.getItem(savedViewKey));
      if (!saved) return null;
      if (!saved.center || !Number.isFinite(saved.center.x) ||
          !Number.isFinite(saved.center.y) || !Number.isFinite(saved.zoom)) {
        throw new Error("The saved map view is invalid.");
      }
      return {
        center: saved.center,
        zoom: Math.max(0.75, Math.min(maxZoomRatio, saved.zoom))
      };
    } catch (error) {
      status.hidden = false;
      status.classList.add("map-status-error");
      status.textContent = `Could not restore the saved map view: ${error.message}`;
      return null;
    }
  }

  function zoomAt(clientX, clientY, factor) {
    const bounds = viewport.getBoundingClientRect();
    const x = clientX - bounds.left;
    const y = clientY - bounds.top;
    const nextScale = Math.max(fitScale * 0.75, Math.min(fitScale * maxZoomRatio, view.scale * factor));
    const mapX = (x - view.x) / view.scale;
    const mapY = (y - view.y) / view.scale;
    view.x = x - mapX * nextScale;
    view.y = y - mapY * nextScale;
    view.scale = nextScale;
    applyView();
  }

  function labelPosition(entry, fontSize) {
    const [x, y] = entry.coords;
    let offsetX = 0;
    let offsetY = 0;
    const offset = entry.labelOffset;
    const type = entry.type || "feature";
    const isMarker = ["city", "town", "village", "landmark", "ruin"].includes(type);
    const markerRadius = type === "city" ? 0.42 :
      type === "town" ? 0.36 :
      type === "village" ? 0.3 :
      isMarker ? 0.2 : 0;
    const lines = getLabelLines(entry.label || entry.title);
    const longestLine = Math.max(...lines.map((line) => line.length), 1);
    const labelWidth = fontSize * longestLine * 0.58 +
      fontSize * (entry.spacing || 0) * Math.max(0, longestLine - 1);
    const lineHeight = fontSize * 1.8;
    const labelHeight = fontSize * 1.4 + Math.max(0, lines.length - 1) * lineHeight;
    const minMarkerOffsetX = fontSize * (markerRadius + labelWidth / (2 * fontSize) + 0.4);
    const minMarkerOffsetY = fontSize * (markerRadius + labelHeight / (2 * fontSize) + 0.4);

    if (Array.isArray(offset)) {
      offsetX = (offset[0] / 100) * fontSize;
      offsetY = (offset[1] / 100) * fontSize;
      if (isMarker && Math.abs(offsetX) < minMarkerOffsetX && Math.abs(offsetY) < minMarkerOffsetY) {
        if (Math.abs(offsetX) / minMarkerOffsetX > Math.abs(offsetY) / minMarkerOffsetY) {
          offsetX = Math.sign(offsetX || 1) * minMarkerOffsetX;
        } else {
          offsetY = Math.sign(offsetY || 1) * minMarkerOffsetY;
        }
      }
    } else if (typeof offset === "string" && offset.trim()) {
      const parts = offset.split(/\s+/);
      if (parts.includes("left")) offsetX -= isMarker ? Math.max(fontSize * 2.4, minMarkerOffsetX) : fontSize * 2.4;
      if (parts.includes("right")) offsetX += isMarker ? Math.max(fontSize * 2.4, minMarkerOffsetX) : fontSize * 2.4;
      if (parts.includes("above")) offsetY -= isMarker ? Math.max(fontSize * 1.25, minMarkerOffsetY) : fontSize * 1.25;
      if (parts.includes("below")) offsetY += isMarker ? Math.max(fontSize * 1.25, minMarkerOffsetY) : fontSize * 1.25;
    } else if (isMarker) {
      offsetY = minMarkerOffsetY;
    }
    return [x * view.width, y * view.height, offsetX, offsetY];
  }

  function getLabelLines(label) {
    const lines = [];
    for (const paragraph of label.split("\\")) {
      let line = "";
      for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
        const isInitial = /^[A-Z]\.?$/i.test(word);
        if (line && !isInitial && line.length + word.length + 1 > 12) {
          lines.push(line);
          line = "";
        }
        line = line ? `${line} ${word}` : word;
      }
      if (line) lines.push(line);
    }
    return lines;
  }

  function addLabel(entry) {
    const type = entry.type || "feature";
    const size = labelSizes[type] || labelSizes.feature;
    const fontSize = size;
    const [x, y, offsetX, offsetY] = labelPosition(entry, fontSize);
    const labelText = entry.label || entry.title;
    const lines = getLabelLines(labelText);
    const group = svgElement("g", {
      class: `map-label map-label-${type}${entry.labelCurvature ? " is-curved" : ""}`,
      tabindex: "0",
      role: "button",
      "aria-label": entry.title,
      transform: `translate(${x} ${y})`,
      "aria-hidden": "true"
    });
    const labelElement = svgElement("g", {
      transform: `rotate(${entry.labelRotation || 0})`
    });
    const labelContent = svgElement("g", { transform: `translate(${offsetX} ${offsetY})` });
    const title = svgElement("title", {});
    title.textContent = entry.title;
    group.append(title);

    if (entry.topText) {
      const top = svgElement("text", {
        class: "map-label-top",
        x: "0",
        y: `${-fontSize * 0.72}`,
        "text-anchor": "middle",
        "font-size": `${fontSize * 0.65}`
      });
      top.textContent = entry.topText;
      labelContent.append(top);
    }

    const textAnchor = entry.align === "left" ? "start" : entry.align === "right" ? "end" : "middle";
    const curvedLines = [];
    const lineHeight = fontSize * 1.8;
    if (entry.labelCurvature) {
      const key = entry.key.replace(/[^a-z0-9]+/gi, "-");
      const curve = Math.max(-fontSize * 1.5, Math.min(fontSize * 1.5, entry.labelCurvature * 1200));
      for (const [index, line] of lines.entries()) {
        const id = `label-arc-${key}-${index}`;
        const estimatedWidth = Math.max(fontSize * 2, line.length * fontSize * (0.58 + (entry.spacing || 0)));
        const lineOffset = (index - (lines.length - 1) / 2) * lineHeight;
        const path = svgElement("path", {
          id,
          d: `M ${-estimatedWidth / 2} ${curve + lineOffset} Q 0 ${-curve + lineOffset} ${estimatedWidth / 2} ${curve + lineOffset}`,
          fill: "none",
          stroke: "none",
          "pointer-events": "none"
        });
        const curvedText = svgElement("text", {
          "text-anchor": textAnchor,
          "dominant-baseline": "central",
          "font-size": `${fontSize}`,
          "letter-spacing": `${entry.spacing || 0}em`
        });
        const textPath = svgElement("textPath", { href: `#${id}`, startOffset: "50%", "text-anchor": "middle" });
        textPath.textContent = line;
        curvedText.append(textPath);
        labelContent.append(path, curvedText);
        curvedLines.push({ path, text: curvedText, value: line, curve, lineOffset });
      }
    } else {
      for (const [index, line] of lines.entries()) {
        const lineText = svgElement("text", {
          x: "0",
          y: `${(index - (lines.length - 1) / 2) * lineHeight}`,
          "text-anchor": textAnchor,
          "dominant-baseline": "central",
          "font-size": `${fontSize}`,
          "letter-spacing": `${entry.spacing || 0}em`
        });
        lineText.textContent = line;
        labelContent.append(lineText);
      }
    }

    if (["city", "town", "village"].includes(type)) {
      const marker = svgElement("g", {
        class: `map-marker map-marker-${type}`,
        "aria-hidden": "true"
      });
      const radius = fontSize * (type === "city" ? 0.42 : type === "town" ? 0.36 : 0.3);
      let points;
      if (type === "city") {
        points = [
          [0, -radius], [radius * 0.2, -radius * 0.42], [radius * 0.42, -radius * 0.2],
          [radius, 0], [radius * 0.42, radius * 0.2], [radius * 0.2, radius * 0.42],
          [0, radius], [-radius * 0.2, radius * 0.42], [-radius * 0.42, radius * 0.2],
          [-radius, 0], [-radius * 0.42, -radius * 0.2], [-radius * 0.2, -radius * 0.42]
        ];
      } else {
        points = [[0, -radius], [radius, 0], [0, radius], [-radius, 0]];
      }
      const shape = svgElement("path", {
        class: "map-marker-shape",
        d: `M ${points.map(([pointX, pointY]) => `${pointX} ${pointY}`).join(" L ")} Z`
      });
      marker.append(shape);
      if (type !== "village") {
        const inner = svgElement("path", {
          class: "map-marker-core",
          d: `M 0 ${-radius * 0.38} L ${radius * 0.38} 0 L 0 ${radius * 0.38} L ${-radius * 0.38} 0 Z`
        });
        marker.append(inner);
      }
      group.append(marker);
    } else if (["landmark", "ruin"].includes(type)) {
      const marker = svgElement("circle", {
        class: `map-marker map-marker-${type}`,
        cx: "0",
        cy: "0",
        r: `${fontSize * 0.2}`
      });
      group.append(marker);
    }

    labelElement.append(labelContent);
    group.append(labelElement);
    group.addEventListener("click", () => showLocation(entry));
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showLocation(entry);
      }
    });
    labels.append(group);
    for (const curvedLine of curvedLines) {
      const measurer = curvedLine.text.cloneNode(false);
      measurer.textContent = curvedLine.value;
      labelElement.append(measurer);
      const measuredWidth = measurer.getComputedTextLength();
      measurer.remove();
      const pathWidth = Math.max(fontSize * 2, measuredWidth * 1.25);
      curvedLine.path.setAttribute("d",
        `M ${-pathWidth / 2} ${curvedLine.curve + curvedLine.lineOffset} ` +
        `Q 0 ${-curvedLine.curve + curvedLine.lineOffset} ${pathWidth / 2} ${curvedLine.curve + curvedLine.lineOffset}`);
    }
    labelGroups.push({
      element: group,
      type
    });
  }

  function updateVisibleLabels() {
    const zoomRatio = view.scale / fitScale;
    for (const group of labelGroups) {
      const { in: fadeIn, out: fadeOut } = labelZoomRanges[group.type] || labelZoomRanges.feature;
      const fadeInOpacity = Math.max(0, Math.min(1, (zoomRatio - fadeIn[0]) / (fadeIn[1] - fadeIn[0])));
      const fadeOutOpacity = fadeOut
        ? Math.max(0, Math.min(1, (fadeOut[1] - zoomRatio) / (fadeOut[1] - fadeOut[0])))
        : 1;
      const opacity = Math.min(fadeInOpacity, fadeOutOpacity);
      const isVisible = opacity > 0;
      group.element.classList.toggle("is-visible", isVisible);
      group.element.style.setProperty("--zoom-opacity", opacity);
      group.element.setAttribute("aria-hidden", String(!isVisible));
      group.element.setAttribute("tabindex", isVisible ? "0" : "-1");
    }
  }

  async function showLocation(entry) {
    searchInput.value = entry.label || entry.title;
    locationPanel.replaceChildren();
    locationPanel.setAttribute("aria-busy", "true");
    const heading = document.createElement("p");
    heading.className = "eyebrow";
    heading.textContent = entry.type ? `${entry.type} · Erran` : "Field notes";
    const title = document.createElement("h2");
    title.textContent = entry.title;
    const content = document.createElement("div");
    content.className = "panel-prose";
    locationPanel.append(heading, title);
    if (entry.summary) {
      const summary = document.createElement("p");
      summary.className = "panel-summary";
      summary.textContent = entry.summary;
      locationPanel.append(summary);
    }
    locationPanel.append(content);

    try {
      const page = await window.CampaignContent.getEntry(entry.key);
      const [rendered, relatedEntries] = await Promise.all([
        window.CampaignContent.getMarkdown(page),
        window.CampaignContent.getRelatedEntries(page)
      ]);
      if (rendered.trim()) {
        window.CampaignContent.renderBody(content, rendered, page);
      } else {
        const note = document.createElement("p");
        note.className = "panel-note";
        note.textContent = "No written field notes have been added to this place yet.";
        content.append(note);
      }
      if (page.children.length) {
        const childList = document.createElement("div");
        childList.className = "panel-children";
        const label = document.createElement("p");
        label.className = "eyebrow";
        label.textContent = "Nearby field notes";
        childList.append(label);
        for (const key of page.children) {
          const child = relatedEntries.find((candidate) => candidate.key === key);
          if (!child) continue;
          const link = document.createElement("a");
          link.href = `page.html?page=${encodeURIComponent(child.key)}`;
          link.textContent = child.title;
          childList.append(link);
        }
        locationPanel.append(childList);
      }
      const link = document.createElement("a");
      link.className = "panel-read-more";
      link.href = `page.html?page=${encodeURIComponent(page.key)}`;
      link.textContent = "Open full field notes";
      locationPanel.append(link);
    } catch (error) {
      const message = document.createElement("p");
      message.className = "panel-note";
      message.textContent = error.message;
      locationPanel.append(message);
    } finally {
      locationPanel.removeAttribute("aria-busy");
    }
  }

  function pointerDistance(first, second) {
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  viewport.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".map-tools") || event.target.closest(".map-label") ||
        event.target.closest(".location-panel")) return;
    viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      dragState = { x: event.clientX, y: event.clientY };
      pinchState = null;
    } else if (pointers.size === 2) {
      const [first, second] = [...pointers.values()];
      pinchState = {
        distance: pointerDistance(first, second),
        midpointX: (first.x + second.x) / 2,
        midpointY: (first.y + second.y) / 2
      };
      dragState = null;
    }
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1 && dragState) {
      view.x += event.clientX - dragState.x;
      view.y += event.clientY - dragState.y;
      dragState = { x: event.clientX, y: event.clientY };
      applyView();
    } else if (pointers.size === 2 && pinchState) {
      const [first, second] = [...pointers.values()];
      const distance = pointerDistance(first, second);
      const midpointX = (first.x + second.x) / 2;
      const midpointY = (first.y + second.y) / 2;
      const bounds = viewport.getBoundingClientRect();
      const anchorX = pinchState.midpointX - bounds.left;
      const anchorY = pinchState.midpointY - bounds.top;
      const mapX = (anchorX - view.x) / view.scale;
      const mapY = (anchorY - view.y) / view.scale;
      view.scale = Math.max(fitScale * 0.75, Math.min(fitScale * maxZoomRatio, view.scale * (distance / pinchState.distance)));
      view.x = midpointX - bounds.left - mapX * view.scale;
      view.y = midpointY - bounds.top - mapY * view.scale;
      pinchState = { distance, midpointX, midpointY };
      applyView();
    }
  });

  function releasePointer(event) {
    pointers.delete(event.pointerId);
    dragState = pointers.size === 1 ? { ...[...pointers.values()][0] } : null;
    pinchState = null;
  }
  viewport.addEventListener("pointerup", releasePointer);
  viewport.addEventListener("pointercancel", releasePointer);

  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.001));
  }, { passive: false });

  document.getElementById("zoom-in").addEventListener("click", () => {
    const bounds = viewport.getBoundingClientRect();
    zoomAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, 1.35);
  });
  document.getElementById("zoom-out").addEventListener("click", () => {
    const bounds = viewport.getBoundingClientRect();
    zoomAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, 1 / 1.35);
  });
  document.getElementById("map-home").addEventListener("click", fitMap);
  const fullscreenButton = document.getElementById("map-fullscreen");
  const mapFrame = document.querySelector(".map-frame");
  if (!document.fullscreenEnabled || typeof mapFrame.requestFullscreen !== "function") {
    fullscreenButton.disabled = true;
    fullscreenButton.title = "Fullscreen is not supported by this browser";
    fullscreenButton.setAttribute("aria-label", fullscreenButton.title);
  } else {
    fullscreenButton.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          await mapFrame.requestFullscreen();
        }
      } catch (error) {
        status.hidden = false;
        status.classList.add("map-status-error");
        status.textContent = `Fullscreen unavailable: ${error.message}`;
      }
    });
  }
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = searchInput.value.trim().toLocaleLowerCase();
    const entry = mapEntries.find((candidate) =>
      candidate.title.toLocaleLowerCase() === query ||
      (candidate.label || "").toLocaleLowerCase() === query
    );
    if (!entry) {
      status.hidden = false;
      status.classList.add("map-status-error");
      status.textContent = "No matching place was found. Choose a name from the suggestions.";
      return;
    }
    status.hidden = true;
    const bounds = viewport.getBoundingClientRect();
    view.scale = fitScale * 4.5;
    view.x = bounds.width / 2 - entry.coords[0] * view.width * view.scale;
    view.y = bounds.height / 2 - entry.coords[1] * view.height * view.scale;
    applyView();
    showLocation(entry);
  });
  document.addEventListener("fullscreenchange", () => {
    const button = fullscreenButton;
    const expanded = Boolean(document.fullscreenElement);
    button.setAttribute("aria-label", expanded ? "Exit fullscreen" : "Enter fullscreen");
    button.title = expanded ? "Exit fullscreen" : "Enter fullscreen";
    if (expanded) {
      mapFrame.append(locationPanel);
    } else if (locationPanel.parentElement !== panelParent) {
      panelParent.insertBefore(
        locationPanel,
        panelNextSibling && panelNextSibling.parentElement === panelParent ? panelNextSibling : null
      );
    }
    window.setTimeout(resizeMap, 50);
  });

  const resizeObserver = new ResizeObserver(() => {
    if (initialized) resizeMap();
  });
  resizeObserver.observe(viewport);
  window.addEventListener("pagehide", writeSavedView);

  (async function initialize() {
    try {
      await image.decode();
      view.width = image.naturalWidth;
      view.height = image.naturalHeight;
      plane.style.width = `${view.width}px`;
      plane.style.height = `${view.height}px`;
      labels.setAttribute("viewBox", `0 0 ${view.width} ${view.height}`);

      mapEntries = await window.CampaignContent.getMapEntries();
      if (!mapEntries.length) throw new Error("No map locations were found in the Markdown files.");
      for (const entry of mapEntries) {
        const option = document.createElement("option");
        option.value = entry.label || entry.title;
        searchOptions.append(option);
        addLabel(entry);
      }
      initialized = true;
      const savedView = loadSavedView();
      if (savedView) {
        setViewFromCenter(savedView.center, savedView.zoom);
      } else {
        fitMap();
      }
      if (!status.classList.contains("map-status-error")) status.hidden = true;
    } catch (error) {
      status.classList.add("map-status-error");
      status.textContent = error.message;
    }
  })();
})();
