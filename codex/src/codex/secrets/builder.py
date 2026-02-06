
from sphinxcontrib.builders.rst import RstBuilder
from sphinxcontrib.writers.rst import RstWriter, RstTranslator

from sphinx.errors import SphinxError
from sphinx.writers.text import STDINDENT


class PublicRstBuilder(RstBuilder):
    name = "public_rst"
    format = "public_rst"

    def init(self):
        self.file_suffix = ".rst"
        self.link_suffix = ".rst"

    # Function to convert the docname to a reST file name.
    def file_transform(self, doc_name):
        return doc_name + self.file_suffix

    # Function to convert the docname to a relative URI.
    def link_transform(self, doc_name):
        return doc_name + self.link_suffix

    def prepare_writing(self, doc_names):
        self.writer = PublicRstWriter(self)


class PublicRstWriter(RstWriter):
    
    def translate(self):
        if self.document is None:
            raise SphinxError("Document cannot be none!")
        visitor = PublicRstTranslator(self.document, self.builder)
        self.document.walkabout(visitor)
        self.output = visitor.body


class PublicRstTranslator(RstTranslator):

    def visit_hint(self, node):
        print("HINT FOUND!")
        super().visit_hint(node)

    # Generic methods...
    def visit_map_node(self, node):
        self.new_state(0)
    def depart_map_node(self, node):
        self.end_state()
