import swagger from 'swagger-client';
import client from 'ari-client';

console.log('[VERIFY] swagger object keys:', Object.keys(swagger));
console.log('[VERIFY] typeof SwaggerApi:', typeof swagger.SwaggerApi);

// Apply our patch
const originalBuildFrom1_1Spec = swagger.SwaggerApi.prototype.buildFrom1_1Spec;
swagger.SwaggerApi.prototype.buildFrom1_1Spec = function(response) {
  console.log('[VERIFY] Patch called!');
  return originalBuildFrom1_1Spec.call(this, response);
};

// Now check if client's require('swagger-client') prototype is also patched
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const swaggerCJS = require('swagger-client');

console.log('[VERIFY] Are prototype references identical?', 
  swagger.SwaggerApi.prototype.buildFrom1_1Spec === swaggerCJS.SwaggerApi.prototype.buildFrom1_1Spec
);

// Instantiate and test call
const api = new swaggerCJS.SwaggerApi();
try {
  api.buildFrom1_1Spec({ basePath: 'http://test' });
} catch (e) {
  // It might fail because api is not fully mock-initialized, but it should print "Patch called!" first
}
process.exit(0);
