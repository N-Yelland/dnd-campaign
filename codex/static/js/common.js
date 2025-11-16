
$.fn.enlargeLowerCase = function () {
    return this.each(function () {
        var children = $(this).children();
        children.remove();
        $(this).remove(children);
        
        var text = $(this).text();
        html = text.replace(/([a-z]+)/g, "<span class=\"large-lc-text\">$1</span>");
        $(this).html(html);
        
        $(this).append(children);
    });
};

$(document).ready(function () {
    $("h1, h2").enlargeLowerCase();
});
