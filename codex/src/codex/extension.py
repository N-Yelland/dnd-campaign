
from typing import Any

import json

from pathlib import Path

from sphinx.application import Sphinx
from sphinx.util import logging
from sphinx.builders.html._assets import _CascadingStyleSheet, _JavaScript

from codex.directives import LocationDirective, MapDirective, map_node


__version__ = "1.0.1"

logger = logging.getLogger(__name__)

MAP_CSS_FILES = ["map.css", "info.css"]
MAP_JS_FILES = ["pan_zoom.js", "map.js"]


def write_map_data_json(app: Sphinx, exception: Exception | None) -> None:
    if exception is not None:
        logger.error(
            f"Will not write map data JSON file due to exception in build process: {exception}")
        return

    data: list[dict[str, Any]] = list(getattr(app.env, "all_locations", {}).values())
    output_path = Path(app.outdir / "map_data.json")
    try:
        with output_path.open("w", encoding="utf8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        logger.info(f"{len(data)} locations written to map_data.json")
    except Exception as e:
        logger.warning(f"Failed to write map_data.json: {e}")


def update_context(app: Sphinx, pagename, _templatename, context: dict[str, Any], _doctree):

    # First, update the context to include the current version of Codex:
    context["codex_version"] = __version__

    # Then add the necessary JS/CSS files to the headers of pages with "_codex_map_data" in their
    # metdata - this corresponds to pages whose RST contains map directives.
    metadata = app.builder.env.metadata.get(pagename, {})
    if "_codex_map_data" not in metadata:
        return
    logger.info(f"{pagename} contains a map directive...")

    css_files: list[_CascadingStyleSheet] = context.setdefault("css_files", [])
    js_files: list[_JavaScript] = context.setdefault("script_files", [])

    pathto = context.get("pathto")

    target: list[_CascadingStyleSheet | _JavaScript]
    for file_list, file_type, target, _type in [
            (MAP_CSS_FILES, "css", css_files, _CascadingStyleSheet),
            (MAP_JS_FILES, "js", js_files, _JavaScript)
    ]:
        prefix = f"_static/{file_type}/"
        for fname in file_list:
            url = pathto(prefix + fname, 1) if pathto is not None else prefix + fname
            for file in target:
                if file.filename == url:
                    break
            else:
                target.append(_type(url, priority=1000))

GLOBAL_CSS_FILES = ["main.css", "vellum.css", "sidebar.css", "arctext.style.css"]

def setup_extension(app: Sphinx):
    app.setup_extension("sphinxcontrib.jquery")

    app.config["html_theme"] = "codex"
    app.config["html_permalinks_icon"] = "&#9756;"  # ☜ pointing hand

    app.add_directive("location", LocationDirective)
    app.add_directive("map", MapDirective)

    app.add_node(map_node, html=(map_node.visit_html, map_node.depart_html))

    for css_file in GLOBAL_CSS_FILES:
        app.add_css_file(f"css/{css_file}")

    app.add_js_file("js/common.js")
    app.add_js_file("js/jquery.arctext.js")

    app.add_html_theme("codex", Path(__file__).resolve().parent)

    app.connect("html-page-context", update_context)
    app.connect("build-finished", write_map_data_json)


# if __name__ == "__main__":
#     root = Path(__file__).parent.parent
#     build_dir = root / "build"

#     app = Sphinx(
#         srcdir=root / "source",
#         confdir=root / "source",
#         outdir=build_dir / "html",
#         doctreedir=build_dir / "doctrees",
#         buildername="html"
#     )

#     app.build(force_all=True)
