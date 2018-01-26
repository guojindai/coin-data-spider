const fs = require('fs');
const path = require('path');
const requestRaw = require('request-promise');
const $ = require('cheerio');
const moment = require('moment');
const csvWriter = require('csv-write-stream')

const URL_ROOT = 'https://coinmarketcap.com';
const URL_ALL_COIN = `${URL_ROOT}/all/views/all/`;

const coinData = [];
let total = 0;
let done = 0;

const request = requestRaw.defaults({
  pool: { maxSockets: 1 }
});

function filteCoin(htmlStr) {
  const $root = $.load(htmlStr);
  $root('#currencies-all tbody tr').each((i, tr) => {
    const $tr = $(tr);
    if (parseInt($tr.find('.market-cap').attr('data-usd')) > 0) {
      const coinHref = $tr.find('.currency-name-container').attr('href');
      getDetail(coinHref);
      total += 1;
    }
  });
  printProgress();
}

function getDetail(href) {
  const url = `${URL_ROOT}${href}historical-data/?start=20130428&end=${moment().format('YYYYMMDD')}`;
  request(url).then((htmlStr) => {
    const $root = $.load(htmlStr);
    const $hisLastTr = $root('#historical-data tbody tr').last();
    const data = {
      name: $root('.bold.hidden-xs').text().replace(/[()]/g, ''),
      rank: parseInt($root('.label-success').text().replace(/rank/i, '')),
      vol24: new Number($($root('.coin-summary-item-detail').get(1))
        .find('[data-usd]').attr('data-usd')).valueOf(),
      cap: new Number($($root('.coin-summary-item-detail').get(0))
        .find('[data-usd]').attr('data-usd')).valueOf(),
      cirSupply: new Number($($root('.coin-summary-item-detail').get(2)).text().replace(/[^0-9]/g, '')).valueOf(),
      totalSupply: new Number($($root('.coin-summary-item-detail').get(3)).text().replace(/[^0-9]/g, '')).valueOf(),
      priceInit: parseFloat($($hisLastTr.find('td').get(4)).text()),
      priceNow: parseFloat($root('#quote_price').attr('data-usd')),
      listingDate: moment($($hisLastTr.find('td').get(0)).text(), 'MMM DD, YYYY')
        .format('YYYY-MM-DD'),
      website: $($root('.list-unstyled a').get(0)).attr('href')
    };
    data.vol24Cap = parseInt(data.vol24 * 100 / data.cap);
    data.cirSupplyTotalSupply = parseInt(data.cirSupply * 100 / data.totalSupply);
    data.priceNowPriceInit = Math.round(parseFloat(data.priceNow / data.priceInit) * 100) / 100;
    coinData.push(data);
    checkIfDone();
  }).catch((err) => {
    console.error(url, err);
  });
}

function checkIfDone() {
  done ++;
  printProgress();
  if (total === done) {
    coinData.sort((a, b) => a.rank - b.rank);
    const dataDir = path.resolve(__dirname, './output');
    if (!fs.existsSync(dataDir)){
      fs.mkdirSync(dataDir);
    }
    const csvFile = path.resolve(dataDir, `${moment().format('YYYY-MM-DD')}.csv`);
    const writer = csvWriter({
      headers: ['排名', '名称', '24交易量', '市值', '24交易/市值(%)', '初始价格', '当前价格', '当前/初始价格(倍)', '上市日期', '流通量', '总量', '流通/总量(%)', '网站']
    });
    writer.pipe(fs.createWriteStream(csvFile));
    coinData.forEach((data) => {
      writer.write([
        data.rank,
        data.name,
        data.vol24,
        data.cap,
        data.vol24Cap,
        data.priceInit,
        data.priceNow,
        data.priceNowPriceInit,
        data.listingDate,
        data.cirSupply,
        data.totalSupply,
        data.cirSupplyTotalSupply,
        data.website
      ]);
    });
    writer.end();
    console.log(`done: ${csvFile}`);
  }
}

function printProgress() {
  console.log(`progress: ${done} / ${total}`);
}

// filteCoin(fs.readFileSync(path.resolve(__dirname, 'mock.html')));

request(URL_ALL_COIN).then((resStr) => {
  filteCoin(resStr);
}).catch((err) => {
  console.error(err);
});
