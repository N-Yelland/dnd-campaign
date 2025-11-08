
// constants

const map = $("#map");

const type_data = {
    "feature": {
        size: 6
    },
    "ruin": {
        size: 6,
        icon : "ruin"
    },
    "river": {
        size: 5
    },
    "region": {
        size: 9.5,
        fade_out_at: 6
    },
    "major-region": {
        size: 17,
        fade_out_at: 4.5
    },
    "minor-region": {
        size: 5
    },
    "landmark": {
        size: 4.5,
        icon: "landmark",
        icon_size: 6
    },
    "town": {
        size: 6,
        icon: "town"
    },
    "city": {
        size: 7.5,
        icon: "city",
        icon_size: 9.5
    },
    "village": {
        size: 4.5,
        icon: "town",
        fade_in_at: 4.0
    },
    "water": {
        size: 9.5
    }
};

const font_sf = 1 / 700;

const decimal_precision = 5;

const boundary_threshold = 10;

// On Load things...

const aspect_ratio = map.height() / map.width();

const region_width = $("#map-region").width();
const region_height = $("#map-region").height();

const region_aspect_ratio = region_height / region_width;

if (parseFloat(localStorage.getItem("region_aspect_ratio")) != region_aspect_ratio) {
    // if region aspect ratio changes, we don't attempt to preserve map zoom/position
    localStorage.clear();
}
localStorage.setItem("region_aspect_ratio", region_aspect_ratio);

if (region_height / region_width < 1) {
    map.height(region_width * aspect_ratio);
} else {
    // portrait
    map.height(region_height);
}

const init_height = map.height();

$("#labels").css({
    height: init_height,
    width: init_height / aspect_ratio
});

var selected_info = localStorage.getItem("selected_info");
if (selected_info) {
    load_into_infobox(selected_info);
}

// ---

function load_into_infobox(src) {
    fetch(src).then(response => {
        return response.text();
    }).then(data => {
        var hash = src.split("#")[1];
        if (hash) {
            var content = $(data).find(`#${hash}`).html();
        } else {
            var content = data;
        }
        $("#infobox .content").html(content);
        
        $("#infobox h1").enlargeLowerCase();
        $("#infobox").addSmartQuotes()

        $("#infobox").removeClass("hidden");
    })
}

function get_map_coords(x, y) {
    const rx = zoom * tx + (1 - zoom) * px;
    const ry = zoom * ty + (1 - zoom) * py;
    return {
        x: (x - rx) / (zoom * map.width()),
        y: (y - ry) / (zoom * map.height())
    };
}

function get_screen_coords(x, y) {
    return {
        x: map.position().left + map.width() * x,
        y: map.position().top + map.height() * y
    };
};

/**
 * Sigmoid function with given change point and width. The width measures the interval in which the
 * output changes from 0 to 1, within an approx. 1% tolerance. A negative value reverse the
 * direction of change, i.e. from 1 to 0.
 * @param {float} x - the input parameter
 * @param {float} a - the change point
 * @param {float} w - the width of interval in which change occurs
 */
function sigmoid(x, a, w) {
    return 1 / (1 + Math.exp(10 * (a - x) / w))
}

function distance(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
}

function bound(x, lower, upper) {
    return Math.max(lower, Math.min(upper, x));
}

$.fn.updateCurvature = function () {
    return this.each(function () {
        var curvature = $(this).attr("data-curvature");
        if (curvature) {
            $(this).arctext("set", {
                radius: (1 / Math.abs(curvature)) * zoom,
                dir: Math.sign(curvature),
                animation: "200ms linear"});
        }
    });
};

