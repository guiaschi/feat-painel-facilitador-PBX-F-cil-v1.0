import fs from 'fs';

const html = fs.readFileSync('trunks_debug.html', 'utf8');

// Find all table tags and print their ids and classes
const matches = html.match(/<table[^>]*>/gi) || [];
console.log('Tables found:', matches.length);
matches.forEach((m, i) => {
  console.log(`Table ${i}:`, m);
});

// Let's count tr elements in each part of the HTML or look at table containers
const tablesHtml = html.split(/<table/gi);
tablesHtml.slice(1).forEach((tHtml, idx) => {
  const trs = tHtml.split(/<tr/gi).length - 1;
  console.log(`Table ${idx} TR count:`, trs);
});
