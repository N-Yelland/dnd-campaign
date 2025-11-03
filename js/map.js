
var mouse_down = false;

var cursor_x = 0;
var cursor_y = 0;

var map_x = 0;
var map_y = 0;

const map = $("#map");

const aspect_ratio = map.height() / map.width();

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
        fade_out_at: 500
    },
    "major-region": {
        size: 17,
        fade_out_at: 450
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
        fade_in_at: 400
    },
    "water": {
        size: 9.5
    }
};

const font_sf = 1 / 700;

const decimal_precision = 5;

const boundary_threshold = 5;

const region_width = $("#map-region").width();
const region_height = $("#map-region").height();

map.height(region_width * aspect_ratio);

const init_height = map.height();

var zoom = 100;
var prev_zoom = localStorage.getItem("zoom");
if (prev_zoom) {
    zoom = parseFloat(prev_zoom);
}

function get_map_coords(x, y) {
    return {
        x: (x - map.offset().left) / map.width(),
        y: (y - map.offset().top) / map.height()
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
                radius: (1 / Math.abs(curvature)) * zoom * 0.01,
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

var prev_zoom = 0;
setInterval(function () {
    if (Math.abs(zoom - prev_zoom) >= 10) {

        var h = init_height * zoom * 0.01;
        var w = init_height * zoom * 0.01 / aspect_ratio;
        var H = $("#map-region").height();
        var W = $("#map-region").width();
        if (h < H || w < W) {
            zoom = prev_zoom
            return;
        }

        prev_zoom = zoom;
        var sf = init_height * zoom * 0.01 / map.height();

        var top = bound(
            cursor_y - sf * (cursor_y - map.position().top),
            H - h + boundary_threshold,
            -boundary_threshold
        )
        var left = bound(
            cursor_x - sf * (cursor_x - map.position().left),
            W - w + boundary_threshold,
            -boundary_threshold
        )

        $("#map, #labels").animate({
            height: h,
            width: w,
            top: top,
            left: left
        }, {smoothing: "linear", duration: 200});

        $("[data-curvature]").updateCurvature();

        $("[data-rotation]").updateRotation();

        for (const [type, data] of Object.entries(type_data)) {
            if (data.fade_out_at) {
                $(`.${type}`).css("opacity", sigmoid(zoom, data.fade_out_at, -150))
            }
            if (data.fade_in_at) {
                $(`.${type}`).css("opacity", sigmoid(zoom, data.fade_in_at, 150))
            }

            $(`.${type}`).each(function () {
                if ($(this).css("opacity") <= 0.01) {
                    $(this).hide();
                } else {
                    $(this).show();
                }
            })
        }

        $("#zoom-level").html(`Zoom: ${zoom}%`);
        localStorage.setItem("zoom", String(zoom));

        // $(".map-obj.major-region").css({
        //     opacity: sigmoid(zoom, 450, -150)
        // })

        // $(".map-obj.region").css({
        //     opacity: sigmoid(zoom, 500, -150)
        // })
        
    }
}, 200)

$.fn.enlargeLowerCase = function () {
    return this.each(function () {
        var html = $(this).text();
        html = html.replace(/([a-z]+)/g, "<span class=\"large-lc-text\">$1</span>");
        $(this).html(html);
    });
}

// ----

var map_data;

$.getJSON("data.json", function (data) {
    map_data = data;

    var init_map_pos = {x: 0, y:0}
    var prev_map_xy = localStorage.getItem("map_xy");
    if (prev_map_xy) {
        init_map_pos = JSON.parse(prev_map_xy);
    }

    $("#map, #labels").css({
        height: init_height * zoom * 0.01,
        width: init_height * zoom * 0.01 / aspect_ratio,
        top: init_map_pos.y,
        left: init_map_pos.x
    });

   

    // create and position label elements
    map_data.objects.forEach(object => {
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
    });

    // add on-click handling...

    $("[data-link]").on("click", function (e) {
        var url = $(this).attr("data-link");
        fetch(`source/${url}`).then(response => { return response.text(); })
            .then(data => {
                var hash = url.split("#")[1];
                if (hash) {
                    var content = $(data).find(`#${hash}`).html();
                } else {
                    var content = data;
                }
                $("#infobox .content").html(content);
                $("#infobox h1").enlargeLowerCase();
                $("#infobox").removeClass("hidden");

                $("#infobox").addSmartQuotes()
            })
    })

    $("#infobox .close-btn").on("click", function () {
        $("#infobox").addClass("hidden");
    })
});


var clicks = [];

// Drag and Zoom Implementation

var prev_x, prev_y;
var init_touch_separation;
var midpoint_x, midpoint_y;

/**
 * Updates the "screen" and "map" coordindates of the current
 * @param {*} e 
 */
function handle_cursor_move(e) {
    cursor_x = e.pageX;
    cursor_y = e.pageY;
    
    map_coords = get_map_coords(cursor_x, cursor_y);
    map_x = map_coords.x.toFixed(decimal_precision);
    map_y = map_coords.y.toFixed(decimal_precision);

    $("#current-coords").html(
        `Screen: (${cursor_x}, ${cursor_y})<br>  Map: (${map_x}, ${map_y})`
    );

    // Drag map objects
    if (mouse_down) {
        if (prev_x) {
            x_offset = cursor_x - prev_x
            y_offset = cursor_y - prev_y

            var map_pos = map.position();
            if (
                map_pos.top + y_offset <= -boundary_threshold &&
                map_pos.left + x_offset <= -boundary_threshold &&
                map_pos.top + map.height() + y_offset >= $("#map-region").height() + boundary_threshold &&
                map_pos.left + map.width() + x_offset >= $("#map-region").width() + boundary_threshold
            ) {
                $("#map, #labels").css({
                    top: "+=" + y_offset,
                    left: "+=" + x_offset
                });
            }
        }

        prev_x = cursor_x;
        prev_y = cursor_y;

        localStorage.setItem("map_xy", JSON.stringify(get_screen_coords(0,0)));
    }
}

$("#labels").on({
    "mousemove": handle_cursor_move,

    "mousedown touchstart": function (e) {
        mouse_down = true;
        init_touch_separation = undefined;
        prev_x = e.pageX;
        prev_y = e.pageY;

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

    "mouseup mouseout touchend touchcancel": function (e) {
        mouse_down = false;
    },

    "wheel": function (e) {
        // disable simultaneous scroll + zoom
        if (!mouse_down) {
            var delta = e.originalEvent.deltaY;
            zoom = zoom - 0.1 * delta;
            localStorage.setItem("map_xy", JSON.stringify(get_screen_coords(0,0)));
        }
    },

    "touchmove": function (e) {
        e.preventDefault();

        if (e.touches.length == 1) {
            mouse_down = true;
            handle_cursor_move(e.touches[0]);

        } else if (e.touches.length == 2) {

            var d = distance(
                    e.touches[0].pageX, e.touches[0].pageY,
                    e.touches[1].pageX, e.touches[1].pageY
            );

            if (!init_touch_separation) {
                init_touch_separation = d;
                var midpoint_x = (e.touches[0].pageX + e.touches[1].pageX) / 2;
                var midpoint_y = (e.touches[0].pageY + e.touches[1].pageY) / 2;
            }
            
            var delta = Math.log2(d / (init_touch_separation + 1));
            zoom = zoom + delta;
            localStorage.setItem("map_xy", JSON.stringify(get_screen_coords(0,0)));

        }
    }
});
