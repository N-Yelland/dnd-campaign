
from pathlib import Path

from sphinx.application import Sphinx

def setup(app: Sphinx):
    print(Path(__file__).resolve().parent)
    app.add_html_theme("codex", Path(__file__).resolve().parent)

    app.add_js_file("https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js")
    app.add_js_file("//www.google.com/jsapi")
    app.add_js_file("js/common.js")
