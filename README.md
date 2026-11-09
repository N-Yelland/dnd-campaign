
# The Blighted & The Blessed

This is the campaign guide for Erran, the setting of my D&D 5.5e homebrew campaign, *The Blighted & The Blessed*.

Visit the published site at [n-yelland.github.io/dnd-campaign](https://n-yelland.github.io/dnd-campaign/).

## Contents

- `index.html`, `page.html`, and `map.html` are the landing page, shared Markdown reader, and interactive atlas.
- `assets/` contains the site's CSS, JavaScript, and vendored browser libraries.
- `source/` contains the Markdown articles and location records. Each location has its own Markdown file with YAML front matter for its map label, coordinates, and hierarchy.
- `source/content-files.json` lists the Markdown files because static hosting cannot enumerate a directory. The browser reads each file's front matter to build the article index and map data at runtime.
- `source/_static/` contains the map and other images.

The shared reader fetches Markdown and renders it in the browser with [markdown-it](https://github.com/markdown-it/markdown-it). YAML front matter is parsed in the browser with [js-yaml](https://github.com/nodeca/js-yaml). The site has no build step or package-install requirement.

## Local development

Serve the repository root with any static file server and open its `index.html`. For example, use the VS Code Live Server extension. The site uses `fetch`, so opening the HTML files directly with a `file://` URL will not work.

## Adding a location

Create a Markdown file under `source/locations/` with front matter for its title, parent, and map label. Add every new Markdown file's path to `source/content-files.json`, and add a location's content key to the parent's `children` list. Map fields use normalized `[x, y]` coordinates in the range `0` to `1`:

```yaml
---
title: Lembrow
summary: Hardy Town in the Shadow of the Blightwood
parent: locations/valley-of-lem
map:
  label: Lembrow
  coords: [0.41238, 0.23209]
  type: town
  labelOffset: above
---

The town's field notes go here.
```

The metadata header is not rendered as part of the article. The `map` object supports `label`, `coords`, `type`, `topText`, `labelOffset`, `labelRotation`, `labelCurvature`, `spacing`, and `align`. Long map labels wrap automatically; include a backslash in a label to choose a line break manually.
