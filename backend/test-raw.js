import https from 'https';

console.log('[TEST-RAW] Starting raw HTTPS test to upgrade server...');

const options = {
  hostname: '137.131.139.175',
  port: 2087,
  path: '/ari/api-docs/resources.json',
  method: 'GET',
  rejectUnauthorized: false, // Bypass SSL validation
  headers: {
    'Authorization': 'Basic ' + Buffer.from('disparoupchat:disparou123').toString('base64')
  },
  timeout: 5000 // 5 seconds timeout
};

const req = https.request(options, (res) => {
  console.log(`[TEST-RAW] Response Status: ${res.statusCode}`);
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('[TEST-RAW] Response Data:', data);
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.error('[TEST-RAW] Request Error:', err.message);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('[TEST-RAW] Request Timeout!');
  req.destroy();
  process.exit(1);
});

req.end();
