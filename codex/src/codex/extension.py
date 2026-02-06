
from typing import Any

import json
import shutil
import os

from pathlib import Path

from sphinx.application import Sphinx
from sphinx.config import Config
from sphinx.util import logging
from sphinx.builders.html import StandaloneHTMLBuilder
from sphinx.builders.html._assets import _CascadingStyleSheet, _JavaScript
from sphinx.errors import ConfigError

from codex.directives import LocationDirective, MapDirective, map_node
from codex.secrets.builder import PublicRstBuilder, PublicRstTranslator


__version__ = "1.0.2"

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


# PUBLIC_PREFIX = "public_"
# SECRET_CONFIG_KEY = "__secrets"

# def update_source_dir(app: Sphinx, config: Config) -> None:
#     # To happen before builder init...
#     src_dir = Path(app.srcdir)
#     # TODO: Allow public src directory name to be specified in config.
#     public_src_dir = PUBLIC_PREFIX + src_dir.name
#     src_dest_dir = src_dir.parent / public_src_dir

#     if src_dir == src_dest_dir:
#         logger.error("Public source directory cannot match private source directory! Aborting!")
#         raise ConfigError

#     app.srcdir = src_dest_dir
#     # TODO: replace with object.
#     config[SECRET_CONFIG_KEY] = SecretsConfig(src_dir)

# def generate_public_source(app: Sphinx) -> None:
#     secret_config: SecretsConfig = app.config[SECRET_CONFIG_KEY]

#     if not secret_config:
#         logger.error("Configuration for secret elements is missing!")
#         raise ConfigError
    
#     if app.srcdir.exists():
#         shutil.rmtree(app.srcdir)
#     app.srcdir.mkdir(parents=True, exist_ok=True)

#     logger.info(f"Generating public source RST in {app.srcdir}...")

#     secret_src_dir = secret_config.secret_src_dir
#     logger.info(f"Parsing secret source directory ({secret_src_dir})")
#     for root, dirs, files in os.walk(secret_src_dir):
#         rel_path = Path(root).relative_to(secret_src_dir)
#         target_dir = app.srcdir / rel_path

#         target_dir.mkdir(parents=True, exist_ok=True)
#         os.chmod(target_dir, 0o777)

#         # Exclude the public source...
#         if app.srcdir.name in dirs:
#             dirs.remove(app.srcdir.name)
#         # Exclude "build" or equivalent...
#         if app.outdir.name in dirs:
#             dirs.remove(app.outdir.name)
        
#         for file in files:
#             if not isinstance(file, str):
#                 logger.warning(f"Encountered file not of type string: {file}")
#                 continue

#             src_file = Path(root) / file
#             target_file = target_dir / file

#             if file.endswith(".rst"):
#                 with open(src_file, "r", encoding="utf8") as f:
#                     content = f.read()
                
#                     if is_secret(content):
#                         content = make_public_version(content)
#                         if isinstance(app.builder, StandaloneHTMLBuilder):
#                             app.builder.

#                     with open(target_file, "w", encoding="utf8") as f:
#                         f.write(content)
#             else:
#                 shutil.copy(src_file, target_file)
            
#             os.chmod(target_file, 0o777)


GLOBAL_CSS_FILES = ["main.css", "vellum.css", "sidebar.css", "arctext.style.css"]

def setup_extension(app: Sphinx):
    app.setup_extension("sphinxcontrib.jquery")
    app.setup_extension("sphinxcontrib.restbuilder")

    # TODO: RST Builder Actually doesn't work!
    app.add_builder(PublicRstBuilder) 

    app.config["html_theme"] = "codex"
    app.config["html_permalinks_icon"] = "&nbsp;&#9756;"  # ☜ pointing hand

    app.add_directive("location", LocationDirective)
    app.add_directive("map", MapDirective)

    app.add_node(map_node, html=(map_node.visit_html, map_node.depart_html))

    for css_file in GLOBAL_CSS_FILES:
        app.add_css_file(f"css/{css_file}")

    app.add_js_file("js/common.js")
    app.add_js_file("js/jquery.arctext.js")

    app.add_html_theme("codex", Path(__file__).resolve().parent)

    # app.connect("config-inited", update_source_dir)
    # app.connect("builder-inited", generate_public_source)
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
