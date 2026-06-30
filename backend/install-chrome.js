import { install } from '@puppeteer/browsers';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForFile(filePath, timeoutMs = 60000) {
  console.log(`[Custom Install] Waiting for file: ${filePath}`);
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (existsSync(filePath)) {
      console.log(`[Custom Install] File detected: ${filePath}`);
      return true;
    }
    await delay(1000);
  }
  throw new Error(`Timeout waiting for file: ${filePath}`);
}

async function run() {
  const cacheDir = join(homedir(), '.cache', 'puppeteer');
  const buildId = '127.0.6533.88';

  console.log(`[Custom Install] Cache Dir: ${cacheDir}`);
  console.log(`[Custom Install] Version target: ${buildId}`);

  // Download Chrome
  console.log('[Custom Install] Downloading Chrome...');
  const installedChrome = await install({
    browser: 'chrome',
    buildId,
    cacheDir,
    unpack: true,
  });
  console.log(`[Custom Install] Chrome download promise resolved. Executable path should be: ${installedChrome.executablePath}`);
  
  // Wait until Chrome executable actually exists on disk
  await waitForFile(installedChrome.executablePath, 120000);
  console.log('[Custom Install] Chrome extraction verified!');

  // Download Chrome Headless Shell
  console.log('[Custom Install] Downloading Chrome Headless Shell...');
  const installedShell = await install({
    browser: 'chrome-headless-shell',
    buildId,
    cacheDir,
    unpack: true,
  });
  console.log(`[Custom Install] Chrome Headless Shell promise resolved. Executable path should be: ${installedShell.executablePath}`);

  // Wait until Headless Shell executable actually exists on disk
  await waitForFile(installedShell.executablePath, 120000);
  console.log('[Custom Install] Chrome Headless Shell extraction verified!');

  console.log('[Custom Install] Puppeteer browser environment setup completed successfully!');
}

run().catch(err => {
  console.error('[Custom Install] Installation failed:', err);
  process.exit(1);
});
