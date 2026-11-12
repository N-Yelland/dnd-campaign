
# The Blighted & The Blessed

This is the campaign guide for Erran, the setting of my D&D 5.5e homebrew campaign, *The Blighted & The Blessed*.

Visit the published site at [n-yelland.github.io/dnd-campaign](https://n-yelland.github.io/dnd-campaign/).

## Deployment

The `Deploy site` workflow in `.github/workflows/deploy.yml` checks the content, contents navigation, and theme before packaging the four HTML pages, `assets/`, and `content/` for GitHub Pages. A merge or push to `main` then deploys that package automatically. Pull requests to `main` run the checks and package the site without publishing. You can also run the workflow manually from `main`.

In the repository's **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**. The deployment uses the `github-pages` environment and the workflow's built-in token; no separate deployment secret is needed. The published address is [n-yelland.github.io/dnd-campaign](https://n-yelland.github.io/dnd-campaign/). Deployment progress and the final site URL appear in the workflow run.

## Contents

- `index.html`, `page.html`, `map.html`, and `search.html` are the landing page, shared Markdown reader, interactive atlas, and article search results.
- `assets/` contains the site's CSS, JavaScript, and vendored browser libraries.
- `assets/header.html` is the shared header for every site page; edit its links and branding in one place.
- `assets/header.js` loads the header, handles the mobile menu, and selects the current navigation link from the URL. The navigation links to Home, Explore, and Map; article pages highlight Explore. Header styling lives in `assets/site.css`.
- `assets/theme.js` applies the light or dark theme before the page renders. The moon/sun button in the shared header toggles dark theme and remembers the choice in browser storage. New visitors follow their system preference; saved choices take priority. The toggle remains available beside Menu on phones. Theme colours live in the CSS variables in `assets/site.css`; illustrations and the atlas retain their original colours.
- `assets/search.js` provides search suggestions in the shared header and the full results page. Search matches article titles, summaries, and body text, with title matches ranked first. The browser fetches and caches searchable Markdown on the first query; no search service, generated catalog, or build step is required.
- Search results highlight matching terms in titles and excerpts. Opening a result carries the query into the article, highlights matching text, and jumps to the passage used for the excerpt. These article URLs can be bookmarked or shared.
- `assets/footer.html` is the shared footer; edit its copyright notice and GitHub link in one place.
- `assets/footer.js` loads the same footer on every page. Footer styling lives in `assets/site.css`.
- `content/` contains the Markdown articles and location records. Each location has its own Markdown file with YAML front matter for its map label and coordinates. The folder structure defines the page hierarchy.
- Every folder under `content/` has an `index.md` landing page. Its YAML `child_pages` lists the other files and directories at that level, in display order. The browser follows these indexes from `content/index.md` to discover articles and map data; no central file catalog is needed.
- `content/_static/` contains the map and other images. Its indexes link to the image files directly.
- `UNWRITTEN.md` is an authoring checklist of linked topics that still need article files, with the pages that mention them. It is a snapshot for planning; the site resolves links directly from the content indexes.

The shared reader fetches Markdown and renders it in the browser with [markdown-it](https://github.com/markdown-it/markdown-it). YAML front matter is parsed in the browser with [js-yaml](https://github.com/nodeca/js-yaml). The site has no build step or package-install requirement.

Articles with two or more Markdown headings automatically show a **Contents** list. It sits in the left margin on wide screens and becomes an expandable panel above the article on smaller screens. Heading links support direct URLs and the current section is highlighted as you scroll. This is handled by `assets/contents.js`; no extra article metadata is needed.

Text on the lines directly beneath a standalone image becomes a caption, rendered as `<figure>` and `<figcaption>`. Captions support inline Markdown, including emphasis and article links. End the caption with a blank line; text separated from the image by a blank line remains an ordinary paragraph.

Article images open in an enlarged overlay when clicked or activated with Enter, in both the reader and atlas notes. Close it with Escape, the Close button, or a click on the surrounding space. The overlay includes the caption and a link to the full-size original. Images already linked to a destination keep that link. This is handled by `assets/images.js`.

```markdown
![Ancient Guidestone at Dusk](../../_static/img/ancient_guidestone.png)
*The Ancient Guidestone between [Lemford](lemford) and [Lembrow](lembrow)*

The article continues here.
```

Article breadcrumbs follow the full parent hierarchy. Their first link, **Adventurer's Guide**, opens the root `content/index.md` through `page.html`; each following ancestor links to its own landing page, and the current article appears last.

The section label above an article's title comes from its parent page's title. The root page has no section label. There is no separate `section` field to maintain in YAML front matter.

## Local development

Serve the repository root with any static file server and open its `index.html`. For example, use the VS Code Live Server extension. The site uses `fetch`, so opening the HTML files directly with a `file://` URL will not work.

Open `page.html` to browse the root content landing page. Existing article URLs such as `page.html?page=locations/valley-of-lem/lembrow` still work; a directory key such as `locations/valley-of-lem` opens that folder's `index.md`.

## Wiki structure

The shared navigation's **Explore** link opens `content/index.md` in the reader. Its main sections are:

- `player-introduction/`: a curated starting point and character creation guidance.
- `locations/`: regions, settlements, and notable sites; also accessible through the atlas.
- `people/`: articles about notable individuals.
- `cultures/`: peoples, customs, languages, and everyday life.
- `organisations/`: churches, orders, governments, guilds, and other factions.
- `history/`: the timeline, historical eras, and significant events.
- `lore/`: Silverblight, magic, religion, and cosmology.
- `creatures/`: creatures and other threats.
- `campaign/`: session accounts and the party's discoveries.

New topic pages contain headings and *To be written* placeholders for you to fill in. The People, Creatures, and Session Accounts indexes have empty `child_pages` lists, ready for individual articles. Keep each subject's main article in one section and link to it from other relevant articles. Use the player introduction for a reading path and the campaign section for session records, while reference articles describe the setting itself.

## Section landing pages

Use paths relative to the folder containing each `index.md`: include the filename and extension for a file, or a trailing `/` for a directory. List every immediate child except `index.md` itself. For example, `content/locations/index.md` contains:

```yaml
---
title: The Continent of Erran
order: 20
child_pages:
  - blightwood/
  - valley-of-lem/
  - plains/
---
```

Text after the header becomes the landing page's introduction; the reader renders `child_pages` as links below it. To add a subsection, create its folder and `index.md`, then add `new-subsection/` to the containing folder's `child_pages`. Each article belongs to its folder's `index.md`; a subsection index belongs to the index one directory above. Parent links, breadcrumbs, and section labels all follow this structure, with no `parent` attribute in YAML.

## Links between articles

Use an article's filename without `.md` as the destination:

```markdown
The [Church of Brightwater](church-of-brightwater) works to combat [Silverblight](silverblight).
```

You can also write `[klathrassian-bureaucracy]` on its own. This shorthand uses the linked article's YAML title as the visible text. Only names that resolve to an article become links; other bracketed notes remain ordinary text.

Names resolve in the current folder first, then as a path from `content/`, then by a unique filename anywhere in the wiki. When two articles share a filename, use the full content path, for example `[Lembrow](locations/valley-of-lem/lembrow)`. Relative paths such as `../lore/silverblight`, directory landing pages, and explicit `.md` paths also work. Append a section anchor such as `#section-history` to jump to a heading. Images and external links keep their existing behavior.

For an unwritten topic, use an explicit label and its intended content path, for example `[Mariah Fairford](people/mariah-fairford)`. These links have a dashed underline and open a missing-content notice with a return link and a search for mentions. No placeholder Markdown file is required. Once the real article is added to its folder's `child_pages`, the same link opens it normally. Unknown bare bracketed notes remain plain text.

## Adding a location

Create a Markdown file under the appropriate `content/locations/` subsection with front matter for its title and map label. For example, add `lembrow.md` to `content/locations/valley-of-lem/index.md`'s `child_pages` when creating `content/locations/valley-of-lem/lembrow.md`. Map fields use normalized `[x, y]` coordinates in the range `0` to `1`:

```yaml
---
title: Lembrow
summary: Hardy Town in the Shadow of the Blightwood
map:
  label: Lembrow
  coords: [0.41238, 0.23209]
  type: town
  labelOffset: above
---

The town's description goes here.
```

The metadata header is not rendered as part of the article. The `map` object supports `label`, `coords`, `type`, `topText`, `labelOffset`, `labelRotation`, `labelCurvature`, `spacing`, and `align`. Long map labels wrap automatically; include a backslash in a label to choose a line break manually. `topText` also prefixes the article title throughout the guide: `title: Tears` with `topText: Bay of` becomes **Bay of Tears**. A prefix already present in the title is not repeated; the atlas still renders `topText` and the main map label separately.

Run `node tests/content.test.cjs` to check directory coverage, article links, and atlas discovery without installing packages.
Run `node tests/contents.test.cjs` to check the contents list, heading anchors, section highlighting, and responsive panel behavior.
Run `node tests/theme.test.cjs` to check system preferences, saved themes, the header toggle, and storage fallbacks.
