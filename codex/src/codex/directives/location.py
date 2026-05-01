
from typing import Any

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
            "name": name,
            "docname": self.env.docname,
            "coords": coords,
            "id": section_id,
            "type": self.options.get("type"),
            "label_offset": self.options.get("label_offset", "above")
        }

        print(f"Found location: {name}")

        section_node = nodes.section(ids=[section_id], classes=["location"])
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
