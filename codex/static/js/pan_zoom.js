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


function updatePosition() {
    alt_tx = tx + ((1 - zoom)/zoom) * (px - cursor_x);
    alt_ty = ty + ((1 - zoom)/zoom) * (py - cursor_y);

    $(".moveable").css({
        top: ty,
        left: tx
    });

    localStorage.setItem("tx", tx);
    localStorage.setItem("ty", ty);
    localStorage.setItem("px", px);
    localStorage.setItem("py", py);
}


$(document).ready(function () {

    /* CURSOR EVENT HANDLING */
    
    $(".container").on({
        "mousemove": function (e) {
            cursor_x = e.pageX;
            cursor_y = e.pageY;

            // Drag objects
            if (mouse_down) {
                if (prev_x) {
                    x_offset = cursor_x - prev_x
                    y_offset = cursor_y - prev_y

                    tx += x_offset;
                    ty += y_offset;

                    px += x_offset;
                    py += y_offset;
                }
                prev_x = cursor_x;
                prev_y = cursor_y;
            }

            updatePosition();
        },

        "mousedown": function (e) {
            mouse_down = true;

            prev_x = e.pageX;
            prev_y = e.pageY;
        },

        "mouseup": function (e) {
            mouse_down = false;
        },

        "wheel": function (e) {
            e.preventDefault()

            const zoom_direction = (e.originalEvent.deltaY > 0) ? -1 : 1;
            const new_zoom = zoom * Math.pow(ZOOM_TICK, zoom_direction);
            zoom = new_zoom;

            px = e.originalEvent.pageX;
            py = e.originalEvent.pageY;

            tx = alt_tx;
            ty = alt_ty;

            const origin_x = px - tx - $(this).offset().left;
            const origin_y = py - ty - $(this).offset().top;

            updatePosition();

            $(".scalable").css({
                "transform-origin": `${origin_x}px ${origin_y}px`,
                "transform": `scale(${new_zoom})`
            });

            $(document).trigger("changeZoom");

            localStorage.setItem("zoom", new_zoom);
            localStorage.setItem("tx", tx);
            localStorage.setItem("ty", ty);
            localStorage.setItem("origin_x", origin_x);
            localStorage.setItem("origin_y", origin_y);

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