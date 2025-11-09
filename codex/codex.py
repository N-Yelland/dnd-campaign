
from typing import Any

import json

from pathlib import Path

from sphinx.application import Sphinx
from sphinx.writers.html5 import HTML5Translator
from sphinx.util.docutils import SphinxDirective
from sphinx.util import logging

from docutils import nodes


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
            "docname": self.env.docname,
            "lineno": self.lineno,
            "coords": coords,
            "id": section_id
        }

        section_node = nodes.section(ids=[section_id])
        title_node = nodes.title(text=name)

        section_node += title_node

        if desc:
            section_node += nodes.paragraph(text=desc)

        if self.content:
            self.state.nested_parse(self.content, self.content_offset, section_node)

        section_node["data"] = data

        if not hasattr(self.env, "all_locations"):
            setattr(self.env, "all_locations", [])
        all_locations: list = getattr(self.env, "all_locations")
        all_locations.append(data)

        return [section_node]


def write_map_data_json(app: Sphinx, exception: Exception | None):
    if exception:
        print("Skipping map_data.json creation due to build exception.")
        return
    data: list[dict[str, Any]] = getattr(app.env, "all_locations", [])
    output_path = Path(app.outdir / "map_data.json")
    try:
        with output_path.open("w", encoding="utf8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        logger.info(f"{len(data)} locations written to map_data.json")
    except Exception as e:
        logger.warning(f"Failed to write map_data.json: {e}")


def setup(app: Sphinx):
    app.config["html_theme"] = "codex"
    app.config["html_permalinks_icon"] = "&#9756;"  # ☜ pointing hand

    app.add_directive("location", LocationDirective)

    app.add_html_theme("codex", Path(__file__).resolve().parent)

    app.add_js_file("https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js")
    app.add_js_file("//www.google.com/jsapi")
    app.add_js_file("js/common.js")

    app.connect("build-finished", write_map_data_json)



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

    app.preload_builder
    app.build(force_all=True)
