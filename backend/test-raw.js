import https from 'https';

const ARI_HOST = process.env.ARI_HOST || 'SEU_HOST_ARI';
const ARI_PORT = process.env.ARI_PORT || '2087';
const ARI_USER = process.env.ARI_USER || '';
const ARI_PASS = process.env.ARI_PASS || '';

console.log('[TEST-RAW] Starting raw HTTPS test to ARI server...');

const options = {
  hostname: ARI_HOST,
  port: ARI_PORT,
  path: '/ari/api-docs/resources.json',
  method: 'GET',
  rejectUnauthorized: false, // Bypass SSL validation
  headers: {
    'Authorization': 'Basic ' + Buffer.from(`${ARI_USER}:${ARI_PASS}`).toString('base64')
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
