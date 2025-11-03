
$.fn.addSmartQuotes = function () {
    return this.each(function () {
        // loop over leaf nodes that comprise of only text...
        $(this).find(":not(:has(*))").each(function () {
            var text = $(this).html();
            // regex matches quotes that have either whitespace, non-word character, or
            // start-of-text to their immediate left.
            text = text.replace(/(^|\W|\s)"/g, "$1&ldquo;")
            text = text.replace(/(^|\W|\s)'/g, "$1&lsquo;")
            $(this).html(text);
        })
    });
};