$.fn.updateRotation = function () {
    return this.each(function () {
        var rotation = $(this).attr("data-rotation");
        if (rotation) {
            $(this).css({
                // messes up label offsets!
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`
            });
        }
    });
}

$.fn.enlargeLowerCase = function () {
    return this.each(function () {
        var html = $(this).text();
        html = html.replace(/([a-z]+)/g, "<span class=\"large-lc-text\">$1</span>");
        $(this).html(html);
    });
}

// ----

var map_data;

function add_map_object(object) {
    var x = object.position[0];
    var y = object.position[1];

    var label_type = type_data[object.type];

    if (label_type.icon) {
        var src = `img/${label_type.icon}.png`;
        var icon_div = $(`<img class="map-icon map-obj ${object.type}" src=${src}>`);
        var height = label_type.size
        if (label_type.icon_size) {
            height = label_type.icon_size
        }
        icon_div.css({
            "top": `${y * 100}%`,
            "left": `${x * 100}%`,
            "height": `${height / 7}cqh`
        });
        $("#labels").append(icon_div);
    }

    var obj_div = $(`<div class="map-obj ${object.type}">${object.text}</div>`);

    obj_div.css({
        "top": `${y * 100}%`,
        "left": `${x * 100}%`,
        "font-size": `${label_type.size / 7}cqh`
    });
    $("#labels").append(obj_div);

    if (object.top_text) {
        var html = `<span class=top-text>${object.top_text}</span><span>${object.text}</span>`;
        obj_div.html(html);
    }

    if (object.curvature) {
        if (object.top_text) {
            curv_objs = obj_div.children();
        } else {
            curv_objs = obj_div;
        }
        curv_objs.attr("data-curvature", object.curvature);
        curv_objs.arctext() // initialisation
        curv_objs.updateCurvature(zoom);

        if (object.type.includes("region")) {
            curv_objs.children().enlargeLowerCase();
        }
    } else {
        if (object.type.includes("region")) {
            curv_objs.children().enlargeLowerCase();
        } else if (object.type != "water") {
            obj_div.enlargeLowerCase();
        }
        obj_div.html(obj_div.html().replace("\\", "<br>"));
    }

    if (object.rotation) {
        obj_div.attr("data-rotation", object.rotation);
        obj_div.updateRotation();
    }

    if (object.spacing) {
        obj_div.css({"letter-spacing": object.spacing  + "em"});
    }

    if (object.align) {
        obj_div.css({"text-align": object.align});
    }

    if (object.link) {
        obj_div.attr("data-link", object.link);
    }

    // TODO: Implement label offsets with translate(x, y)

    if (object.label_offset) {
        var x_shift = -50, y_shift = -50;
        var icon_dodge = map.height() * height / (7 * 2 * obj_div.width())
        if (typeof(object.label_offset) == "string") {
            if (object.label_offset.includes("below")) { y_shift += (55 + icon_dodge); }
            if (object.label_offset.includes("above")) { y_shift -= (75 + icon_dodge); }
            if (object.label_offset.includes("right")) {
                x_shift += (50 + icon_dodge);
                y_shift -= icon_dodge / 2;
            }
            if (object.label_offset.includes("left"))  {
                x_shift -= (50 + icon_dodge);
                y_shift -= icon_dodge / 2;
            }
        } else {
            x_shift += object.label_offset[0] //+ Math.sign(object.label_offset[0]) * icon_dodge;
            y_shift += object.label_offset[1] //+ Math.sign(object.label_offset[1]) * icon_dodge;
        }
        obj_div.css({transform: `translate(${x_shift}%, ${y_shift}%)`});
    }
}

$(document).ready(function () {
    $.getJSON("data.json", function (data) {
        map_data = data;

        // create and position label elements
        map_data.objects.forEach(add_map_object);

        // add on-click handling...
        $("[data-link]").on("click", function (e) {
            var url = "source_old/" + $(this).attr("data-link");
            load_into_infobox(url);
            localStorage.setItem("selected_info", url);
        })

        $("#infobox .close-btn").on("click", function () {
            $("#infobox").addClass("hidden");
            localStorage.removeItem("selected_info")
        })
    });
});


var clicks = [];


$("#labels").on({
    "mousedown touchstart": function (e) {

        cursor_x = e.pageX;
        cursor_y = e.pageY;
        
        map_coords = get_map_coords(cursor_x, cursor_y);
        map_x = map_coords.x.toFixed(decimal_precision);
        map_y = map_coords.y.toFixed(decimal_precision);
        
        clicks.push({x: map_x, y: map_y});
        var html = `Last click: (${map_x}, ${map_y})`;

        var prev_click = clicks.at(-2);
        if (prev_click) {
            var offset_x = (map_x - prev_click.x).toFixed(decimal_precision);
            var offset_y = (map_y - prev_click.y).toFixed(decimal_precision);
            html += `<br>Offset from previous: (${offset_x}, ${offset_y})`;
        }

        $("#last-click").html(html);

    },
});

$(document).on("changeZoom", function () {
    $("#zoom-level").html(`Zoom: ${(zoom * 100).toFixed()}%`)

    for (const [type, data] of Object.entries(type_data)) {
        if (data.fade_out_at) {
            $(`.${type}`).css("opacity", sigmoid(zoom, data.fade_out_at, -2))
        }
        if (data.fade_in_at) {
            $(`.${type}`).css("opacity", sigmoid(zoom, data.fade_in_at, 2))
        }

        $(`.${type}`).each(function () {
            if ($(this).css("opacity") <= 0.01) {
                $(this).hide();
            } else {
                $(this).show();
            }
        })
    }
});

$("#zoom-level").html(`Zoom: ${(zoom * 100).toFixed()}%`)