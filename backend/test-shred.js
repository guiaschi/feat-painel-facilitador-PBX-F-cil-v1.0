import swagger from 'swagger-client';
import https from 'https';
import http from 'http';

// Apply the SwaggerHttp execute patch
swagger.SwaggerHttp.prototype.execute = function(obj) {
  const cb = obj.on;
  const requestUrl = obj.url;
  
  console.log(`[Swagger-Http-Patch] Intercepting request to ${obj.method.toUpperCase()} ${requestUrl}`);
  
  try {
    const parsedUrl = new URL(requestUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    const headers = {};
    if (obj.headers) {
      for (const [k, v] of Object.entries(obj.headers)) {
        headers[k.toLowerCase()] = v;
      }
    }
    
    const options = {
      method: obj.method.toUpperCase(),
      headers: headers,
      rejectUnauthorized: false // Bypass SSL
    };
    
    const req = httpModule.request(requestUrl, options, (res) => {
      let rawData = '';
      
      res.on('data', (chunk) => {
        rawData += chunk;
      });
      
      res.on('end', () => {
        let parsedObj = {};
        try {
          if (rawData) {
            parsedObj = JSON.parse(rawData);
          }
        } catch (e) {}
        
        const responseOut = {
          headers: res.headers,
          url: requestUrl,
          method: obj.method,
          status: res.statusCode,
          data: rawData,
          obj: parsedObj
        };
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (cb.response) cb.response(responseOut);
        } else {
          if (cb.error) cb.error(responseOut);
        }
      });
    });
    
    req.on('error', (err) => {
      console.error('[Swagger-Http-Patch] Connection error:', err.message);
      if (cb.error) {
        cb.error({
          status: 0,
          statusText: err.message,
          url: requestUrl,
          method: obj.method
        });
      }
    });
    
    if (obj.body) {
      req.write(typeof obj.body === 'string' ? obj.body : JSON.stringify(obj.body));
    }
    
    req.end();
  } catch (e) {
    console.error('[Swagger-Http-Patch] Setup error:', e.message);
    if (cb.error) cb.error({ status: 0, statusText: e.message, url: requestUrl, method: obj.method });
  }
};

const Shred = swagger.ShredHttpClient;

console.log('[TEST-SHRED] Initializing Shred client...');
const client = new Shred();

const ARI_HOST = process.env.ARI_HOST || 'SEU_HOST_ARI';
const ARI_PORT = process.env.ARI_PORT || '2087';
const ARI_USER = process.env.ARI_USER || '';
const ARI_PASS = process.env.ARI_PASS || '';

console.log('[TEST-SHRED] Executing request...');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const obj = {
  url: `https://${ARI_HOST}:${ARI_PORT}/ari/api-docs/resources.json`,
  method: 'get',
  headers: {
    'accept': 'application/json',
    'Authorization': 'Basic ' + Buffer.from(`${ARI_USER}:${ARI_PASS}`).toString('base64')
  },
  on: {
    error: function(err) {
      console.error('[TEST-SHRED] Error:', err);
      process.exit(1);
    },
    response: function(response) {
      console.log('[TEST-SHRED] Success! Status:', response.status);
      console.log('[TEST-SHRED] Data:', response.data);
      process.exit(0);
    }
  }
};

client.execute(obj);

setTimeout(() => {
  console.error('[TEST-SHRED] Timeout! Shred hung!');
  process.exit(1);
}, 6000);
