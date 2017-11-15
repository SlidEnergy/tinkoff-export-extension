// Listen click event by extension button
chrome.browserAction.onClicked.addListener(function() {

    // Get tinkoff session id from cookies
    chrome.cookies.get({"url": "https://www.tinkoff.ru", "name": "psid"}, function(cookie) {
        const psid = cookie.value;
        
        download('card', localStorage.getItem('cardNumber'), psid);
    });
});

function download(cardName, cardNumber, psid) {
    const end = new Date();
    
    let start;

    if(localStorage.getItem('lastDate')) {
        start = new Date(localStorage.getItem('lastDate'));
        start.setSeconds(start.getSeconds() + 1); // next seconds of last period
    }
    else {
        start = new Date(end.getFullYear(), end.getMonth(), end.getDate());
        start.setMonth(start.getMonth()-1); // month ago
    }

    const url = `https://api07.tinkoff.ru/v1/export_operations/?format=csv&sessionid=${psid}&start=${+start}&end=${+end}&account=5003116562&card=${cardNumber}`;
    let fileName = `${cardName}-${start.getDate()}_${start.getMonth() + 1}_${start.getFullYear()}-${end.getDate()}_${end.getMonth() + 1}_${end.getFullYear()}.csv`;

    // Send requst for export operations to csv file
    var req = new XMLHttpRequest();
    req.open("GET", url, true);
    req.onreadystatechange = function() {
        if (req.readyState == 4 && req.status == 200) {
            
            // Convert to Ynab csv import format
            let ynabCSV = convertTinkoffCSVToYnabCSV(req.responseText);

            saveFile(ynabCSV, `ynab-${fileName}`);

            localStorage.setItem('lastDate', end);
        }
    };
    // Response from tinkoff always in windows-1251
    req.overrideMimeType('application/octet-stream;charset=windows-1251');
    req.send();

    // Export operations in csv file into download folder
    chrome.downloads.download({
        url: url,
        filename: `tinkoff-${fileName}`
    });
}

function convertTinkoffCSVToYnabCSV(tinkoffCsv) {
    // Convert tinkoff csv export file to csv file for import to Ynab

    // convert string to array of objects
    let tinkoffData = convertCSVToArrayOfObjects(tinkoffCsv);

    let ynabData = [];
    for(var i = 0; i<tinkoffData.length; i++) {
        // Convert to Ynab operation row
        let row = convertTinkoffDataRowToYnabDataRow(tinkoffData[i]);
        if(row)
            ynabData.push(row);
    }
    
    // convert array of objects to string
    let ynabCSV = convertArrayOfObjectsToCSV({data: ynabData});
    
    return ynabCSV;
}

function convertTinkoffDataRowToYnabDataRow(row) {
    // Convert tinkoff operation to operation for import to Ynab

    // datetime
    var pattern = /(\d{2})\.(\d{2})\.(\d{4})\ (\d{2}):(\d{2}):(\d{2})/;
    var date = new Date(row['Дата операции'].replace(pattern,'$3-$2-$1 $4:$5:$6'));

    // inflow & outflow
    let sum = parseInt(parseFloat(row["Сумма операции"].replace(',', '.')));
    let inflow = 0;
    let outflow = 0;
    if(sum < 0)
        outflow = Math.abs(sum);
    else
        inflow = sum;

    // category
    let category = categories[row["Категория"]] || "";
    category = descriptions[row["Описание"]] || category;

    // description
    description = row["Описание"];
    description += ' (' + row["Категория"] + ')';

    // payee
    let payee = payees[row["Описание"]] || "";

    if(row["Статус"] == "OK")
        return { 
            Date: `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`, 
            Payee: payee, 
            Category: category,
            Memo: description, 
            Outflow: outflow, 
            Inflow: inflow 
        };

    return null;
}

let categories = {
    // игнорируем
    "Наличные":"",
    "Переводы/иб":"",

    // для анализа
    "Другое":"",
    "Финан. услуги":"",
    "Одежда, обувь":"",
    "Разные товары":"",
    "Сервис. услуги":"",
    "Ювелирные изделия и часы":"",
    "Связь, телеком":"Фикс. месячные счета: Телефон мой и Насти",
    "Мобильные/иб":"Фикс. месячные счета: Телефон мой и Насти",

    // разбираем
    "Топливо":"Ежедневные траты: Бензин",
    "Супермаркеты":"Ежедневные траты: Продукты",
    "Фастфуд":"Ежедневные траты: Развлечение и спонтанные покупки",
    "Рестораны":"Ежедневные траты: Развлечение и спонтанные покупки",
    "Цветы":"Разовые платежи: Праздники и подарки",
    "Аптеки":"Разовые платежи: Здоровье",
    "Дом, ремонт":"Ежедневные траты: Разное"
}

let descriptions = {
    "YUVOS":"Ежедневные траты: Разное",
    "Avito":"Ежедневные траты: Разное",
    "Плата за обслуживание":"Фикс. месячные счета: Разное (смс-банки)",
    "Плата за предоставление услуги SMS-банк":"Фикс. месячные счета: Разное (смс-банки)",
    "NASH DETSKIY":"Ежедневные траты: Ребенок",

    "Вознаграждение за операции покупок":"",
    "Проценты на остаток по счету":"",
}

let payees = {
    "Авто Ипотека Сбербанк": "Сбербанк"
}

function saveFile(csv, filename) {
    var bb = new Blob([csv], {type: 'text/csv;charset=utf-8'});

    var a = document.createElement('a');
    a.download = filename;
    a.href = window.URL.createObjectURL(bb);
    //a.dataset.downloadurl = ["text/csv;charset=utf-8", a.download, a.href].join(':');
  
    a.click();
}

function convertCSVToArrayOfObjects(bufferString) {
    arr = bufferString.split('\n'); 
    var jsonObj = [];
    // Strim start and end quotation mark, and split
    var headers = arr[0].replace(/^"/,'').replace(/"$/,'').split('";"');

    for(var i = 1; i < arr.length; i++) {
        if(arr[i]) {
            // Strim start and end quotation mark, and split
            var data = arr[i].replace(/^"/,'').replace(/"$/,'').split('";"');
            var obj = {};
            
            for(var j = 0; j < data.length; j++) {
                obj[headers[j].trim()] = data[j].trim();
            }

            jsonObj.push(obj);
        }
    }

    return jsonObj;
}

function convertArrayOfObjectsToCSV(args) {
    var result, ctr, keys, columnDelimiter, lineDelimiter, data;

    data = args.data || null;
    if (data == null || !data.length) {
        return null;
    }

    columnDelimiter = args.columnDelimiter || ',';
    lineDelimiter = args.lineDelimiter || '\n';

    keys = Object.keys(data[0]);

    result = '';
    result += keys.join(columnDelimiter);
    result += lineDelimiter;

    data.forEach(function(item) {
        ctr = 0;
        keys.forEach(function(key) {
            if (ctr > 0) result += columnDelimiter;

            result += item[key];
            ctr++;
        });
        result += lineDelimiter;
    });

    return result;
}