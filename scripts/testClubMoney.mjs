import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('src/utils/clubMoney.js','utf8').replace("import digits from '../../backend/utils/clubCurrencyDigits.json';", `const digits=${fs.readFileSync('backend/utils/clubCurrencyDigits.json','utf8')};`);
const {currencyScale,storedScale,amountUnits,formatClubMoney}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
for(const [currency,input,units,scale] of [['EUR','1.23',123,100],['RUB','123.45',12345,100],['JPY','123',123,1],['KWD','1.234',1234,1000]]) {
 assert.equal(currencyScale(currency),scale);assert.equal(amountUnits(input,currency),units);
 assert.equal(formatClubMoney(units,currency,scale,'en'),new Intl.NumberFormat('en',{style:'currency',currency}).format(Number(input)));
}
assert.equal(amountUnits('1.234','EUR'),null);assert.equal(amountUnits('1.2','JPY'),null);
assert.equal(storedScale({}),100);assert.equal(formatClubMoney(12345,'JPY',100,'en'),'¥123.45');
const currencies=JSON.parse(fs.readFileSync('backend/utils/clubCurrencies.json'));
for(const code of ['EUR','RUB','BYN','KZT','KGS','UZS','TJS','AMD','AZN','MDL','UAH','GEL','GBP','USD','CAD','AUD','NZD','INR','ZAR','SGD'])assert.ok(currencies.includes(code));
console.log('Currency precision, localized rendering, priority currencies and legacy values passed.');
