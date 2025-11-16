import sys

from pathlib import Path


# Configuration file for the Sphinx documentation builder.
#
# For the full list of built-in configuration values, see the documentation:
# https://www.sphinx-doc.org/en/master/usage/configuration.html

# -- Project information -----------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#project-information

project = 'dnd-campaign'
copyright = '2025, Nic Yelland'
author = 'Nic Yelland'

# -- General configuration ---------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#general-configuration

extensions = []

templates_path = ['_templates']
exclude_patterns = []



# -- Options for HTML output -------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#options-for-html-output


sys.path.append(str(Path('../codex').resolve()))

html_static_path = ['_static']

extensions = ['codex']


# For speed, we disable these featuers:
html_use_index = False
html_additional_pages = {}
