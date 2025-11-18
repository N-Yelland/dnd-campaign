
from sphinx.util.docutils import SphinxDirective
from sphinx.util import logging

from sphinx.writers.html5 import HTML5Translator

from docutils import nodes
from docutils.parsers.rst import directives


logger = logging.getLogger(__name__)


class map_node(nodes.General, nodes.Element):
    """Node for the map object"""

    @staticmethod
    def visit_html(ht: HTML5Translator, node: nodes.Element) ->  None:
        img_src = "_static/" + node.get("img_src", "")
        labels_src = "_static/" + node.get("labels_src", "")

        # TODO: Switch to using a Jinja template!
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

                <div class="map-sidebar">
                    <div id="view-info">
                        <div id="zoom"></div>
                        <div id="cursor-coords"></div>
                        <div id="click-coords"></div>
                    </div>

                    <div id="fullscreen-button" class="map-control-button" title="Fullscreen">
                        <img class="button-icon" src="_static/img/control_icons/fullscreen.svg">
                    </div>

                    <div id="zoom-in-button" class="map-control-button" title="Zoom In">
                        <img class="button-icon" src="_static/img/control_icons/zoom_in.svg">
                    </div>

                    <div id="zoom-out-button" class="map-control-button" title="Zoom Out">
                        <img class="button-icon" src="_static/img/control_icons/zoom_out.svg">
                    </div>

                    <div id="home-button" class="map-control-button" title="Recenter">
                        <img class="button-icon" src="_static/img/control_icons/home.svg">
                    </div>
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
