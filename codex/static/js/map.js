
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
        fade_out_at: 0.75
    },
    "major-region": {
        size: 17,
        fade_out_at: 0.75
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
        fade_in_at: 0.75
    },
    "water": {
        size: 9.5
    }
};

const font_sf = 1 / 700;

const decimal_precision = 5;

const boundary_threshold = 10;

// ---

function load_into_infobox(src) {
    const escaped_src = src.replace("'", "\\'")
    fetch(escaped_src).then(response => {
        return response.text();
    }).then(data => {
        var hash = escaped_src.split("#")[1];
        if (hash) {
            var content = $(data).find(`#${hash}`).html();
        } else {
            var content = data;
        }
        $("#infobox .content").html(content);
        
        $("#infobox h2").enlargeLowerCase();
        // $("#infobox").addSmartQuotes()

        // change link to send user to original source
        $("#infobox a.headerlink").attr({
            "href": src,
            "title": "Go to page"
        });

        $("#infobox").removeClass("hidden");
    })
}

function get_map_coords(x, y) {
    const rx = zoom * tx + (1 - zoom) * px;
    const ry = zoom * ty + (1 - zoom) * py;
    return {
        x: (x - rx) / (zoom * $("#map").width()),
        y: (y - ry) / (zoom * $("#map").height())
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

function update_opacity() {
    for (const [type, data] of Object.entries(type_data)) {
        const obj = $(`.${type}`);

        if (data.fade_out_at) {
            obj.css("opacity", sigmoid(zoom, data.fade_out_at, -0.5))
        }
        if (data.fade_in_at) {
            obj.css("opacity", sigmoid(zoom, data.fade_in_at, 0.5))
        }

        obj.each(function () {
            if ($(this).css("opacity") <= 0.05) {
                $(this).hide();
            } else {
                $(this).show();
            }
        })
    }
}

// ----

var map_data;

function add_map_object(object) {
    var x = object.coords[0];
    var y = object.coords[1];

    var label_type = type_data[object.type];

    if (label_type.icon) {
        var src = `_static/img/icons/${label_type.icon}.png`;
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

    var obj_div = $(`<div class="map-obj ${object.type}">${object.name}</div>`);

    obj_div.css({
        "top": `${y * 100}%`,
        "left": `${x * 100}%`,
        "font-size": `${label_type.size / 7}cqh`
    });
    $("#labels").append(obj_div);

    if (object.top_text) {
        var html = `<span class=top-text>${object.top_text}</span><span>${object.name}</span>`;
        obj_div.html(html);
    }

    if (object.label_curvature) {
        var curv_objs;
        if (object.top_text) {
            curv_objs = obj_div.children();
        } else {
            curv_objs = obj_div;
        }

        const curvature = object.label_curvature;
        curv_objs.arctext({
            radius: (3 / Math.abs(curvature)),
            dir: Math.sign(curvature)
        });

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

    if (object.label_rotation) {
        obj_div.attr("data-rotation", object.label_rotation);
        obj_div.updateRotation();
    }

    if (object.spacing) {
        obj_div.css({"letter-spacing": object.spacing  + "em"});
    }

    if (object.docname) {
        obj_div.attr("data-link", `${object.docname}.html#${object.id}`);
    }

    // TODO: Implement label offsets with translate(x, y)

    if (object.label_offset) {
        var x_shift = -50, y_shift = -50;
        var icon_dodge = $("#map").height() * height / (7 * 2 * obj_div.width())
        if (typeof(object.label_offset) == "string") {
            if (object.label_offset.includes("below")) { y_shift += (55 + icon_dodge); }
            if (object.label_offset.includes("above")) { y_shift -= (75 + icon_dodge); }
            if (object.label_offset.includes("right")) {
                x_shift += (50 + icon_dodge);
                y_shift -= icon_dodge / 2;
                object.align = "left";
            }
            if (object.label_offset.includes("left"))  {
                x_shift -= (50 + icon_dodge);
                y_shift -= icon_dodge / 2;
                object.align = "right";
            }
        } else {
            x_shift += object.label_offset[0] //+ Math.sign(object.label_offset[0]) * icon_dodge;
            y_shift += object.label_offset[1] //+ Math.sign(object.label_offset[1]) * icon_dodge;
        }
        obj_div.css({transform: `translate(${x_shift}%, ${y_shift}%)`});
    }

    if (object.align) {
        obj_div.css({"text-align": object.align});
    }

}

$(document).ready(function () {

    $(".moveable").css({
        height: $("#map").height(),
        width: $("#map").width()
    });

    var selected_info = localStorage.getItem("selected_info");
    if (selected_info) {
        load_into_infobox(selected_info);
    }

    // Add lables for map data...
    $.getJSON("map_data.json", function (data) {
        // create and position label elements
        data.forEach(add_map_object);

        // add on-click handling...
        $("[data-link]").on("click", function (e) {
            var url = $(this).attr("data-link");
            load_into_infobox(url);
            localStorage.setItem("selected_info", url);
        })

        $("#infobox .close-btn").on("click", function () {
            $("#infobox").addClass("hidden");
            localStorage.removeItem("selected_info")
        })
    });

    // Add remaining labels...
    json_src = $("#labels").attr("data-json");
    $.getJSON(json_src, function (data) {
        data.forEach(add_map_object);
    });
    
    update_opacity();

});

$(document).on("changeZoom", function () {
    $("#zoom").html(`Zoom: ${(zoom * 100).toFixed()}%`);
    update_opacity();
});

$(document).ready(function () {
    $("#labels").on({
        "mousedown touchstart": function (e) {
            const map_x = (e.offsetX / $("#map").width()).toFixed(decimal_precision);
            const map_y = (e.offsetY / $("#map").height()).toFixed(decimal_precision);
            $("#click-coords").html(`Last click: (${map_x}, ${map_y})`);

        },
        "mousemove": function (e) {
            const map_x = (e.offsetX / $("#map").width()).toFixed(decimal_precision);
            const map_y = (e.offsetY / $("#map").height()).toFixed(decimal_precision);
            $("#cursor-coords").html(`Coords: (${map_x}, ${map_y})`);

        }
    });

    update_opacity();
});
