
$.fn.enlargeLowerCase = function () {
    return this.each(function () {
        var html = $(this).text();
        html = html.replace(/([a-z]+)/g, "<span class=\"large-lc-text\">$1</span>");
        $(this).html(html);
    });
};

$(document).ready(function () {
    $("h1, h2").enlargeLowerCase();
});
