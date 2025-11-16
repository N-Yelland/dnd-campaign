
# D&D Campaign Documentation

This is a repository of information about the world of Erran, the setting for my D&D 5.5e homebrew campaign, *The Blighted and the Blessed*.

Visit the site [here](https://n-yelland.github.io/dnd-campaign/).

## Contents

- `source`: This includes all the *content* about the campaign, both text files (as ReStructuredText) and other media (e.g., images) which is stored in the `_static` folder. There is also `conf.py`, which is used by Sphinx/Codex to configure the building of the HTML site.

- `codex`: A Python package that adds a Sphinx extension for medieval-style HTML builds, along with several features useful for D&D campaign documentation.

- `demos`: A place for testing/demonstration code.

## Local Build

To build a copy of the documentation locally, clone this repo and run the following commands:

```
pip install codex/
sphinx-build -b html source build
```

## To-Do List
- Populate content
- Add map controls (e.g.: manual zoom, reset view, scale of px:miles)
- Style navigation elements
