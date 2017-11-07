chrome.browserAction.onClicked.addListener(function() {

    // Get tinkoff session id from cookies
    chrome.cookies.get({"url": "https://www.tinkoff.ru", "name": "psid"}, function(cookie) {
        const psid = cookie.value;
        
        const now = new Date();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate()) - 1; // yesterday
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()) - (30 * 24 * 60 * 60 * 1000); // month ago

        // Export operations in csv file into download/tinkoff folder
        chrome.downloads.download({
            url: `https://api07.tinkoff.ru/v1/export_operations/?format=csv&sessionid=${cookie.value}&start=${start}&end=${end}`,
            filename: `tinkoff/${start}-${end}.csv`
        });
    });
});