/*
Given a DOM strucutre of the form:

    <div class="container">
        <div class="movable">
            <div class="scalable">
                content here..
            </div>
        </div>
    </div>

this JS allows the inner content to be panned and zoomed with the cursor.

*/

function read_local_float(name, fallback) {
    const value = localStorage.getItem(name);
    return value != null ? parseFloat(value) : fallback;
}

/* CONSTANTS AND VARIABLE INITIALISATION */

// Scale by which zoom is adjusted each "tick" of the mouse wheel
const ZOOM_TICK = 1.12

var zoom = read_local_float("zoom", 1.0);

var mouse_down = false;

// Cursor location at most recent mousedown event
var prev_x, prev_y;

// Offset of unscaled object
var tx = read_local_float("tx", 0);
var ty = read_local_float("ty", 0);

// Origin point of most recent zoom
var px = read_local_float("px", 0);
var py = read_local_float("py", 0);

// Required offset if a zoom were to occur at the current cursor location
var alt_tx;
var alt_ty;

// Variable to store initial separation of touch points in pinch-zoom
var last_separation = null;


function update_position(x, y) {
    alt_tx = tx + ((1 - zoom)/zoom) * (px - x);
    alt_ty = ty + ((1 - zoom)/zoom) * (py - y);

    $(".moveable").css({
        top: ty,
        left: tx
    });

    localStorage.setItem("tx", tx);
    localStorage.setItem("ty", ty);
    localStorage.setItem("px", px);
    localStorage.setItem("py", py);
}


function move_cursor(x, y) {
    // Drag objects
    if (mouse_down) {
        if (prev_x) {
            x_offset = x - prev_x
            y_offset = y - prev_y

            tx += x_offset;
            ty += y_offset;

            px += x_offset;
            py += y_offset;
        }
        prev_x = x;
        prev_y = y;
    }

    update_position(x, y);
}


function adjust_zoom(x, y, z) {
    px = x;
    py = y;
    tx = alt_tx;
    ty = alt_ty;

    const origin_x = px - tx - $(".container").offset().left;
    const origin_y = py - ty - $(".container").offset().top;

    update_position(px, py);

    $(".scalable").css({
        "transform-origin": `${origin_x}px ${origin_y}px`,
        "transform": `scale(${z})`
    });

    $(document).trigger("changeZoom");

    localStorage.setItem("zoom", z);
    localStorage.setItem("origin_x", origin_x);
    localStorage.setItem("origin_y", origin_y);
}


$(document).ready(function () {

    /* CURSOR EVENT HANDLING */
    
    $(".container").on({
        "mousemove": function (e) {
            move_cursor(e.pageX, e.pageY);
        },

        "touchmove": function (e) {
            const touches = e.originalEvent.touches;
            if (touches.length > 2) {
                // We only handle single and double touches...
                return
            }
            e.preventDefault();
            if (touches.length == 1) {
                // drag map
                move_cursor(e.originalEvent.touches[0].pageX, e.originalEvent.touches[0].pageY);
            } else {
                // adjust zoom
                const x1 = touches[0].pageX;
                const y1 = touches[0].pageY;
                const x2 = touches[1].pageX;
                const y2 = touches[1].pageY;

                const separation = Math.hypot(x2 - x1, y2 - y1);

                if (last_separation !== null) {
                    const zoom_factor = separation / last_separation;
                    zoom *= zoom_factor;

                    const mx = (x1 + x2) / 2;
                    const my = (y1 + y2) / 2;

                    adjust_zoom(mx, my, zoom);
                }

                last_separation = separation;
            }
        },

        "mousedown": function (e) {
            mouse_down = true;
            prev_x = e.pageX;
            prev_y = e.pageY;
        },

        "touchstart": function (e) {
            mouse_down = true;
            prev_x = e.originalEvent.touches[0].pageX;
            prev_y = e.originalEvent.touches[0].pageY;
        },

        "mouseup": function (e) {
            mouse_down = false;
        },

        "touchend touchcancel": function (e) {
            mouse_down = false;
            const touches = e.originalEvent.touches;
            if (touches.length < 2) {
                last_separation = null;
            }
        },

        "wheel": function (e) {
            e.preventDefault()

            const zoom_direction = (e.originalEvent.deltaY > 0) ? -1 : 1;
            zoom *= Math.pow(ZOOM_TICK, zoom_direction);

            adjust_zoom(e.originalEvent.pageX, e.originalEvent.pageY, zoom);
        }
    });

    /* INITIAL POSITIONING */

    const origin_x = read_local_float("origin_x", 0);
    const origin_y = read_local_float("origin_y", 0);
    $(".moveable").css({
        top: ty,
        left: tx
    });
    $(".scalable").css({
        "transform-origin": `${origin_x}px ${origin_y}px`,
        "transform": `scale(${zoom})`
    });

    /* CSS INITIALISATION */

    $(".container").css({
        position: "relative",
        overflow: "hidden",
        height: "100%",
        width: "100%"
    });

    $(".moveable").css({
        position: "absolute",
    });

    $(".scalable").css({
        height: "100%",
        width: "100%",
        transition: "transform 0.2s"
    });

});