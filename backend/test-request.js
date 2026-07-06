import request from 'request';

console.log('[TEST-REQUEST] Starting test using request library...');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

request('https://137.131.139.175:2087/ari/api-docs/resources.json', function(err, res, body) {
  if (err) {
    console.error('[TEST-REQUEST] Error:', err.message);
  } else {
    console.log('[TEST-REQUEST] Status Code:', res.statusCode);
    console.log('[TEST-REQUEST] Body Length:', body.length);
  }
  process.exit(0);
});

setTimeout(() => {
  console.error('[TEST-REQUEST] Timeout! The request library hung!');
  process.exit(1);
}, 6000);
