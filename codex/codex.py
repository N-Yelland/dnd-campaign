
from typing import Any

import json

from pathlib import Path

from sphinx.application import Sphinx
from sphinx.util.docutils import SphinxDirective
from sphinx.util import logging

from sphinx.writers.html5 import HTML5Translator

from sphinx.builders.html._assets import _CascadingStyleSheet, _JavaScript

from docutils import nodes
from docutils.parsers.rst import directives


logger = logging.getLogger(__name__)


def parse_coords_value(coords: str) -> tuple[float, ...]:
    return tuple(map(float, coords.split()))


class LocationDirective(SphinxDirective):

    has_content = True
    required_arguments = 1
    final_argument_whitespace = True
    option_spec = {
        "desc": str,
        "coords": parse_coords_value,
        "type": str,
        "label_offset": str,
        "label_rotation": float,
        "lable_curvature": float
    }

    def run(self) -> list[nodes.Node]:
        name = self.arguments[0]
        desc = self.options.get("desc")
        coords = self.options.get("coords")

        section_id = name.lower().replace(" ", "-")

        data = {
            "name": name,
            "docname": self.env.docname,
            "coords": coords,
            "id": section_id,
            "type": self.options.get("type"),
            "label_offset": self.options.get("label_offset")
        }

        section_node = nodes.section(ids=[section_id])
        title_node = nodes.title(text=name)

        section_node += title_node

        if desc:
            section_node += nodes.paragraph(text=desc)

        if self.content:
            self.state.nested_parse(self.content, self.content_offset, section_node)

        section_node["data"] = data

        # TODO: different dictionaries for different "parent" locations
        if not hasattr(self.env, "all_locations"):
            setattr(self.env, "all_locations", {})
        all_locations: dict[str, Any] = getattr(self.env, "all_locations")
        # Ensure there are no duplicates...
        if section_id not in all_locations:
            all_locations[section_id] = data

        return [section_node]


def write_map_data_json(app: Sphinx) -> None:
    data: list[dict[str, Any]] = list(getattr(app.env, "all_locations", {}).values())
    output_path = Path(app.outdir / "map_data.json")
    try:
        with output_path.open("w", encoding="utf8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        logger.info(f"{len(data)} locations written to map_data.json")
    except Exception as e:
        logger.warning(f"Failed to write map_data.json: {e}")


class map_node(nodes.General, nodes.Element):
    """Node for the map object"""

    @staticmethod
    def visit_html(ht: HTML5Translator, node: nodes.Element) ->  None:
        img_src = "_static/" + node.get("img_src", "")
        labels_src = "_static/" + node.get("labels_src", "")

        html = f"""
            <div id="map-region">
                <div class="container">
                    <div class="moveable">
                        <div class="scalable">
                            <img id="map" class="map-img" src="{img_src}">
                            <div id="labels" data-json="{labels_src}"></div>
                        </div>
                    </div>
                </div>

                <div id="infobox" class="hidden">
                    <div class="content">
                        <p><i>Click on a location to find out more...</i></p>
                    </div>
                    <div class="close-btn">Close</div>
                </div>

                <div id="view-info">
                    <div id="zoom"></div>
                    <div id="cursor-coords"></div>
                    <div id="click-coords"></div>
                </div>
        """
        ht.body.append(html)
    
    @staticmethod
    def depart_html(ht: HTML5Translator, node: nodes.Element) -> None:
        """Closes the outermost div."""
        ht.body.append("</div>\n")
    


class MapDirective(SphinxDirective):

    required_arguments = 1
    option_spec = {
        "img": directives.unchanged_required,
        "labels": str
    }
    
    def run(self) -> list[nodes.Node]:
        metadata = self.env.metadata.setdefault(self.env.docname, {})
        map_data = metadata.setdefault("_codex_map_data", {})

        node = map_node()
        node["img_src"] = self.options.get("img")
        node["labels_src"] = self.options.get("labels")

        return [node]


MAP_CSS_FILES = ["map.css", "style.css", "info.css"]
MAP_JS_FILES = ["pan_zoom.js", "map.js"]

def add_map_to_file(app: Sphinx, pagename, templatename, context: dict[str, Any], doctree):
    metadata = app.builder.env.metadata.get(pagename, {})
    # map_data = metadata.get("_codex_map_data", {})
    if "_codex_map_data" not in metadata:
        return
    
    logger.info(f"{pagename} contains a map directive...")
    # TODO: add JS/CSS to context...
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
    
    write_map_data_json(app)
    


def setup(app: Sphinx):
    app.setup_extension("sphinxcontrib.jquery")

    app.config["html_theme"] = "codex"
    app.config["html_permalinks_icon"] = "&#9756;"  # ☜ pointing hand

    app.add_directive("location", LocationDirective)
    app.add_directive("map", MapDirective)

    app.add_node(map_node, html=(map_node.visit_html, map_node.depart_html))

    app.add_css_file("css/main.css")
    app.add_css_file("css/arctext.style.css")

    app.add_js_file("js/common.js")
    app.add_js_file("js/jquery.arctext.js")

    app.add_html_theme("codex", Path(__file__).resolve().parent)

    app.connect("html-page-context", add_map_to_file)



if __name__ == "__main__":
    root = Path(__file__).parent.parent
    build_dir = root / "build"

    app = Sphinx(
        srcdir=root / "source",
        confdir=root / "source",
        outdir=build_dir / "html",
        doctreedir=build_dir / "doctrees",
        buildername="html"
    )

    app.build(force_all=True)
