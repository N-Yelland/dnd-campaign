# Codex

A Sphinx theme/extension for medieval-style D&D documentation! There are three main features:
 - HTML Theme 
 - Locations
 - Maps

## HTML Theme
Codex provides Sphinx with an HTML theme that's much more era-appropriate for D&D. This includes using the (almost cliché) [IM Fell English](https://fonts.google.com/specimen/IM+Fell+English) font.

#TODO: Allow customisation of colours, etc.

## Locations
`..location ::` directives can be included within your RST.

```RST
.. location:: Vilras
    :desc: Ancient Capital of the Erranite Empire
    :coords: 0.26042 0.15315
    :type: ruin
    :label_offset: left

    Gravity-defying Bluestone spires sprout from the dense forest like hands reaching up to the heavens, each of the many "fingers" intricately carved with the runic language of their creators. But there is no one left to read them...
```

These render nicely in HTML, but their real power comes from their interaction with...

## Maps

```RST
.. map:: Erran
    :img: img/map_of_erran.png
    :labels: map_of_erran_labels.json
```
The `.. map::` directive renders an interactive map widget in HTML, using the file in `_static/` specified by the `:img:` option. Each `.. label::` directive in the documentation source will cause an appropriate icon/label to appear on the map.

There is also the option of providing a JSON file of labels manually with the `:labels:` option - this is combined with any existing labels.