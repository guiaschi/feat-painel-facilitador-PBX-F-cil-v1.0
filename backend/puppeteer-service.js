import puppeteer from 'puppeteer';
import fs from 'fs';
import dns from 'dns';
import path from 'path';

// Helper to launch browser with common arguments
async function getBrowser() {
  return await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--ignore-certificate-errors'
    ]
  });
}

// Helper to create page with jQuery cookie patch
async function createNewPage(browser, cookies = null) {
  const page = await browser.newPage();
  
  // Set standard desktop User-Agent to bypass security/headless filters
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  // Inject full working jQuery cookie polyfill to prevent page crashes and support cookie logic
  await page.evaluateOnNewDocument(() => {
    let jq;
    const patchJQuery = (val) => {
      jq = val;
      if (jq) {
        if (!jq.cookie) {
          jq.cookie = function(name, value, options) {
            if (typeof value !== 'undefined') {
              let updatedCookie = encodeURIComponent(name) + "=" + encodeURIComponent(value);
              if (options) {
                if (options.expires) {
                  let d = new Date();
                  d.setTime(d.getTime() + (options.expires * 24 * 60 * 60 * 1000));
                  updatedCookie += "; expires=" + d.toUTCString();
                }
                if (options.path) updatedCookie += "; path=" + options.path;
                if (options.domain) updatedCookie += "; domain=" + options.domain;
              }
              document.cookie = updatedCookie;
            } else {
              let nameEQ = encodeURIComponent(name) + "=";
              let ca = document.cookie.split(';');
              for (let i = 0; i < ca.length; i++) {
                let c = ca[i];
                while (c.charAt(0) === ' ') c = c.substring(1, c.length);
                if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
              }
              return null;
            }
          };
        }
        if (!jq.removeCookie) {
          jq.removeCookie = function(name, options) {
            const opts = Object.assign({}, options, { expires: -1 });
            jq.cookie(name, '', opts);
          };
        }
      }
    };
    Object.defineProperty(window, '$', {
      get() { return jq; },
      set(val) { patchJQuery(val); },
      configurable: true
    });
    Object.defineProperty(window, 'jQuery', {
      get() { return jq; },
      set(val) { patchJQuery(val); },
      configurable: true
    });
  });

  if (cookies) {
    await page.setCookie(...cookies);
  }
  return page;
}

// Custom error for PBX issues
class PBXError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Validates and logs in to the PBX instance
 */
export async function loginToPBX(instance, username, password) {
  if (instance.toLowerCase() === 'mock') {
    return {
      cookies: [{ name: 'mock_session', value: '12345', domain: 'mock' }],
      user: username
    };
  }

  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser);

    const url = `https://${instance}.pbxfacil.com.br/admin/config.php`;
    
    // Block AJAX requests that cause 401 responses and page reload loops during login
    let blockAjax = true;
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (!blockAjax) {
        req.continue();
        return;
      }
      const reqUrl = req.url();
      if (reqUrl.includes('ajax.php') || reqUrl.includes('manager.php') || 
          reqUrl.includes('google-analytics') || reqUrl.includes('googletagmanager') ||
          reqUrl.includes('/g/collect')) {
        req.abort();
      } else {
        req.continue();
      }
    });

    console.log(`[Puppeteer] Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Check if we need to log in
    const isLoginPage = await page.evaluate(() => {
      return !!document.querySelector('input[name="username"]') || 
             !!document.querySelector('#login_admin');
    });

    if (isLoginPage) {
      console.log('[Puppeteer] Login screen detected.');
      
      // Wait for the username input to actually exist in DOM (proves page is stable)
      await page.waitForSelector('input[name="username"]', { timeout: 10000 });
      console.log('[Puppeteer] Username field found. Filling credentials and submitting...');
      
      // Fill credentials AND submit in one atomic evaluate to avoid context destruction
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
        page.evaluate((user, pass) => {
          const userEl = document.querySelector('input[name="username"]');
          const passEl = document.querySelector('input[name="password"]');
          
          if (userEl) userEl.value = user;
          if (passEl) passEl.value = pass;
          
          const form = document.querySelector('#loginform');
          if (form) form.submit();
        }, username, password)
      ]);
      
      console.log('[Puppeteer] Form submitted. Current URL:', page.url());
    }

    // Stop blocking AJAX after login
    blockAjax = false;

    // Verify if we are logged in successfully
    const isLoggedIn = await page.evaluate(() => {
      // If we see the logout link or if the admin selection button is GONE, we are logged in!
      const hasAdminBtn = !!document.querySelector('#login_admin');
      const hasLogout = !!document.querySelector('a[href*="logout"]');
      
      const hasError = !!document.querySelector('.alert-danger') || 
                        !!document.querySelector('.alert-error') || 
                        document.body.innerText.includes('Invalid') ||
                        document.body.innerText.includes('Incorreto') ||
                        document.body.innerText.includes('Falha');
      return (!hasAdminBtn || hasLogout) && !hasError;
    });

    if (!isLoggedIn) {
      throw new PBXError('Credenciais inválidas ou falha no login da instância do PBX.');
    }

    console.log('[Puppeteer] Login successful. Retrieving cookies.');
    const cookies = await page.cookies();
    return { cookies, user: username };

  } catch (error) {
    console.error('[Puppeteer] Login error:', error);
    if (page) {
      try {
        await page.screenshot({ path: 'c:/Users/GuiAschi/Desktop/Pabx2.0/login_error.png', fullPage: true });
        console.log('[Puppeteer] Saved login error screenshot to: c:/Users/GuiAschi/Desktop/Pabx2.0/login_error.png');
        
        const pageSource = await page.content();
        fs.writeFileSync('c:/Users/GuiAschi/Desktop/Pabx2.0/login_error.html', pageSource, 'utf-8');
        console.log('[Puppeteer] Saved login error HTML to: c:/Users/GuiAschi/Desktop/Pabx2.0/login_error.html');
      } catch (e) {
        console.error('[Puppeteer] Failed to save login error diagnostics:', e);
      }
    }
    if (error instanceof PBXError) throw error;
    throw new PBXError(`Erro ao conectar com a instância do PBX: ${error.message}`);
  } finally {
    await browser.close();
  }
}

/**
 * Lists extensions from the PBX interface
 */
export async function getExtensions(instance, cookies) {
  if (instance.toLowerCase() === 'mock') {
    // Return mock extensions stored in memory (we'll implement memory mock storage in index.js)
    return null; 
  }

  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);

    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=extensions`;
    console.log(`[Puppeteer] Navigating to extensions list: ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for bootstrap-table to load data into #table-all
    // The table uses AJAX to populate rows, so wait for actual data rows
    await page.waitForFunction(() => {
      const table = document.querySelector('#table-all');
      if (!table) return false;
      const dataRows = table.querySelectorAll('tbody tr[data-index]');
      return dataRows.length > 0;
    }, { timeout: 15000 }).catch(() => {
      console.log('[Puppeteer] Timeout waiting for bootstrap-table data rows. Trying fallback...');
    });

    // Try to increase bootstrapTable page size to load all records at once
    console.log('[Puppeteer] Increasing bootstrapTable page size to 9999 to fetch all extensions...');
    await page.evaluate(() => {
      try {
        if (window.jQuery && window.jQuery('#table-all').bootstrapTable) {
          window.jQuery('#table-all').bootstrapTable('refreshOptions', { pageSize: 9999 });
        }
      } catch (e) {
        console.error('Error setting pageSize to 9999:', e);
      }
    });

    // Wait a brief moment for the table to reload/re-render
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Extract extensions data from bootstrap-table
    const list = await page.evaluate(() => {
      // Try #table-all first (the "All" tab in FreePBX extensions)
      const table = document.querySelector('#table-all') || document.querySelector('table.ext-list');
      if (!table) return [];
      
      const rows = Array.from(table.querySelectorAll('tbody tr[data-index]'));
      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length < 2) return null;

        // bootstrap-table cells: checkbox, extension, name, ...
        // Skip the first cell if it's a checkbox
        let startIdx = 0;
        const firstCell = cells[0];
        if (firstCell && firstCell.querySelector('input[type="checkbox"]')) {
          startIdx = 1;
        }

        const extText = cells[startIdx]?.innerText?.trim() || '';
        const nameText = cells[startIdx + 1]?.innerText?.trim() || '';

        // Check if there is an edit link
        const link = row.querySelector('a[href*="extdisplay="]');
        let extId = extText;
        if (link) {
          const href = link.getAttribute('href');
          const match = href.match(/extdisplay=([^&]+)/);
          if (match) extId = match[1];
        }

        if (!extText || isNaN(parseInt(extText))) return null;

        return {
          extension: extText,
          id: extId,
          name: nameText,
          tech: 'PJSIP'
        };
      }).filter(Boolean);
    });

    console.log(`[Puppeteer] Extracted ${list.length} extensions.`);
    
    // Debug: if 0 extensions found, save diagnostic screenshot
    if (list.length === 0) {
      try {
        await page.screenshot({ path: 'c:/Users/GuiAschi/Desktop/Pabx2.0/extensions_debug.png', fullPage: true });
        console.log('[Puppeteer] Extensions debug screenshot saved.');
        
        const domInfo = await page.evaluate(() => {
          const tables = Array.from(document.querySelectorAll('table')).map(t => ({
            id: t.id, className: t.className,
            rows: t.querySelectorAll('tr').length,
            firstRowHTML: t.querySelector('tr')?.innerHTML?.substring(0, 200) || ''
          }));
          const allTbodyRows = document.querySelectorAll('table tbody tr').length;
          const pageTitle = document.title;
          const currentUrl = window.location.href;
          const hasLoginForm = !!document.querySelector('#login_admin');
          return { tables, allTbodyRows, pageTitle, currentUrl, hasLoginForm };
        });
        console.log('[Puppeteer] Extensions page DOM info:', JSON.stringify(domInfo, null, 2));
      } catch (e) {
        console.log('[Puppeteer] Failed to save debug info:', e.message);
      }
    }
    
    return list;

  } catch (error) {
    console.error('[Puppeteer] Error listing extensions:', error);
    if (page) {
      try {
        await page.screenshot({ path: 'c:/Users/GuiAschi/Desktop/Pabx2.0/error_get_extensions.png', fullPage: true });
        console.log('[Puppeteer] Error screenshot saved to: c:/Users/GuiAschi/Desktop/Pabx2.0/error_get_extensions.png');
        
        const pageSource = await page.content();
        fs.writeFileSync('c:/Users/GuiAschi/Desktop/Pabx2.0/error_get_extensions.html', pageSource, 'utf-8');
        console.log('[Puppeteer] Full HTML source saved to: c:/Users/GuiAschi/Desktop/Pabx2.0/error_get_extensions.html');

        // Log DOM details
        const domDetails = await page.evaluate(() => {
          const tables = Array.from(document.querySelectorAll('table')).map(t => ({
            id: t.id,
            className: t.className,
            rows: t.querySelectorAll('tr').length
          }));
          const forms = Array.from(document.querySelectorAll('form')).map(f => ({
            id: f.id,
            className: f.className
          }));
          const divs = Array.from(document.querySelectorAll('div')).slice(0, 10).map(d => ({
            id: d.id,
            className: d.className
          }));
          return {
            title: document.title,
            url: window.location.href,
            tables,
            forms,
            firstDivs: divs
          };
        });

        console.log('[Puppeteer] Error diagnostics:', JSON.stringify(domDetails, null, 2));
      } catch (e) {
        console.error('[Puppeteer] Failed to run diagnostics:', e);
      }
    }
    throw new PBXError(`Erro ao listar ramais: ${error.message}`);
  } finally {
    await browser.close();
  }
}

/**
 * Creates a new extension (Softphone or Webphone)
 */
export async function createExtension(instance, cookies, data) {
  const { extension, name, secret, type } = data; // type: 'Softphone' | 'Webphone'

  if (instance.toLowerCase() === 'mock') {
    return { success: true, extension, name, type };
  }

  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);

    // Navigate directly to the PJSIP extension creation page
    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=extensions&tech_hardware=pjsip_generic`;
    console.log(`[Puppeteer] Navigating to create extension: ${url}`);
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for extension form inputs to be ready in the DOM
    console.log('[Puppeteer] Waiting for extension input fields...');
    await page.waitForSelector('input[name="extension"], input#extension', { timeout: 15000 });
    await page.waitForSelector('input[name="name"], input#name', { timeout: 10000 });
    await page.waitForSelector('input[name="devinfo_secret"], input#devinfo_secret', { timeout: 10000 });

    // Fill in General details programmatically to avoid click/visibility errors
    console.log(`[Puppeteer] Programmatically filling general details (Ext: ${extension}, Name: ${name})`);
    
    const fillResult = await page.evaluate((ext, displayName, devSecret) => {
      try {
        const extEl = document.querySelector('input[name="extension"], input#extension');
        const nameEl = document.querySelector('input[name="name"], input#name');
        const secretEl = document.querySelector('input[name="devinfo_secret"], input#devinfo_secret');
        
        if (!extEl || !nameEl || !secretEl) {
          return { success: false, error: 'One or more extension fields not found in the DOM' };
        }
        
        // Fill extension
        extEl.value = ext;
        extEl.dispatchEvent(new Event('input', { bubbles: true }));
        extEl.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Fill name
        nameEl.value = displayName;
        nameEl.dispatchEvent(new Event('input', { bubbles: true }));
        nameEl.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Fill secret
        secretEl.value = devSecret;
        secretEl.dispatchEvent(new Event('input', { bubbles: true }));
        secretEl.dispatchEvent(new Event('change', { bubbles: true }));
        
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }, extension, name, secret);

    if (!fillResult.success) {
      throw new Error(`Falha ao preencher campos do ramal: ${fillResult.error}`);
    }

    // If Webphone, switch to Advanced tab and apply WebRTC settings
    if (type === 'Webphone') {
      console.log('[Puppeteer] Configuring WebRTC settings in Advanced tab to mirror extension 5002...');
      
      // Click Advanced tab visually just in case
      await page.evaluate(() => {
        const advancedTab = Array.from(document.querySelectorAll('a[data-toggle="tab"], a[role="tab"]'))
          .find(a => a.getAttribute('href') === '#advanced' || 
                      a.innerText.toLowerCase().includes('advanced') || 
                      a.innerText.toLowerCase().includes('avançado'));
        if (advancedTab) advancedTab.click();
      });

      // Wait a short bit for visual safety
      await new Promise(resolve => setTimeout(resolve, 500));

      const webrtcConfigResult = await page.evaluate(() => {
        try {
          const setSelectValue = (name, value) => {
            const el = document.querySelector(`select[name="${name}"]`);
            if (el) {
              el.value = value;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            return false;
          };

          const checkRadioValue = (name, value) => {
            const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
            if (el) {
              el.checked = true;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            return false;
          };

          const setInputValue = (name, value) => {
            const el = document.querySelector(`input[name="${name}"]`);
            if (el) {
              el.value = value;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            return false;
          };

          const results = {};
          
          // 1. Transport: 0.0.0.0-wss
          results.transport = setSelectValue('devinfo_transport', '0.0.0.0-wss');
          
          // 2. AVPF: yes
          results.avpf = checkRadioValue('devinfo_avpf', 'yes');
          
          // 3. ICE Support: yes
          results.icesupport = checkRadioValue('devinfo_icesupport', 'yes');
          
          // 4. RTCP Mux: yes
          results.rtcp_mux = checkRadioValue('devinfo_rtcp_mux', 'yes');
          
          // 5. Media Encryption: dtls
          results.media_encryption = setSelectValue('devinfo_media_encryption', 'dtls');
          
          // 6. DTLS Enable: yes
          results.dtls_enable = checkRadioValue('dtls_enable', 'yes');
          
          // 7. DTLS Auto Generate Cert: 1 (Yes)
          results.dtls_auto_generate_cert = checkRadioValue('dtls_auto_generate_cert', '1');
          
          // 8. DTLS Use Certificate: 1
          results.dtls_certificate = setSelectValue('dtls_certificate', '1');
          
          // 9. DTLS Verify: fingerprint
          results.dtls_verify = setSelectValue('dtls_verify', 'fingerprint');
          
          // 10. DTLS Setup: actpass
          results.dtls_setup = setSelectValue('dtls_setup', 'actpass');

          // --- USER REQUESTED DETAILS ---
          
          // 11. Enable WebRTC defaults: YES (devinfo_bundle)
          results.devinfo_bundle = checkRadioValue('devinfo_bundle', 'yes');

          // 12. Qualify Frequency: 5
          results.devinfo_qualifyfreq = setInputValue('devinfo_qualifyfreq', '5');

          // 13. Direct Media: NO
          results.devinfo_direct_media = checkRadioValue('devinfo_direct_media', 'no');

          // 14. Refer Blind Progress: NO
          results.devinfo_refer_blind_progress = checkRadioValue('devinfo_refer_blind_progress', 'no');

          // 15. Recording inbound external: yes (instead of dontcare)
          results.recording_in_external = checkRadioValue('recording_in_external', 'recording_in_external=yes');

          // 16. Recording outbound external: yes (instead of dontcare)
          results.recording_out_external = checkRadioValue('recording_out_external', 'recording_out_external=yes');

          // 17. Recording inbound internal: yes (instead of dontcare)
          results.recording_in_internal = checkRadioValue('recording_in_internal', 'recording_in_internal=yes');

          // 18. Recording outbound internal: yes (instead of dontcare)
          results.recording_out_internal = checkRadioValue('recording_out_internal', 'recording_out_internal=yes');

          return { success: true, results };
        } catch (e) {
          return { success: false, error: e.message };
        }
      });

      console.log('[Puppeteer] WebRTC configuration results:', JSON.stringify(webrtcConfigResult));
    }

    // If Softphone, switch to Advanced tab and apply SIP settings mirroring extension 5000
    if (type === 'Softphone') {
      console.log('[Puppeteer] Configuring SIP settings in Advanced tab to mirror extension 5000...');
      
      // Click Advanced tab visually just in case
      await page.evaluate(() => {
        const advancedTab = Array.from(document.querySelectorAll('a[data-toggle="tab"], a[role="tab"]'))
          .find(a => a.getAttribute('href') === '#advanced' || 
                      a.innerText.toLowerCase().includes('advanced') || 
                      a.innerText.toLowerCase().includes('avançado'));
        if (advancedTab) advancedTab.click();
      });

      // Wait a short bit for visual safety
      await new Promise(resolve => setTimeout(resolve, 500));

      const sipConfigResult = await page.evaluate(() => {
        try {
          const setSelectValue = (name, value) => {
            const el = document.querySelector(`select[name="${name}"]`);
            if (el) {
              el.value = value;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            return false;
          };

          const checkRadioValue = (name, value) => {
            const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
            if (el) {
              el.checked = true;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            return false;
          };

          const setInputValue = (name, value) => {
            const el = document.querySelector(`input[name="${name}"]`);
            if (el) {
              el.value = value;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            return false;
          };

          const results = {};
          
          // 1. Transport: 0.0.0.0-udp
          results.transport = setSelectValue('devinfo_transport', '0.0.0.0-udp');
          
          // 2. AVPF: no
          results.avpf = checkRadioValue('devinfo_avpf', 'no');
          
          // 3. ICE Support: no
          results.icesupport = checkRadioValue('devinfo_icesupport', 'no');
          
          // 4. RTCP Mux: no
          results.rtcp_mux = checkRadioValue('devinfo_rtcp_mux', 'no');
          
          // 5. Media Encryption: no
          results.media_encryption = setSelectValue('devinfo_media_encryption', 'no');
          
          // 6. DTLS Enable: no
          results.dtls_enable = checkRadioValue('dtls_enable', 'no');
          
          // 7. DTLS Auto Generate Cert: 0 (No)
          results.dtls_auto_generate_cert = checkRadioValue('dtls_auto_generate_cert', '0');
          
          // 8. Enable WebRTC defaults: no (devinfo_bundle)
          results.devinfo_bundle = checkRadioValue('devinfo_bundle', 'no');

          // 9. Qualify Frequency: 10
          results.devinfo_qualifyfreq = setInputValue('devinfo_qualifyfreq', '10');

          // 10. Direct Media: no
          results.devinfo_direct_media = checkRadioValue('devinfo_direct_media', 'no');

          // 11. Refer Blind Progress: yes
          results.devinfo_refer_blind_progress = checkRadioValue('devinfo_refer_blind_progress', 'yes');

          // 12. Recording inbound external: yes
          results.recording_in_external = checkRadioValue('recording_in_external', 'recording_in_external=yes');

          // 13. Recording outbound external: yes
          results.recording_out_external = checkRadioValue('recording_out_external', 'recording_out_external=yes');

          // 14. Recording inbound internal: yes
          results.recording_in_internal = checkRadioValue('recording_in_internal', 'recording_in_internal=yes');

          // 15. Recording outbound internal: yes
          results.recording_out_internal = checkRadioValue('recording_out_internal', 'recording_out_internal=yes');

          return { success: true, results };
        } catch (e) {
          return { success: false, error: e.message };
        }
      });

      console.log('[Puppeteer] Softphone SIP configuration results:', JSON.stringify(sipConfigResult));
    }

    // Submit form
    console.log('[Puppeteer] Submitting the extension creation form...');
    const submitSelector = 'input[type="submit"], button[type="submit"], #submit, button[name="submit"]';
    await page.click(submitSelector);

    // Wait for the save operation and redirect
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 });
    console.log('[Puppeteer] Form submitted successfully.');

    // Apply Config
    await applyPBXConfiguration(page);

    return { success: true };

  } catch (error) {
    console.error('[Puppeteer] Error creating extension:', error);
    if (page) {
      try {
        await page.screenshot({ path: 'c:/Users/GuiAschi/Desktop/Pabx2.0/error_create_extension.png', fullPage: true });
        console.log('[Puppeteer] Saved create extension error screenshot to: c:/Users/GuiAschi/Desktop/Pabx2.0/error_create_extension.png');
        
        const pageSource = await page.content();
        fs.writeFileSync('c:/Users/GuiAschi/Desktop/Pabx2.0/error_create_extension.html', pageSource, 'utf-8');
        console.log('[Puppeteer] Saved create extension error HTML to: c:/Users/GuiAschi/Desktop/Pabx2.0/error_create_extension.html');
      } catch (e) {
        console.error('[Puppeteer] Failed to save create extension diagnostics:', e);
      }
    }
    throw new PBXError(`Erro ao criar ramal: ${error.message}`);
  } finally {
    await browser.close();
  }
}

/**
 * Edits an existing extension configurations
 */
export async function editExtension(instance, cookies, data) {
  const { extension, name, secret, type } = data; // type: 'Softphone' | 'Webphone'

  if (instance.toLowerCase() === 'mock') {
    return { success: true, extension, name, type };
  }

  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);

    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=extensions&extdisplay=${extension}`;
    console.log(`[Puppeteer] Navigating to edit extension: ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for the form fields
    await page.waitForSelector('input[name="name"], #name', { timeout: 15000 });

    // Programmatically fill name and secret using DOM properties to bypass issues
    const fillResult = await page.evaluate((ext, nm, sec) => {
      try {
        const nameEl = document.querySelector('input[name="name"]') || document.querySelector('#name');
        const secretEl = document.querySelector('input[name="devinfo_secret"]') || document.querySelector('#devinfo_secret');

        if (!nameEl || !secretEl) {
          return { success: false, error: 'Display Name or Secret fields not found' };
        }

        // Set name
        nameEl.value = nm;
        nameEl.dispatchEvent(new Event('input', { bubbles: true }));
        nameEl.dispatchEvent(new Event('change', { bubbles: true }));

        // Set secret
        secretEl.value = sec;
        secretEl.dispatchEvent(new Event('input', { bubbles: true }));
        secretEl.dispatchEvent(new Event('change', { bubbles: true }));
        
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }, extension, name, secret);

    if (!fillResult.success) {
      throw new Error(`Falha ao preencher campos do ramal: ${fillResult.error}`);
    }

    // If Webphone, switch to Advanced tab and apply WebRTC settings
    if (type === 'Webphone') {
      console.log('[Puppeteer] Configuring WebRTC settings in Advanced tab to mirror extension 5002...');
      
      // Click Advanced tab visually just in case
      await page.evaluate(() => {
        const advancedTab = Array.from(document.querySelectorAll('a[data-toggle="tab"], a[role="tab"]'))
          .find(a => a.getAttribute('href') === '#advanced' || 
                      a.innerText.toLowerCase().includes('advanced') || 
                      a.innerText.toLowerCase().includes('avançado'));
        if (advancedTab) advancedTab.click();
      });

      // Wait a short bit for visual safety
      await new Promise(resolve => setTimeout(resolve, 500));

      const webrtcConfigResult = await page.evaluate(() => {
        try {
          const setSelectValue = (name, value) => {
            const el = document.querySelector(`select[name="${name}"]`);
            if (el) {
              el.value = value;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            return false;
          };

          const checkRadioValue = (name, value) => {
            const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
            if (el) {
              el.checked = true;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            return false;
          };

          const setInputValue = (name, value) => {
            const el = document.querySelector(`input[name="${name}"]`);
            if (el) {
              el.value = value;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            return false;
          };

          const results = {};
          
          // 1. Transport: 0.0.0.0-wss
          results.transport = setSelectValue('devinfo_transport', '0.0.0.0-wss');
          
          // 2. AVPF: yes
          results.avpf = checkRadioValue('devinfo_avpf', 'yes');
          
          // 3. ICE Support: yes
          results.icesupport = checkRadioValue('devinfo_icesupport', 'yes');
          
          // 4. RTCP Mux: yes
          results.rtcp_mux = checkRadioValue('devinfo_rtcp_mux', 'yes');
          
          // 5. Media Encryption: dtls
          results.media_encryption = setSelectValue('devinfo_media_encryption', 'dtls');
          
          // 6. DTLS Enable: yes
          results.dtls_enable = checkRadioValue('dtls_enable', 'yes');
          
          // 7. DTLS Auto Generate Cert: 1 (Yes)
          results.dtls_auto_generate_cert = checkRadioValue('dtls_auto_generate_cert', '1');
          
          // 8. DTLS Use Certificate: 1
          results.dtls_certificate = setSelectValue('dtls_certificate', '1');
          
          // 9. DTLS Verify: fingerprint
          results.dtls_verify = setSelectValue('dtls_verify', 'fingerprint');
          
          // 10. DTLS Setup: actpass
          results.dtls_setup = setSelectValue('dtls_setup', 'actpass');

          // --- USER REQUESTED DETAILS ---
          
          // 11. Enable WebRTC defaults: YES (devinfo_bundle)
          results.devinfo_bundle = checkRadioValue('devinfo_bundle', 'yes');

          // 12. Qualify Frequency: 5
          results.devinfo_qualifyfreq = setInputValue('devinfo_qualifyfreq', '5');

          // 13. Direct Media: NO
          results.devinfo_direct_media = checkRadioValue('devinfo_direct_media', 'no');

          // 14. Refer Blind Progress: NO
          results.devinfo_refer_blind_progress = checkRadioValue('devinfo_refer_blind_progress', 'no');

          // 15. Recording inbound external: yes
          results.recording_in_external = checkRadioValue('recording_in_external', 'recording_in_external=yes');

          // 16. Recording outbound external: yes
          results.recording_out_external = checkRadioValue('recording_out_external', 'recording_out_external=yes');

          // 17. Recording inbound internal: yes
          results.recording_in_internal = checkRadioValue('recording_in_internal', 'recording_in_internal=yes');

          // 18. Recording outbound internal: yes
          results.recording_out_internal = checkRadioValue('recording_out_internal', 'recording_out_internal=yes');

          return { success: true, results };
        } catch (e) {
          return { success: false, error: e.message };
        }
      });

      console.log('[Puppeteer] WebRTC configuration results:', JSON.stringify(webrtcConfigResult));
    }

    // If Softphone, switch to Advanced tab and apply SIP settings mirroring extension 5000
    if (type === 'Softphone') {
      console.log('[Puppeteer] Configuring SIP settings in Advanced tab to mirror extension 5000...');
      
      // Click Advanced tab visually just in case
      await page.evaluate(() => {
        const advancedTab = Array.from(document.querySelectorAll('a[data-toggle="tab"], a[role="tab"]'))
          .find(a => a.getAttribute('href') === '#advanced' || 
                      a.innerText.toLowerCase().includes('advanced') || 
                      a.innerText.toLowerCase().includes('avançado'));
        if (advancedTab) advancedTab.click();
      });

      // Wait a short bit for visual safety
      await new Promise(resolve => setTimeout(resolve, 500));

      const sipConfigResult = await page.evaluate(() => {
        try {
          const setSelectValue = (name, value) => {
            const el = document.querySelector(`select[name="${name}"]`);
            if (el) {
              el.value = value;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            return false;
          };

          const checkRadioValue = (name, value) => {
            const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
            if (el) {
              el.checked = true;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            return false;
          };

          const setInputValue = (name, value) => {
            const el = document.querySelector(`input[name="${name}"]`);
            if (el) {
              el.value = value;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            return false;
          };

          const results = {};
          
          // 1. Transport: 0.0.0.0-udp
          results.transport = setSelectValue('devinfo_transport', '0.0.0.0-udp');
          
          // 2. AVPF: no
          results.avpf = checkRadioValue('devinfo_avpf', 'no');
          
          // 3. ICE Support: no
          results.icesupport = checkRadioValue('devinfo_icesupport', 'no');
          
          // 4. RTCP Mux: no
          results.rtcp_mux = checkRadioValue('devinfo_rtcp_mux', 'no');
          
          // 5. Media Encryption: no
          results.media_encryption = setSelectValue('devinfo_media_encryption', 'no');
          
          // 6. DTLS Enable: no
          results.dtls_enable = checkRadioValue('dtls_enable', 'no');
          
          // 7. DTLS Auto Generate Cert: 0 (No)
          results.dtls_auto_generate_cert = checkRadioValue('dtls_auto_generate_cert', '0');
          
          // 8. Enable WebRTC defaults: no (devinfo_bundle)
          results.devinfo_bundle = checkRadioValue('devinfo_bundle', 'no');

          // 9. Qualify Frequency: 10
          results.devinfo_qualifyfreq = setInputValue('devinfo_qualifyfreq', '10');

          // 10. Direct Media: no
          results.devinfo_direct_media = checkRadioValue('devinfo_direct_media', 'no');

          // 11. Refer Blind Progress: yes
          results.devinfo_refer_blind_progress = checkRadioValue('devinfo_refer_blind_progress', 'yes');

          // 12. Recording inbound external: yes
          results.recording_in_external = checkRadioValue('recording_in_external', 'recording_in_external=yes');

          // 13. Recording outbound external: yes
          results.recording_out_external = checkRadioValue('recording_out_external', 'recording_out_external=yes');

          // 14. Recording inbound internal: yes
          results.recording_in_internal = checkRadioValue('recording_in_internal', 'recording_in_internal=yes');

          // 15. Recording outbound internal: yes
          results.recording_out_internal = checkRadioValue('recording_out_internal', 'recording_out_internal=yes');

          return { success: true, results };
        } catch (e) {
          return { success: false, error: e.message };
        }
      });

      console.log('[Puppeteer] Softphone SIP configuration results:', JSON.stringify(sipConfigResult));
    }

    // Submit form
    console.log('[Puppeteer] Submitting the extension edit form...');
    const submitSelector = 'input[type="submit"], button[type="submit"], #submit, button[name="submit"]';
    await page.click(submitSelector);

    // Wait for the save operation and redirect
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 });
    console.log('[Puppeteer] Extension edit form submitted successfully.');

    // Apply Config
    await applyPBXConfiguration(page);

    return { success: true };

  } catch (error) {
    console.error('[Puppeteer] Error editing extension:', error);
    if (page) {
      try {
        await page.screenshot({ path: 'c:/Users/GuiAschi/Desktop/Pabx2.0/error_edit_extension.png', fullPage: true });
      } catch (e) {}
    }
    throw new Error(`Erro ao editar ramal: ${error.message}`);
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

/**
 * Deletes an extension
 */
export async function deleteExtension(instance, cookies, extensionId) {
  if (instance.toLowerCase() === 'mock') {
    return { success: true, extensionId };
  }

  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);

    // Listen to confirmation dialogs and accept automatically
    page.on('dialog', async dialog => {
      console.log(`[Puppeteer] Auto-accepting dialog: ${dialog.message()}`);
      await dialog.accept();
    });

    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=extensions&extdisplay=${extensionId}`;
    console.log(`[Puppeteer] Navigating to edit page to delete extension: ${url}`);
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for the delete button
    console.log('[Puppeteer] Looking for Delete button...');
    const deleteBtnSelector = '#delbtn, [name="delete"], .btn-danger[value="Delete"], .btn-danger[value="Excluir"]';
    await page.waitForSelector(deleteBtnSelector, { timeout: 15000 });

    // Click Delete and wait for navigation in parallel to avoid race conditions
    console.log('[Puppeteer] Clicking delete button and waiting for navigation...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {
        console.log('[Puppeteer] Navigation warning: no standard navigation detected, proceeding.');
      }),
      page.click(deleteBtnSelector)
    ]);
    console.log('[Puppeteer] Deletion completed.');

    // Apply Config
    await applyPBXConfiguration(page);

    return { success: true };

  } catch (error) {
    console.error('[Puppeteer] Error deleting extension:', error);
    if (page) {
      try {
        await page.screenshot({ path: 'c:/Users/GuiAschi/Desktop/Pabx2.0/error_delete_extension.png', fullPage: true });
        console.log('[Puppeteer] Saved delete extension error screenshot to: c:/Users/GuiAschi/Desktop/Pabx2.0/error_delete_extension.png');
        
        const pageSource = await page.content();
        fs.writeFileSync('c:/Users/GuiAschi/Desktop/Pabx2.0/error_delete_extension.html', pageSource, 'utf-8');
        console.log('[Puppeteer] Saved delete extension error HTML to: c:/Users/GuiAschi/Desktop/Pabx2.0/error_delete_extension.html');
      } catch (e) {
        console.error('[Puppeteer] Failed to save delete extension diagnostics:', e);
      }
    }
    throw new PBXError(`Erro ao excluir ramal: ${error.message}`);
  } finally {
    await browser.close();
  }
}

/**
 * Helper to click "Apply Config" at the top of FreePBX
 */
async function applyPBXConfiguration(page) {
  try {
    console.log('[Puppeteer] Waiting for Apply Config button...');
    const applyBtnSelector = '#button_reload, .reload-btn, #applyBtn, .applyBtn, button[class*="apply"]';
    
    // We wait up to 5 seconds. If it's not visible or doesn't exist, we skip
    await page.waitForSelector(applyBtnSelector, { timeout: 5000 });
    
    console.log('[Puppeteer] Clicking Apply Config button.');
    await page.click(applyBtnSelector);

    // Wait for the reload/progress overlay to finish if applicable, or wait 6 seconds
    await new Promise(resolve => setTimeout(resolve, 6000));
    console.log('[Puppeteer] Applied configuration successfully.');
  } catch (e) {
    console.log(`[Puppeteer] Skip Apply Config step (not found or not needed): ${e.message}`);
  }
}

/**
 * Inspects all settings of a specific extension and returns them
 */
export async function inspectExtension(instance, cookies, extensionId) {
  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);

    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=extensions&extdisplay=${extensionId}`;
    console.log(`[Puppeteer] Navigating to edit page to inspect extension ${extensionId}: ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Extract all field names and values from the form
    const fields = await page.evaluate(() => {
      const form = document.querySelector('form');
      if (!form) return { error: 'Formulário não encontrado na página.' };

      const elements = Array.from(form.querySelectorAll('input, select, textarea'));
      return elements.map(el => {
        const name = el.getAttribute('name') || 'N/A';
        const id = el.getAttribute('id') || 'N/A';
        const type = el.tagName.toLowerCase() === 'select' ? 'select' : el.getAttribute('type') || 'text';
        
        let labelText = '';
        if (id !== 'N/A') {
          const lbl = document.querySelector(`label[for="${id}"]`);
          if (lbl) labelText = lbl.innerText.trim();
        }
        if (!labelText) {
          const parent = el.closest('.form-group') || el.parentElement;
          if (parent) {
            const lbl = parent.querySelector('label');
            if (lbl) labelText = lbl.innerText.trim();
          }
        }
        
        if (type === 'checkbox' || type === 'radio') {
          return { name, id, type, label: labelText, checked: el.checked, value: el.value };
        }
        return { name, id, type, label: labelText, value: el.value };
      });
    });

    return fields;
  } catch (error) {
    console.error(`[Puppeteer] Error inspecting extension ${extensionId}:`, error);
    throw new PBXError(`Erro ao inspecionar ramal: ${error.message}`);
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

/**
 * Scans the page for WebRTC and Recording elements
 */
export async function inspectExtensionHTML(instance, cookies, extensionId) {
  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);
    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=extensions&extdisplay=${extensionId}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const info = await page.evaluate(() => {
      const results = [];
      // Search all labels, buttons, inputs, spans
      const elements = Array.from(document.querySelectorAll('input, select, button, label, a, span, div'));
      
      elements.forEach(el => {
        const text = el.innerText ? el.innerText.trim() : '';
        const id = el.getAttribute('id') || '';
        const name = el.getAttribute('name') || '';
        const className = el.getAttribute('class') || '';
        const forAttr = el.getAttribute('for') || '';
        
        const isMatch = text.toLowerCase().includes('webrtc') || 
                        id.toLowerCase().includes('webrtc') || 
                        name.toLowerCase().includes('webrtc') ||
                        text.toLowerCase().includes('recording') || 
                        id.toLowerCase().includes('recording') || 
                        name.toLowerCase().includes('recording') ||
                        text.toLowerCase().includes('grava') || 
                        id.toLowerCase().includes('grava') || 
                        name.toLowerCase().includes('grava');
                        
        if (isMatch && results.length < 100) {
          results.push({
            tagName: el.tagName.toLowerCase(),
            text: text.slice(0, 100),
            id,
            name,
            className,
            forAttr,
            outerHTML: el.outerHTML.slice(0, 250)
          });
        }
      });
      return results;
    });

    return info;
  } catch (error) {
    throw new Error(`Failed to inspect HTML: ${error.message}`);
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

/**
 * Inspects Queues page, saves screenshot and returns queue list
 */
export async function inspectQueuesHTML(instance, cookies) {
  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);
    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=queues`;
    console.log(`[Puppeteer] Navigating to Queues list: ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Save screenshot
    await page.screenshot({ path: 'c:/Users/GuiAschi/Desktop/Pabx2.0/queues_page.png', fullPage: true });
    console.log('[Puppeteer] Saved queues page screenshot to: c:/Users/GuiAschi/Desktop/Pabx2.0/queues_page.png');

    // Extract queues info
    const data = await page.evaluate(() => {
      const results = [];
      
      // Let's look for standard table links for editing queues
      const editLinks = Array.from(document.querySelectorAll('a[href*="extdisplay="], a[href*="id="]'));
      editLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href.includes('display=queues') && (href.includes('id=') || href.includes('extdisplay='))) {
          const match = href.match(/(id|extdisplay)=([^&]+)/);
          const queueId = match ? match[2] : '';
          const name = link.innerText.trim();
          if (queueId && !results.find(r => r.id === queueId)) {
            results.push({ id: queueId, name, href });
          }
        }
      });
      
      // Let's also grab select elements or list tables to see what's in there
      const tables = Array.from(document.querySelectorAll('table')).map(t => ({
        id: t.getAttribute('id') || '',
        class: t.getAttribute('class') || '',
        headers: Array.from(t.querySelectorAll('th')).map(h => h.innerText.trim())
      }));

      return {
        detectedQueues: results,
        tables,
        bodyTextSnippet: document.body.innerText.slice(0, 1000)
      };
    });

    return data;
  } catch (error) {
    throw new Error(`Failed to inspect queues: ${error.message}`);
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

/**
 * Scans queue detail page for agent fields
 */
export async function inspectQueueDetailHTML(instance, cookies, queueId) {
  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);
    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=queues&view=form&extdisplay=${queueId}`;
    console.log(`[Puppeteer] Navigating to Queue Detail: ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    const info = await page.evaluate(() => {
      const results = [];
      const inputs = Array.from(document.querySelectorAll('input, select, textarea, label, span'));
      
      inputs.forEach(el => {
        const text = el.innerText ? el.innerText.trim() : '';
        const id = el.getAttribute('id') || '';
        const name = el.getAttribute('name') || '';
        
        const isMatch = text.toLowerCase().includes('agent') || 
                        id.toLowerCase().includes('agent') || 
                        name.toLowerCase().includes('agent');
                        
        if (isMatch && results.length < 50) {
          results.push({
            tagName: el.tagName.toLowerCase(),
            text,
            id,
            name,
            value: el.value || '',
            outerHTML: el.outerHTML.slice(0, 300)
          });
        }
      });
      return results;
    });

    return info;
  } catch (error) {
    throw new Error(`Failed to inspect queue detail: ${error.message}`);
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

/**
 * Retrieves the list of existing Queues from FreePBX
 */
export async function getQueues(instance, cookies) {
  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);
    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=queues`;
    console.log(`[Puppeteer] Navigating to Queues list: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    // Increase bootstrapTable page size to ensure we fetch all rows
    await page.evaluate(() => {
      try {
        if (typeof window['$'] !== 'undefined' && $('#qgrid').bootstrapTable) {
          $('#qgrid').bootstrapTable('refreshOptions', { pageSize: 9999 });
        } else if (typeof window['$'] !== 'undefined' && $('#table-all').bootstrapTable) {
          $('#table-all').bootstrapTable('refreshOptions', { pageSize: 9999 });
        }
      } catch (e) {
        console.warn('[Puppeteer] Failed to set bootstrapTable page size for queues:', e.message);
      }
    });
    await new Promise(resolve => setTimeout(resolve, 800));

    const queues = await page.evaluate(() => {
      const results = [];
      const table = document.querySelector('#table-all') || document.querySelector('#qgrid') || document.querySelector('table');
      if (!table) return [];
      
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length < 2) return;
        
        // Find edit link to fetch details URL
        const editLink = row.querySelector('a[href*="extdisplay="]');
        if (editLink) {
          const href = editLink.getAttribute('href');
          const match = href.match(/extdisplay=([^&]+)/);
          const queueId = match ? match[1] : '';
          
          // First cell contains Queue ID, second contains description
          const numberText = cells[0].innerText.trim();
          const nameText = cells[1].innerText.trim();
          
          const finalId = queueId || numberText;
          if (finalId) {
            results.push({
              id: finalId,
              name: nameText || `Fila ${finalId}`
            });
          }
        }
      });
      return results;
    });

    return queues;
  } catch (error) {
    console.error('[Puppeteer] Error getting queues:', error);
    throw new Error(`Erro ao buscar filas: ${error.message}`);
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

/**
 * Checks which queues the extension belongs to in real-time (detects static or dynamic type)
 */
export async function inspectExtensionQueues(instance, cookies, extensionNumber) {
  const queues = await getQueues(instance, cookies);
  const browser = await getBrowser();
  const associatedQueues = [];

  for (const queue of queues) {
    const queueId = queue.id;
    let page;
    try {
      page = await createNewPage(browser, cookies);
      const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=queues&view=form&extdisplay=${queueId}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

      const membership = await page.evaluate((extNum) => {
        const staticTextarea = document.querySelector('textarea#members') || document.querySelector('textarea[name="members"]');
        const dynamicTextarea = document.querySelector('textarea#dynmembers') || document.querySelector('textarea[name="dynmembers"]');
        
        let isStatic = false;
        if (staticTextarea) {
          const lines = staticTextarea.value.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          isStatic = lines.some(line => line.split(',')[0] === extNum);
        }
        
        let isDynamic = false;
        if (dynamicTextarea) {
          const lines = dynamicTextarea.value.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          isDynamic = lines.some(line => line.split(',')[0] === extNum);
        }
        
        if (isStatic) return 'static';
        if (isDynamic) return 'dynamic';
        return null;
      }, extensionNumber);

      if (membership) {
        associatedQueues.push({ id: queueId, type: membership });
      }
    } catch (e) {
      console.warn(`[Puppeteer] Failed to check queue ${queueId} for extension ${extensionNumber}:`, e.message);
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  await browser.close();
  return associatedQueues;
}

/**
 * Updates extension static agents inside target queues and removes from others
 */
export async function updateExtensionQueues(instance, cookies, extensionNumber, targetQueues = []) {
  const queues = await getQueues(instance, cookies);
  console.log(`[Puppeteer] Updating queues for extension ${extensionNumber}. Target:`, targetQueues);
  
  const browser = await getBrowser();
  let modifiedAny = false;

  for (const queue of queues) {
    const queueId = queue.id;
    
    // Find target configuration for this queue (can be string or object)
    const targetConfig = targetQueues.find(q => {
      if (typeof q === 'string') return q === queueId;
      return q.id === queueId;
    });

    const shouldBeInQueue = !!targetConfig;
    const queueType = targetConfig ? (typeof targetConfig === 'string' ? 'static' : (targetConfig.type || 'static')) : null;

    let page;
    try {
      page = await createNewPage(browser, cookies);
      const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=queues&view=form&extdisplay=${queueId}`;
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      const updateResult = await page.evaluate((extNum, add, type) => {
        const staticTextarea = document.querySelector('textarea#members') || document.querySelector('textarea[name="members"]');
        const dynamicTextarea = document.querySelector('textarea#dynmembers') || document.querySelector('textarea[name="dynmembers"]');
        
        if (!staticTextarea && !dynamicTextarea) {
          return { success: false, error: 'Textareas members or dynmembers not found' };
        }

        let modified = false;

        // Helper to add agent to a textarea if not present
        const addExt = (textarea) => {
          if (!textarea) return;
          const lines = textarea.value.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          const has = lines.some(line => line.split(',')[0] === extNum);
          if (!has) {
            lines.push(`${extNum},0`);
            textarea.value = lines.join('\n');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
            modified = true;
          }
        };

        // Helper to remove agent from a textarea if present
        const removeExt = (textarea) => {
          if (!textarea) return;
          const lines = textarea.value.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          const has = lines.some(line => line.split(',')[0] === extNum);
          if (has) {
            const newLines = lines.filter(line => line.split(',')[0] !== extNum);
            textarea.value = newLines.join('\n');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
            modified = true;
          }
        };

        if (add) {
          if (type === 'dynamic') {
            addExt(dynamicTextarea);
            removeExt(staticTextarea);
          } else {
            addExt(staticTextarea);
            removeExt(dynamicTextarea);
          }
        } else {
          removeExt(staticTextarea);
          removeExt(dynamicTextarea);
        }

        return { success: true, modified };
      }, extensionNumber, shouldBeInQueue, queueType);

      if (updateResult.success && updateResult.modified) {
        console.log(`[Puppeteer] Extension ${extensionNumber} updated in queue ${queueId}. Submitting...`);
        const submitBtn = await page.$('input[type="submit"], button[type="submit"], #submit');
        if (submitBtn) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }),
            submitBtn.click()
          ]);
          modifiedAny = true;
          console.log(`[Puppeteer] Queue ${queueId} updated successfully.`);
        }
      }
    } catch (err) {
      console.error(`[Puppeteer] Error updating queue ${queueId}:`, err);
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  await browser.close();

  if (modifiedAny) {
    console.log('[Puppeteer] Some queues were updated. Applying configurations...');
    const genericBrowser = await getBrowser();
    let configPage;
    try {
      configPage = await createNewPage(genericBrowser, cookies);
      await configPage.goto(`https://${instance}.pbxfacil.com.br/admin/config.php?display=extensions`, { waitUntil: 'domcontentloaded' });
      await applyPBXConfiguration(configPage);
    } catch (e) {
      console.error('[Puppeteer] Error applying config after queues update:', e.message);
    } finally {
      if (configPage) await configPage.close().catch(() => {});
      await genericBrowser.close();
    }
  }

  return { success: true };
}

/**
 * Background worker to sync all extensions types with local metadata
 */
export async function syncAllExtensionsMetadata(instance, cookies) {
  console.log('[Sync] Starting background extensions metadata sync...');
  try {
    const extensions = await getExtensions(instance, cookies);
    const { getMetadata, updateExtensionMetadata } = await import('./metadata-service.js');
    const currentMeta = getMetadata();
    
    // Find extensions that are not synced yet
    const toSync = extensions.filter(ext => !currentMeta[ext.extension]);
    console.log(`[Sync] Found ${toSync.length} extensions requiring metadata sync.`);
    
    if (toSync.length === 0) {
      console.log('[Sync] All extensions are already synced.');
      return;
    }

    const browser = await getBrowser();
    
    // Sync sequentially to be gentle on the PBX server
    for (let i = 0; i < toSync.length; i++) {
      const ext = toSync[i];
      const extensionNumber = ext.extension;
      console.log(`[Sync] Synced ${i + 1}/${toSync.length}: extension ${extensionNumber} in background...`);

      let page;
      try {
        page = await createNewPage(browser, cookies);
        const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=extensions&extdisplay=${extensionNumber}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

        // Extract transport value
        const transportValue = await page.evaluate(() => {
          const select = document.querySelector('select[name="devinfo_transport"]');
          return select ? select.value : '';
        });

        const type = transportValue === '0.0.0.0-wss' ? 'Webphone' : 'Softphone';
        const existingQueues = currentMeta[extensionNumber]?.queues || [];

        // Save metadata locally
        updateExtensionMetadata(extensionNumber, type, existingQueues);
      } catch (err) {
        console.warn(`[Sync] Failed to sync extension ${extensionNumber}:`, err.message);
      } finally {
        if (page) await page.close().catch(() => {});
      }

      // Add a small delay between requests to be gentle to the server
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    await browser.close();
    console.log('[Sync] Background metadata sync completed!');
  } catch (error) {
    console.error('[Sync] Error during background sync:', error.message);
  }
}

/**
 * Automates creation of a new Queue in FreePBX (supports static/dynamic agents, strategy, timeout, and maxwait)
 */
export async function createQueue(instance, cookies, { id, name, agents, staticAgents, dynamicAgents, strategy, timeout, maxwait }) {
  const staticList = staticAgents || agents || [];
  const dynamicList = dynamicAgents || [];
  console.log(`[Puppeteer] Creating queue ${id} (${name}). Static agents: ${staticList}, Dynamic agents: ${dynamicList}`);
  
  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);
    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=queues&view=form`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Fill general settings
    await page.waitForSelector('input#account', { timeout: 10000 });
    await page.type('input#account', id.toString());
    await page.type('input#name', name);

    // Set strategy (on General Settings tab)
    if (strategy) {
      await page.select('select#strategy', strategy);
    }

    // Switch to Timing & Agent Options tab to select timeout and maxwait
    if (timeout !== undefined || maxwait !== undefined) {
      await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('a[data-toggle="tab"]'));
        const timingTab = tabs.find(t => t.innerText.toLowerCase().includes('time') || t.innerText.toLowerCase().includes('tempo'));
        if (timingTab) timingTab.click();
      });
      await new Promise(resolve => setTimeout(resolve, 300));
      
      if (timeout !== undefined) {
        await page.select('select#timeout', timeout.toString());
      }
      if (maxwait !== undefined) {
        await page.select('select#maxwait', maxwait.toString());
      }
    }

    // Switch to Queue Agents tab
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('a[data-toggle="tab"]'));
      const agentsTab = tabs.find(t => t.innerText.toLowerCase().includes('agent'));
      if (agentsTab) {
        agentsTab.click();
      }
    });
    await new Promise(resolve => setTimeout(resolve, 300));
    
    await page.waitForSelector('textarea#members', { timeout: 5000 });

    // Write static agents
    const staticText = staticList.map(ext => `${ext},0`).join('\n');
    await page.evaluate((text) => {
      const textarea = document.querySelector('textarea#members');
      if (textarea) {
        textarea.value = text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, staticText);

    // Write dynamic agents
    const dynamicText = dynamicList.map(ext => `${ext},0`).join('\n');
    await page.evaluate((text) => {
      const textarea = document.querySelector('textarea#dynmembers');
      if (textarea) {
        textarea.value = text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, dynamicText);

    // Set Fail Over Destination to prevent validation errors on new queues (e.g. Terminate Call -> Hangup)
    await page.evaluate(() => {
      const destSelect = document.querySelector('select[name="goto0"]') || document.querySelector('select#goto0');
      if (destSelect) {
        const termOpt = Array.from(destSelect.options).find(opt => {
          const val = opt.value.toLowerCase();
          const text = opt.text.toLowerCase();
          return val.includes('terminate') || val.includes('blackhole') || text.includes('terminate') || text.includes('desligar');
        });
        
        if (termOpt) {
          destSelect.value = termOpt.value;
          destSelect.dispatchEvent(new Event('change', { bubbles: true }));
          
          const subSelectName = termOpt.value + '0';
          const subSelect = document.querySelector(`select[name="${subSelectName}"]`) || document.querySelector(`select[id="${subSelectName}"]`);
          if (subSelect && subSelect.options.length > 0) {
            subSelect.selectedIndex = subSelect.options.length - 1;
            subSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } else {
          for (let i = 0; i < destSelect.options.length; i++) {
            const val = destSelect.options[i].value;
            if (val && !val.includes('choose') && val !== '') {
              destSelect.selectedIndex = i;
              destSelect.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        }
      }
    });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Click submit
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.click('input#submit')
    ]);

    // Apply config
    await applyPBXConfiguration(page);

    console.log(`[Puppeteer] Queue ${id} created and config applied.`);
    return { success: true };
  } catch (error) {
    console.error(`[Puppeteer] Create queue error:`, error.message);
    if (page) {
      await page.screenshot({ path: `c:/Users/GuiAschi/Desktop/Pabx2.0/error_create_queue.png` }).catch(() => {});
    }
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

/**
 * Automates modification of an existing Queue in FreePBX (supports static/dynamic agents, strategy, timeout, and maxwait)
 */
export async function editQueue(instance, cookies, { id, name, agents, staticAgents, dynamicAgents, strategy, timeout, maxwait }) {
  const staticList = staticAgents || agents || [];
  const dynamicList = dynamicAgents || [];
  console.log(`[Puppeteer] Editing queue ${id} (${name}). Static agents: ${staticList}, Dynamic agents: ${dynamicList}`);

  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);
    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=queues&view=form&extdisplay=${id}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Clear and fill name
    await page.waitForSelector('input#name', { timeout: 10000 });
    await page.evaluate(() => {
      document.querySelector('input#name').value = '';
    });
    await page.type('input#name', name);

    // Set strategy (on General Settings tab)
    if (strategy) {
      await page.select('select#strategy', strategy);
    }

    // Switch to Timing & Agent Options tab to select timeout and maxwait
    if (timeout !== undefined || maxwait !== undefined) {
      await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('a[data-toggle="tab"]'));
        const timingTab = tabs.find(t => t.innerText.toLowerCase().includes('time') || t.innerText.toLowerCase().includes('tempo'));
        if (timingTab) timingTab.click();
      });
      await new Promise(resolve => setTimeout(resolve, 300));
      
      if (timeout !== undefined) {
        await page.select('select#timeout', timeout.toString());
      }
      if (maxwait !== undefined) {
        await page.select('select#maxwait', maxwait.toString());
      }
    }

    // Switch to Queue Agents tab
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('a[data-toggle="tab"]'));
      const agentsTab = tabs.find(t => t.innerText.toLowerCase().includes('agent'));
      if (agentsTab) {
        agentsTab.click();
      }
    });
    await new Promise(resolve => setTimeout(resolve, 300));

    await page.waitForSelector('textarea#members', { timeout: 5000 });

    // Write static agents
    const staticText = staticList.map(ext => `${ext},0`).join('\n');
    await page.evaluate((text) => {
      const textarea = document.querySelector('textarea#members');
      if (textarea) {
        textarea.value = text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, staticText);

    // Write dynamic agents
    const dynamicText = dynamicList.map(ext => `${ext},0`).join('\n');
    await page.evaluate((text) => {
      const textarea = document.querySelector('textarea#dynmembers');
      if (textarea) {
        textarea.value = text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, dynamicText);

    // Click submit
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.click('input#submit')
    ]);

    // Apply config
    await applyPBXConfiguration(page);

    console.log(`[Puppeteer] Queue ${id} edited and config applied.`);
    return { success: true };
  } catch (error) {
    console.error(`[Puppeteer] Edit queue error:`, error.message);
    if (page) {
      await page.screenshot({ path: `c:/Users/GuiAschi/Desktop/Pabx2.0/error_edit_queue.png` }).catch(() => {});
    }
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

/**
 * Automates deletion of an existing Queue in FreePBX
 */
export async function deleteQueue(instance, cookies, id) {
  console.log(`[Puppeteer] Deleting queue ${id}...`);
  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);
    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=queues&view=form&extdisplay=${id}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Accept dialog confirmation
    page.on('dialog', async dialog => {
      console.log(`[Puppeteer] Accepting confirmation dialog: ${dialog.message()}`);
      await dialog.accept();
    });

    await page.waitForSelector('input#delete', { timeout: 10000 });
    
    // Click delete and wait for navigation
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.click('input#delete')
    ]);

    // Apply config
    await applyPBXConfiguration(page);

    console.log(`[Puppeteer] Queue ${id} deleted and config applied.`);
    return { success: true };
  } catch (error) {
    console.error(`[Puppeteer] Delete queue error:`, error.message);
    if (page) {
      await page.screenshot({ path: `c:/Users/GuiAschi/Desktop/Pabx2.0/error_delete_queue.png` }).catch(() => {});
    }
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

/**
 * Inspects a single queue's detailed properties from the FreePBX Edit form page (retrieves static/dynamic agents, strategy, timeout, maxwait)
 */
export async function inspectQueueDetail(instance, cookies, id) {
  console.log(`[Puppeteer] Inspecting details of queue ${id}...`);
  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);
    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=queues&view=form&extdisplay=${id}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    await page.waitForSelector('input#name', { timeout: 10000 });
    const name = await page.$eval('input#name', el => el.value);

    // Read strategy (from General Settings tab, visible by default)
    const strategy = await page.$eval('select#strategy', el => el.value).catch(() => 'ringall');

    // Read timeout and maxwait (from Timing & Agent Options tab)
    const timeout = await page.$eval('select#timeout', el => el.value).catch(() => '0');
    const maxwait = await page.$eval('select#maxwait', el => el.value).catch(() => '');

    // Switch to Queue Agents tab to read agents list
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('a[data-toggle="tab"]'));
      const agentsTab = tabs.find(t => t.innerText.toLowerCase().includes('agent'));
      if (agentsTab) {
        agentsTab.click();
      }
    });

    await page.waitForSelector('textarea#members', { timeout: 5000 });
    const membersVal = await page.$eval('textarea#members', el => el.value);
    
    let dynMembersVal = '';
    const dynTextarea = await page.$('textarea#dynmembers');
    if (dynTextarea) {
      dynMembersVal = await page.$eval('textarea#dynmembers', el => el.value);
    }

    const staticAgents = membersVal
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => line.split(',')[0].trim());

    const dynamicAgents = dynMembersVal
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => line.split(',')[0].trim());

    return { 
      id, 
      name, 
      agents: [...staticAgents, ...dynamicAgents],
      staticAgents, 
      dynamicAgents,
      strategy,
      timeout,
      maxwait
    };
  } catch (error) {
    console.error(`[Puppeteer] Inspect queue detail error:`, error.message);
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

/**
 * Helper to parse raw text from module=Peers in Asterisk Info (reads both PJSIP and Chan_SIP)
 */
function parsePeers(rawText) {
  const extensions = {};
  const lines = rawText.split('\n');
  let currentExt = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;

    // 1. PJSIP Parse: e.g. "Endpoint:  2001/2001 ... Not in use / Unavailable"
    if (line.startsWith('Endpoint:')) {
      const match = line.match(/Endpoint:\s+(\d+)\/\d+\s+(.+)/);
      if (match) {
        currentExt = match[1];
        const rest = match[2];
        const isRegistered = !rest.includes('Unavailable');
        extensions[currentExt] = {
          extension: currentExt,
          status: isRegistered ? 'online' : 'offline',
          state: isRegistered ? 'Registrado' : 'Indisponível',
          latency: null
        };
      } else {
        currentExt = null;
      }
    } else if (currentExt && line.startsWith('Contact:')) {
      const parts = line.split(/\s+/);
      const lastPart = parts[parts.length - 1];
      if (!isNaN(Number(lastPart))) {
        extensions[currentExt].latency = `${parseFloat(lastPart).toFixed(1)} ms`;
      }
    }
    
    // 2. Chan_SIP Parse: e.g. "2001/2001   127.0.0.1  ... OK (45 ms)" or "2002  (Unspecified) ... UNKNOWN"
    const sipMatch = line.match(/^(\d+)(?:\/\d+)?\s+([^\s]+)\s+[\s\S]+?\s+(OK\s*\([^)]+\)|UNKNOWN|UNREACHABLE)/i);
    if (sipMatch) {
      const ext = sipMatch[1];
      const host = sipMatch[2];
      const statusText = sipMatch[3];
      
      const isOnline = statusText.toUpperCase().includes('OK');
      let latency = null;
      if (isOnline) {
        const latMatch = statusText.match(/\((\d+(?:\.\d+)?)\s*ms\)/i);
        if (latMatch) {
          latency = `${parseFloat(latMatch[1]).toFixed(1)} ms`;
        }
      }
      
      if (!extensions[ext]) {
        extensions[ext] = {
          extension: ext,
          status: isOnline ? 'online' : 'offline',
          state: isOnline ? 'Registrado' : 'Indisponível',
          latency: latency
        };
      }
    }
  }
  return Object.values(extensions);
}

/**
 * Helper to parse raw text from module=Registries in Asterisk Info
 * Handles: PJSIP (Registration: name state), Chan_SIP (host/dnsmgr table), IAX2
 */
function parseRegistries(rawText) {
  const trunks = [];
  const lines = rawText.split('\n');

  let section = '';
  let sipHeaderParsed = false;
  let sipColOffsets = null; // column offsets for SIP table

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (line.length === 0) continue;

    // ── Section markers ──────────────────────────────────────────────────
    if (line === 'PJSIP' || line.includes('Registration/ServerURI')) { section = 'PJSIP'; sipHeaderParsed = false; continue; }

    if (line.match(/^Host\s+dnsmgr\s+Username/i)) {
      section = 'SIP';
      sipHeaderParsed = true;
      // Record column start positions from the header line for precise slicing
      sipColOffsets = {
        host: raw.indexOf('Host'),
        dnsmgr: raw.indexOf('dnsmgr'),
        username: raw.indexOf('Username'),
        refresh: raw.indexOf('Refresh'),
        state: raw.indexOf('State'),
      };
      continue;
    }

    if (line.match(/^\d+\s+IAX2 registrations/i)) { section = 'IAX2'; continue; }
    if (line.includes('No objects found')) continue;

    // ── PJSIP registrations ───────────────────────────────────────────────
    if (section === 'PJSIP') {
      if (line.startsWith('===') || line.includes('Objects found') || line.includes('Registration/ServerURI')) {
        continue;
      }

      // Format 1: "Registration: trunk/name  Registered/Unregistered"
      const m = line.match(/Registration:\s+([^\s]+)\s+([^\s]+)/i);
      if (m) {
        const name = m[1].split('/')[0]; // strip "/anything"
        const stateRaw = m[2];
        const isOnline = /registered|active/i.test(stateRaw);
        const stateLabel = isOnline ? 'Registrado' : stateRaw === 'Unregistered' ? 'Não Registrado' : stateRaw;
        trunks.push({ name, type: 'PJSIP', statusRaw: stateRaw, status: stateLabel, isOnline });
      } else {
        // Format 2: "118222001/sip:app.nvoip.com.br  118222001  Registered"
        const parts = line.split(/\s+/);
        if (parts.length >= 3) {
          const serverUri = parts[0];
          const auth = parts[1];
          const stateRaw = parts[2];
          
          if (serverUri !== 'Objects' && serverUri !== 'Registration') {
            let name = serverUri;
            const slashParts = serverUri.split('/');
            if (slashParts.length > 0) {
              const trunkId = slashParts[0];
              const hostPart = slashParts[1] ? slashParts[1].replace('sip:', '').replace('sips:', '') : '';
              name = hostPart ? `${trunkId} (${hostPart})` : trunkId;
            }
            const isOnline = /registered|active/i.test(stateRaw);
            const stateLabel = isOnline ? 'Registrado' : stateRaw === 'Unregistered' ? 'Não Registrado' : stateRaw;
            trunks.push({ name, type: 'PJSIP', statusRaw: stateRaw, status: stateLabel, isOnline });
          }
        }
      }
    }

    // ── Chan_SIP registrations ────────────────────────────────────────────
    else if (section === 'SIP' && sipHeaderParsed) {
      if (line.startsWith('0 SIP') || line.startsWith('0 sip') || line.match(/^\d+ SIP/i)) continue;

      // Use column offsets when available for precise parsing
      let host, username, state;
      if (sipColOffsets && raw.length > sipColOffsets.state) {
        host     = raw.substring(sipColOffsets.host, sipColOffsets.dnsmgr).trim();
        username = raw.substring(sipColOffsets.username, sipColOffsets.refresh).trim();
        state    = raw.substring(sipColOffsets.state).trim().split(/\s+/)[0];
      } else {
        const parts = line.split(/\s+/);
        if (parts.length < 5) continue;
        host     = parts[0];
        username = parts[2];
        state    = parts[parts.length - 1];
      }

      if (!host || host === 'Host') continue; // skip header repeats

      const isOnline = /registered/i.test(state);
      const stateLabel = isOnline ? 'Registrado' : /unregistered/i.test(state) ? 'Não Registrado' : state;
      const name = username && username !== '(null)' ? `${username}@${host}` : host;
      trunks.push({ name, host, username, type: 'SIP', statusRaw: state, status: stateLabel, isOnline });
    }
  }
  return trunks;
}


/**
 * Helper to parse raw text from module=Queues in Asterisk Info
 */
function parseQueues(rawText) {
  const queues = [];
  const lines = rawText.split('\n');
  let currentQueue = null;
  let inMembersSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    
    const queueMatch = line.match(/^([^\s]+)\s+has\s+(\d+)\s+calls\s+\(max\s+([^\s\)]+)\)\s+in\s+'([^']+)'\s+strategy/);
    if (queueMatch) {
      currentQueue = {
        id: queueMatch[1],
        callsInWait: parseInt(queueMatch[2]),
        maxCalls: queueMatch[3],
        strategy: queueMatch[4],
        completedCalls: 0,
        abandonedCalls: 0,
        serviceLevel: '0%',
        members: []
      };
      
      const statsMatch = line.match(/C:(\d+),\s*A:(\d+),\s*SL:([^,%\s]+)%?/);
      if (statsMatch) {
        currentQueue.completedCalls = parseInt(statsMatch[1]);
        currentQueue.abandonedCalls = parseInt(statsMatch[2]);
        currentQueue.serviceLevel = `${statsMatch[3]}%`;
      }
      
      queues.push(currentQueue);
      inMembersSection = false;
      continue;
    }
    
    if (currentQueue) {
      if (line.toLowerCase().startsWith('members:')) {
        inMembersSection = true;
        continue;
      }
      
      if (line.toLowerCase().startsWith('no callers') || line.toLowerCase().startsWith('callers:')) {
        inMembersSection = false;
        continue;
      }
      
      if (inMembersSection) {
        const nameMatch = line.match(/^([^\(]+)/);
        const name = nameMatch ? nameMatch[1].trim() : 'Desconhecido';
        
        const techMatch = line.match(/\((PJSIP|Local|SIP|IAX2)\/([^@\)\s]+)/);
        let extension = 'Desconhecido';
        if (techMatch) {
          extension = techMatch[2];
        }
        
        let status = 'Desconhecido';
        const statuses = ['Unavailable', 'Not in use', 'In use', 'Ringing', 'Busy', 'On Hold'];
        for (const s of statuses) {
          if (line.includes(`(${s})`)) {
            status = s;
            break;
          }
        }
        
        let statusTranslated = status;
        if (status === 'Unavailable') statusTranslated = 'Indisponível';
        else if (status === 'Not in use') statusTranslated = 'Livre';
        else if (status === 'In use') statusTranslated = 'Em Chamada';
        else if (status === 'Busy') statusTranslated = 'Ocupado';
        else if (status === 'Ringing') statusTranslated = 'Chamando';
        
        const callsMatch = line.match(/has taken (\d+) calls/);
        const callsTaken = callsMatch ? parseInt(callsMatch[1]) : 0;
        
        currentQueue.members.push({
          name,
          extension,
          status: statusTranslated,
          statusRaw: status,
          callsTaken
        });
      }
    }
  }
  return queues;
}

/**
 * Scrapes and aggregates real-time extensions registration status, queue logs, and trunk registers
 */
const realtimeCache = {};

async function getRealtimeStatusScrape(instance, cookies, mockExtensions, mockQueues) {
  const browser = await getBrowser();
  let peersPage;
  let queuesPage;
  let registriesPage;
  try {
    peersPage = await browser.newPage();
    queuesPage = await browser.newPage();
    registriesPage = await browser.newPage();
    
    // Set user agent
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    await Promise.all([
      peersPage.setUserAgent(userAgent),
      queuesPage.setUserAgent(userAgent),
      registriesPage.setUserAgent(userAgent)
    ]);

    // Optimize page speeds by blocking stylesheets, images, media and fonts
    const blockResources = async (page) => {
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const type = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
          req.abort();
        } else {
          req.continue();
        }
      });
    };

    await Promise.all([
      blockResources(peersPage),
      blockResources(queuesPage),
      blockResources(registriesPage)
    ]);

    // Apply cookies
    if (cookies) {
      await Promise.all([
        peersPage.setCookie(...cookies),
        queuesPage.setCookie(...cookies),
        registriesPage.setCookie(...cookies)
      ]);
    }

    const peersUrl = `https://${instance}.pbxfacil.com.br/admin/config.php?display=asteriskinfo&module=Peers`;
    const queuesUrl = `https://${instance}.pbxfacil.com.br/admin/config.php?display=asteriskinfo&module=Queues`;
    const registriesUrl = `https://${instance}.pbxfacil.com.br/admin/config.php?display=asteriskinfo&module=Registries`;
    
    console.log(`[Puppeteer] Scraping real-time status details...`);
    
    // Resilient page loads with 8s timeout
    const loadUrl = async (page, url) => {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
      } catch (err) {
        console.log(`[Puppeteer] Nav warning for ${url}: ${err.message}. Trying to proceed...`);
      }
    };

    await Promise.all([
      loadUrl(peersPage, peersUrl),
      loadUrl(queuesPage, queuesUrl),
      loadUrl(registriesPage, registriesUrl)
    ]);

    // Extract ALL pre elements text with 5s timeout (FreePBX renders multiple pre blocks per module)
    const extractText = async (page, name) => {
      try {
        await page.waitForSelector('pre', { timeout: 5000 });
        // Use $$eval to collect ALL pre blocks (PJSIP section + SIP section, etc.) and join them
        const allTexts = await page.$$eval('pre', els => els.map(el => el.innerText).join('\n'));
        console.log(`[Puppeteer] ${name}: found ${allTexts.split('\n').length} lines across all pre elements`);
        return allTexts;
      } catch (err) {
        console.log(`[Puppeteer] Text extraction warning on ${name}: ${err.message}.`);
        return '';
      }
    };

    const [peersText, queuesText, registriesText] = await Promise.all([
      extractText(peersPage, 'Peers'),
      extractText(queuesPage, 'Queues'),
      extractText(registriesPage, 'Registries')
    ]);

    const extensions = parsePeers(peersText);
    const queues = parseQueues(queuesText);
    const trunks = parseRegistries(registriesText);

    return { extensions, queues, trunks };
  } catch (error) {
    console.error('[Puppeteer] Realtime status extraction failed:', error.message);
    throw error;
  } finally {
    if (peersPage) await peersPage.close().catch(() => {});
    if (queuesPage) await queuesPage.close().catch(() => {});
    if (registriesPage) await registriesPage.close().catch(() => {});
    await browser.close();
  }
}

export async function getRealtimeStatus(instance, cookies, mockExtensions = [], mockQueues = []) {
  const now = Date.now();
  
  if (instance.toLowerCase() === 'mock') {
    const mockExtensionsRealtime = mockExtensions.map(e => ({
      extension: e.extension,
      status: Math.random() > 0.3 ? 'online' : 'offline',
      state: Math.random() > 0.3 ? 'Registrado' : 'Indisponível',
      latency: Math.random() > 0.3 ? `${(Math.random() * 50 + 20).toFixed(1)} ms` : null
    }));
    
    const mockQueuesRealtime = mockQueues.map(q => ({
      id: q.id,
      callsInWait: Math.floor(Math.random() * 3),
      maxCalls: 'unlimited',
      strategy: q.strategy || 'ringall',
      completedCalls: Math.floor(Math.random() * 100 + 50),
      abandonedCalls: Math.floor(Math.random() * 20),
      serviceLevel: `${(Math.random() * 20 + 80).toFixed(1)}%`,
      members: (q.staticAgents || []).map(extNum => ({
        name: `Agente ${extNum}`,
        extension: extNum,
        status: Math.random() > 0.5 ? 'Livre' : (Math.random() > 0.5 ? 'Em Chamada' : 'Indisponível'),
        statusRaw: 'Not in use',
        callsTaken: Math.floor(Math.random() * 15)
      }))
    }));

    const mockTrunks = [
      { name: 'Trunk_Vivo_SIP', type: 'SIP', status: 'Registered', isOnline: true },
      { name: 'Trunk_Claro_PJSIP', type: 'PJSIP', status: 'Registered', isOnline: true },
      { name: 'Trunk_Failover_Mock', type: 'SIP', status: 'Unregistered', isOnline: false }
    ];
    
    return { extensions: mockExtensionsRealtime, queues: mockQueuesRealtime, trunks: mockTrunks };
  }

  if (!realtimeCache[instance]) {
    realtimeCache[instance] = { data: null, timestamp: 0, promise: null };
  }

  // 1. Return fresh cache if less than 6 seconds old
  if (realtimeCache[instance].data && (now - realtimeCache[instance].timestamp < 6000)) {
    console.log(`[Cache] Returning fresh cached realtime status for ${instance}`);
    return realtimeCache[instance].data;
  }

  // 2. Prevent concurrent scraper runs - return existing promise if active
  if (realtimeCache[instance].promise) {
    console.log(`[Cache] Scraper already running for ${instance}. Awaiting same thread promise...`);
    return await realtimeCache[instance].promise;
  }

  // 3. Trigger scrapers
  const fetchPromise = (async () => {
    try {
      const data = await getRealtimeStatusScrape(instance, cookies, mockExtensions, mockQueues);
      realtimeCache[instance].data = data;
      realtimeCache[instance].timestamp = Date.now();
      return data;
    } finally {
      realtimeCache[instance].promise = null;
    }
  })();

  realtimeCache[instance].promise = fetchPromise;
  return await fetchPromise;
}

/**
 * Navigates to sipsettings and extracts the external NAT IP address of the PBX server.
 * If scraping fails or NAT IP is not set, falls back to DNS lookup of the instance's domain.
 */
export async function getPBXExternalIP(instance, cookies) {
  if (instance.toLowerCase() === 'mock') {
    return '127.0.0.1';
  }

  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);
    
    // Set cookie if available
    if (cookies) {
      await page.setCookie(...cookies);
    }
    
    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=sipsettings`;
    console.log(`[Puppeteer] Navigating to sipsettings for IP: ${url}`);
    
    // Resilient load (wait up to 30 seconds)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for the specific input
    await page.waitForSelector('input#externip', { timeout: 20000 });
    
    const externalIP = await page.evaluate(() => {
      const el = document.querySelector('input#externip');
      return el && el.value ? el.value.trim() : null;
    });

    if (externalIP) {
      console.log(`[Puppeteer] Scraped PBX External NAT IP for ${instance}: ${externalIP}`);
      return externalIP;
    }
  } catch (err) {
    console.warn(`[Puppeteer] Failed to scrape NAT settings for IP of ${instance}: ${err.message}`);
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  // Last-resort fallback to DNS if Puppeteer scraping fails
  try {
    const lookup = await dns.promises.lookup(`${instance}.pbxfacil.com.br`);
    if (lookup && lookup.address) {
      return lookup.address;
    }
  } catch (e) {}

  return null;
}

/**
 * Lists all Inbound Routes (DIDs) from FreePBX display=did
 */
export async function getInboundRoutes(instance, cookies) {
  if (instance.toLowerCase() === 'mock') {
    return [
      { id: '1', did: '1130030033', description: 'Entrada Principal', destination: 'Extensions: 2000' },
      { id: '2', did: '1130030034', description: 'Suporte N1', destination: 'Queues: 100' }
    ];
  }

  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);
    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=did`;
    console.log(`[Puppeteer] Navigating to Inbound Routes list: ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for the main bootstrap table container or table to load
    await page.waitForSelector('#didtable, #table, .bootstrap-table table, table[data-toggle="table"]', { timeout: 10000 }).catch(() => {});
    
    // Wait for bootstrap-table rows to load (Loading... row is gone and we have actual data rows or empty message)
    await page.waitForFunction(() => {
      const table = document.querySelector('#didtable') || 
                    document.querySelector('#table') || 
                    document.querySelector('.bootstrap-table table') || 
                    document.querySelector('table[data-toggle="table"]');
      if (!table) return false;
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      if (rows.length === 0) return false;
      const text = rows[0].innerText.toLowerCase();
      if (text.includes('loading') || text.includes('carregando') || text.includes('aguarde')) {
        return false;
      }
      return true;
    }, { timeout: 15000 }).catch(() => {
      console.log('[Puppeteer] Timeout waiting for DID table rows to populate.');
    });

    // Try to increase bootstrapTable page size to 9999 to load all records at once
    console.log('[Puppeteer] Setting page size to 9999 via jQuery bootstrapTable...');
    await page.evaluate(() => {
      try {
        if (window.jQuery) {
          let $table = window.jQuery('#didtable');
          if ($table.length === 0) {
            $table = window.jQuery('#table');
          }
          if ($table.length === 0) {
            $table = window.jQuery('.bootstrap-table table');
          }
          if ($table.length === 0) {
            $table = window.jQuery('table[data-toggle="table"]');
          }
          if ($table && $table.bootstrapTable) {
            $table.bootstrapTable('refreshOptions', { pageSize: 9999 });
          }
        }
      } catch (e) {
        console.error('Error setting pageSize to 9999:', e);
      }
    });

    // Wait a brief moment for the table to reload/re-render
    await new Promise(resolve => setTimeout(resolve, 1500));

    const routes = await page.evaluate(() => {
      const list = [];
      const table = document.querySelector('#didtable') || 
                    document.querySelector('#table') || 
                    document.querySelector('.bootstrap-table table') || 
                    document.querySelector('table[data-toggle="table"]');
      if (!table) return [];
      
      const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.toLowerCase().trim());
      let descIdx = headers.findIndex(h => h.includes('description') || h.includes('descri'));
      let didIdx = headers.findIndex(h => h.includes('did') || h.includes('número'));
      let destIdx = headers.findIndex(h => h.includes('destination') || h.includes('destino'));
      
      // Fallbacks if headers are not found or table has no thead
      if (descIdx === -1) descIdx = 2; // Column 2 in smart
      if (didIdx === -1) didIdx = 0;   // Column 0 in smart
      if (destIdx === -1) destIdx = 3;  // Column 3 in smart
      
      // Select only rows with data-index
      let rows = Array.from(table.querySelectorAll('tbody tr[data-index]'));
      if (rows.length === 0) {
        rows = Array.from(table.querySelectorAll('tbody tr'));
      }

      for (const row of rows) {
        if (row.innerText.includes('No data') || row.innerText.includes('Nenhum registro') || row.querySelectorAll('td').length < 2) {
          continue;
        }
        
        const cells = Array.from(row.querySelectorAll('td'));
        const editLink = row.querySelector('a[href*="extdisplay="]') || 
                         row.querySelector('a[href*="view=form"]') || 
                         row.querySelector('td:last-child a');
        if (!editLink) continue;
        
        const href = editLink.getAttribute('href') || '';
        const match = href.match(/extdisplay=([^&]+)/);
        const id = match ? decodeURIComponent(match[1]) : '';
        
        const description = cells[descIdx] ? cells[descIdx].innerText.trim() : '';
        const did = cells[didIdx] ? cells[didIdx].innerText.trim() : '';
        const destination = cells[destIdx] ? cells[destIdx].innerText.trim() : '';
        
        list.push({
          id,
          description,
          did: did === 'ANY' || did === 'Any' || did === '' ? 'Qualquer' : did,
          destination
        });
      }
      return list;
    });

    console.log(`[Puppeteer] Extracted ${routes.length} inbound routes.`);
    return routes;
  } catch (error) {
    console.error('[Puppeteer] Error listing inbound routes:', error.message);
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

/**
 * Creates a new Inbound Route (DID) in FreePBX
 */
export async function createInboundRoute(instance, cookies, routeData) {
  if (instance.toLowerCase() === 'mock') {
    return { success: true };
  }

  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);
    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=did&view=form`;
    console.log(`[Puppeteer] Navigating to create Inbound Route: ${url}`);
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for inputs
    await page.waitForSelector('input[name="extension"]', { timeout: 10000 });
    
    const { did, description, destType, destValue } = routeData;
    
    await page.evaluate((d, desc, type, val) => {
      const extInput = document.querySelector('input[name="extension"]');
      const descInput = document.querySelector('input[name="description"]');
      
      if (extInput) extInput.value = d;
      if (descInput) descInput.value = desc;
      
      const gotoSelect = document.querySelector('select[name="goto0"]');
      if (gotoSelect) {
        // Try finding option that matches Extension, Queue, or Custom Destination
        const options = Array.from(gotoSelect.options);
        let targetValue = type;
        
        if (type === 'Extensions') {
          const opt = options.find(o => o.value === 'Extensions' || o.value === 'ext-local' || o.value === 'from-did-direct' || o.value.includes('local'));
          if (opt) targetValue = opt.value;
        } else if (type === 'Queues') {
          const opt = options.find(o => o.value === 'Queues' || o.value === 'ext-queues' || o.value.toLowerCase().includes('queue'));
          if (opt) targetValue = opt.value;
        } else if (type === 'Custom_Destinations' || type === 'Custom' || type === 'CustomDestinations') {
          const opt = options.find(o => o.value === 'Custom_Destinations' || o.value === 'customdestinations' || o.value === 'customdests' || o.value.toLowerCase().includes('custom'));
          if (opt) targetValue = opt.value;
        }
        
        gotoSelect.value = targetValue;
        gotoSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, did, description, destType, destValue);

    // Wait a brief moment for the secondary dropdown to be shown
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Select the destination item value
    await page.evaluate((type, val) => {
      const gotoSelect = document.querySelector('select[name="goto0"]');
      const activeType = gotoSelect ? gotoSelect.value : type;
      
      const selectElement = document.querySelector(`select[name="${activeType}0"]`) || 
                            document.querySelector(`select[name*="${activeType}"]`) ||
                            document.querySelector(`select[name="${type}0"]`) || 
                            document.querySelector(`select[name*="${type}"]`) ||
                            document.querySelector('select[name="ext-local0"]') ||
                            document.querySelector('select[name="ext-queues0"]') ||
                            document.querySelector('select[name="customdestinations0"]') ||
                            document.querySelector('select[name="customdests0"]');
                            
      if (selectElement) {
        const options = Array.from(selectElement.options);
        let opt = options.find(o => o.value === val);
        
        if (!opt) {
          opt = options.find(o => {
            const parts = o.value.split(',');
            return parts.includes(val) || o.value.includes(`,${val},`) || o.value.endsWith(`,${val}`);
          });
        }
        
        if (!opt) {
          opt = options.find(o => o.value.toLowerCase().includes(val.toLowerCase()) || o.innerText.toLowerCase().includes(val.toLowerCase()));
        }
        
        if (opt) {
          selectElement.value = opt.value;
          selectElement.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }, destType, destValue);

    // Submit
    console.log('[Puppeteer] Submitting DID creation form...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }),
      page.click('#submit')
    ]);
    
    // Apply changes
    console.log('[Puppeteer] Clicking Apply Config...');
    await applyPBXConfiguration(page);
    
    return { success: true };
  } catch (error) {
    console.error('[Puppeteer] Error creating inbound route:', error.message);
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

/**
 * Edits an existing Inbound Route (DID) in FreePBX
 */
export async function editInboundRoute(instance, cookies, routeId, routeData) {
  if (instance.toLowerCase() === 'mock') {
    return { success: true };
  }

  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);
    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=did&view=form&extdisplay=${encodeURIComponent(routeId)}`;
    console.log(`[Puppeteer] Navigating to edit Inbound Route: ${url}`);
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for inputs
    await page.waitForSelector('input[name="description"]', { timeout: 10000 });
    
    const { description, destType, destValue } = routeData;
    
    await page.evaluate((desc, type, val) => {
      const descInput = document.querySelector('input[name="description"]');
      if (descInput) descInput.value = desc;
      
      const gotoSelect = document.querySelector('select[name="goto0"]');
      if (gotoSelect) {
        // Try finding option that matches Extension, Queue, or Custom Destination
        const options = Array.from(gotoSelect.options);
        let targetValue = type;
        
        if (type === 'Extensions') {
          const opt = options.find(o => o.value === 'Extensions' || o.value === 'ext-local' || o.value === 'from-did-direct' || o.value.includes('local'));
          if (opt) targetValue = opt.value;
        } else if (type === 'Queues') {
          const opt = options.find(o => o.value === 'Queues' || o.value === 'ext-queues' || o.value.toLowerCase().includes('queue'));
          if (opt) targetValue = opt.value;
        } else if (type === 'Custom_Destinations' || type === 'Custom' || type === 'CustomDestinations') {
          const opt = options.find(o => o.value === 'Custom_Destinations' || o.value === 'customdestinations' || o.value === 'customdests' || o.value.toLowerCase().includes('custom'));
          if (opt) targetValue = opt.value;
        }
        
        gotoSelect.value = targetValue;
        gotoSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, description, destType, destValue);

    // Wait a brief moment for the secondary dropdown to be shown
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Select the destination item value
    await page.evaluate((type, val) => {
      const gotoSelect = document.querySelector('select[name="goto0"]');
      const activeType = gotoSelect ? gotoSelect.value : type;
      
      const selectElement = document.querySelector(`select[name="${activeType}0"]`) || 
                            document.querySelector(`select[name*="${activeType}"]`) ||
                            document.querySelector(`select[name="${type}0"]`) || 
                            document.querySelector(`select[name*="${type}"]`) ||
                            document.querySelector('select[name="ext-local0"]') ||
                            document.querySelector('select[name="ext-queues0"]') ||
                            document.querySelector('select[name="customdestinations0"]') ||
                            document.querySelector('select[name="customdests0"]');
                            
      if (selectElement) {
        const options = Array.from(selectElement.options);
        let opt = options.find(o => o.value === val);
        
        if (!opt) {
          opt = options.find(o => {
            const parts = o.value.split(',');
            return parts.includes(val) || o.value.includes(`,${val},`) || o.value.endsWith(`,${val}`);
          });
        }
        
        if (!opt) {
          opt = options.find(o => o.value.toLowerCase().includes(val.toLowerCase()) || o.innerText.toLowerCase().includes(val.toLowerCase()));
        }
        
        if (opt) {
          selectElement.value = opt.value;
          selectElement.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }, destType, destValue);

    // Submit
    console.log('[Puppeteer] Submitting DID edit form...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }),
      page.click('#submit')
    ]);
    
    // Apply changes
    console.log('[Puppeteer] Clicking Apply Config...');
    await applyPBXConfiguration(page);
    
    return { success: true };
  } catch (error) {
    console.error('[Puppeteer] Error editing inbound route:', error.message);
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

/**
 * Deletes an existing Inbound Route (DID) in FreePBX
 */
export async function deleteInboundRoute(instance, cookies, routeId) {
  if (instance.toLowerCase() === 'mock') {
    return { success: true };
  }

  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);
    
    // Auto accept delete confirmation dialog
    page.on('dialog', async dialog => {
      console.log(`[Puppeteer] Auto-accepting delete dialog: ${dialog.message()}`);
      await dialog.accept();
    });

    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=did&view=form&extdisplay=${encodeURIComponent(routeId)}`;
    console.log(`[Puppeteer] Navigating to edit page to delete Inbound Route: ${url}`);
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for the delete button to appear
    console.log('[Puppeteer] Looking for Delete button...');
    const deleteBtnSelector = '#delbtn, [name="delete"], .btn-danger[value="Delete"], .btn-danger[value="Excluir"], [id*="delete"], [class*="delete"]';
    await page.waitForSelector(deleteBtnSelector, { timeout: 10000 });
    
    console.log('[Puppeteer] Clicking delete button...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}),
      page.click(deleteBtnSelector)
    ]);
    
    // Apply changes
    console.log('[Puppeteer] Clicking Apply Config...');
    await applyPBXConfiguration(page);
    
    return { success: true };
  } catch (error) {
    console.error('[Puppeteer] Error deleting inbound route:', error.message);
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

/**
 * Automatically creates and configures the 'disparoupchat' ARI user in FreePBX
 */
export async function setupARIUser(instance, cookies) {
  if (instance.toLowerCase() === 'mock') {
    return { success: true, message: 'Usuário do ARI configurado com sucesso (Mock).' };
  }

  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);
    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=arimanager&view=form`;
    console.log(`[Puppeteer] Navigating to ARI Manager form: ${url}`);
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for inputs
    await page.waitForSelector('#name', { timeout: 10000 });
    
    const username = 'disparoupchat';
    const password = 'disparou123';
    
    await page.evaluate((user, pass) => {
      const nameInput = document.querySelector('#name');
      const passInput = document.querySelector('#password');
      
      if (nameInput) nameInput.value = user;
      if (passInput) passInput.value = pass;
      
      // Select Read Only: No
      const readOnlyNoInput = document.querySelector('input[name="readonly"][value="no"]') || 
                            document.querySelector('input[id*="readonly"][value="no"]');
      if (readOnlyNoInput) {
        readOnlyNoInput.checked = true;
        readOnlyNoInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, username, password);
    
    // Submit
    console.log('[Puppeteer] Submitting ARI User form...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }),
      page.click('#submit')
    ]);
    
    // Apply changes
    console.log('[Puppeteer] Clicking Apply Config...');
    await applyPBXConfiguration(page);
    
    return { success: true, message: 'Usuário do ARI configurado com sucesso no PBX!' };
  } catch (error) {
    console.error('[Puppeteer] Error setting up ARI user:', error.message);
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

/**
 * Automatically edits extensions_custom.conf to add the [detect-amd] context in FreePBX
 */
export async function setupAMDDialplan(instance, cookies) {
  if (instance.toLowerCase() === 'mock') {
    return { success: true, message: 'Dialplan AMD configurado com sucesso (Mock).' };
  }

  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);
    
    const listUrl = `https://${instance}.pbxfacil.com.br/admin/config.php?display=configedit`;
    console.log(`[Puppeteer] Navigating to Config Edit: ${listUrl}`);
    await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for the tree layout to load
    await page.waitForSelector('#jstree-proton-1', { timeout: 15000 });
    
    // Find and click extensions_custom.conf
    console.log('[Puppeteer] Clicking on extensions_custom.conf in tree...');
    const clicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const targetLink = links.find(a => a.textContent.includes('extensions_custom.conf') || a.href.includes('extensions_custom.conf'));
      if (targetLink) {
        targetLink.click();
        return true;
      }
      const li = document.querySelector('li[data-file="extensions_custom.conf"] a');
      if (li) {
        li.click();
        return true;
      }
      return false;
    });

    if (!clicked) {
      throw new Error('Não foi possível encontrar o arquivo extensions_custom.conf na árvore de arquivos.');
    }
    
    // Wait for the file to load (when save button is enabled)
    console.log('[Puppeteer] Waiting for file editor to load...');
    await page.waitForFunction(() => {
      const btn = document.querySelector('#save');
      return btn && !btn.disabled;
    }, { timeout: 15000 });
    
    // Extract current content (via CodeMirror if present)
    const existingContent = await page.evaluate(() => {
      const editorEl = document.querySelector('#editor');
      if (editorEl && editorEl.CodeMirror) {
        return editorEl.CodeMirror.getValue();
      }
      return editorEl ? editorEl.value : '';
    });
    
    const hasAmd = existingContent.includes('[detect-amd]');
    const hasAmdResult = existingContent.includes('AMD_STATUS_RESULT');

    if (hasAmd && hasAmdResult) {
      console.log('[Puppeteer] Updated detect-amd dialplan already exists. Bypassing append.');
      return { success: true, message: 'O dialplan de detecção AMD já está configurado no PABX!' };
    }

    const amdCode = `\n\n[detect-amd]\nexten => s,1,NoOp(--- Iniciando Detecção de Caixa Postal ---)\nexten => s,n,Set(TARGET_CAMPAIGN_ID=\${CAMPAIGN_ID})\nexten => s,n,Set(TARGET_CAMPAIGN_PHONE=\${CAMPAIGN_PHONE})\nexten => s,n,Wait(0.8)\nexten => s,n,AMD(3000,1500,800,5000,120,50,3,256)\nexten => s,n,NoOp(Resultado AMD: \${AMDSTATUS} - Causa: \${AMDCAUSE})\nexten => s,n,UserEvent(AMDResult, CAMPAIGN_ID: \${TARGET_CAMPAIGN_ID}, CAMPAIGN_PHONE: \${TARGET_CAMPAIGN_PHONE}, AMDSTATUS: \${AMDSTATUS})\nexten => s,n,GotoIf(\$["\${AMDSTATUS}" = "HUMAN"]?human:machine)\nexten => s,n(machine),NoOp(Caixa Postal Detectada - Retornando para Stasis)\nexten => s,n,Set(__AMD_STATUS_RESULT=\${AMDSTATUS})\nexten => s,n,Stasis(dialer_app)\nexten => s,n,Hangup()\nexten => s,n(human),NoOp(Humano Detectado - Direcionando)\nexten => s,n,Goto(\${TARGET_CONTEXT},\${TARGET_EXTEN},\${TARGET_PRIORITY})\n`;

    let finalContent = existingContent;
    if (hasAmd && !hasAmdResult) {
      console.log('[Puppeteer] Replacing old AMD dialplan with updated version...');
      const idx = existingContent.indexOf('[detect-amd]');
      finalContent = existingContent.substring(0, idx) + amdCode;
    } else {
      console.log('[Puppeteer] Appending new AMD dialplan...');
      finalContent = existingContent + amdCode;
    }

    // Append content (via CodeMirror if present)
    console.log('[Puppeteer] Appending AMD dialplan code to extensions_custom.conf...');
    await page.evaluate((content) => {
      const editorEl = document.querySelector('#editor');
      const cmEl = document.querySelector('.CodeMirror');
      let myCodeMirror = null;
      if (editorEl && editorEl.CodeMirror) {
        myCodeMirror = editorEl.CodeMirror;
      } else if (cmEl && cmEl.CodeMirror) {
        myCodeMirror = cmEl.CodeMirror;
      }

      if (myCodeMirror) {
        myCodeMirror.setValue(content);
        myCodeMirror.save(); // Crucial: sync CodeMirror back to textarea!
      } else if (editorEl) {
        editorEl.value = content;
      }

      if (editorEl) {
        editorEl.dispatchEvent(new Event('input', { bubbles: true }));
        editorEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, finalContent);
    
    // Click save
    console.log('[Puppeteer] Saving extensions_custom.conf...');
    await page.click('#save');
    
    // Wait a brief moment for saving AJAX to complete
    await new Promise(r => setTimeout(r, 3000));
    
    // Apply Config
    console.log('[Puppeteer] Clicking Apply Config after dialplan update...');
    await applyPBXConfiguration(page);
    
    return { success: true, message: 'Dialplan de detecção de Caixa Postal (AMD) configurado com sucesso no PABX!' };
  } catch (error) {
    console.error('[Puppeteer] Error setting up AMD dialplan:', error.message);
    if (page) {
      try {
        const pageInfo = await page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll('input, button, a, textarea')).map(el => ({
            tagName: el.tagName,
            id: el.id,
            name: el.name,
            type: el.type,
            className: el.className,
            text: el.innerText || el.value || ''
          }));
          return { url: window.location.href, elements };
        });
        const html = await page.content();
        fs.writeFileSync('configedit_debug.json', JSON.stringify(pageInfo, null, 2), 'utf8');
        fs.writeFileSync('configedit_debug.html', html, 'utf8');
        console.log('[Puppeteer] Wrote debug info to configedit_debug.json and configedit_debug.html');
      } catch (err) {
        console.error('[Puppeteer] Failed to write failure debug details:', err.message);
      }
    }
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

/**
 * Lists all Custom Destinations from FreePBX display=customdests
 */
export async function getCustomDestinations(instance, cookies) {
  if (instance.toLowerCase() === 'mock') {
    return [
      { id: 'customdests,custom-upchat,1', name: 'Enviar para Upchat' }
    ];
  }

  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);
    const listUrl = `https://${instance}.pbxfacil.com.br/admin/config.php?display=customdests`;
    console.log(`[Puppeteer] Navigating to Custom Destinations list: ${listUrl}`);
    
    await page.goto(listUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Save debug HTML
    try {
      const htmlContent = await page.content();
      fs.writeFileSync('customdests_debug.html', htmlContent, 'utf8');
      console.log('[Puppeteer] Saved debug HTML to customdests_debug.html');
    } catch (e) {
      console.error('[Puppeteer] Failed to save debug HTML:', e.message);
    }
    
    // Wait for sidebar lists, bootstrap tables or normal tables
    await page.waitForSelector('.rxt-list a, a.list-group-item, table, #table, .bootstrap-table table', { timeout: 10000 }).catch(() => {});
    
    // Wait for bootstrap-table AJAX rows to populate (spinner / loading is gone)
    await page.waitForFunction(() => {
      const table = document.querySelector('#destgrid') || 
                    document.querySelector('.fixed-table-body table') || 
                    document.querySelector('table[data-toggle="table"]') || 
                    document.querySelector('#table') || 
                    document.querySelector('table.table-striped') || 
                    document.querySelector('table.table') || 
                    document.querySelector('table');
      if (!table) return true; // sidebar links strategy
      const rows = Array.from(table.querySelectorAll('tr')).filter(tr => tr.querySelector('td'));
      if (rows.length === 0) return true;
      const text = rows[0].innerText.toLowerCase();
      if (text.includes('loading') || text.includes('carregando') || text.includes('aguarde')) {
        return false;
      }
      return true;
    }, { timeout: 15005 }).catch(() => {});

    // Scrape basic list info first (to get destid/id and descriptions)
    const destinationsBasic = await page.evaluate(() => {
      const results = [];
      
      // Strategy 1: Sidebar list (standard for FreePBX Custom Destinations side menus)
      const sidebarLinks = Array.from(document.querySelectorAll('.rxt-list a, .right-sidebar a, #sub-navigation a, a.list-group-item'));
      for (const link of sidebarLinks) {
        const href = link.getAttribute('href') || '';
        const match = href.match(/[?&](?:id|destid)=([^&]+)/);
        if (match) {
          const id = decodeURIComponent(match[1]);
          const name = link.innerText.trim();
          if (id && !results.some(r => r.destid === id)) {
            results.push({ destid: id, description: name });
          }
        }
      }
      
      // Strategy 2: Table layout (standard or bootstrap table)
      const table = document.querySelector('#destgrid') || 
                    document.querySelector('.fixed-table-body table') || 
                    document.querySelector('table[data-toggle="table"]') || 
                    document.querySelector('#table') || 
                    document.querySelector('table.table-striped') || 
                    document.querySelector('table.table') || 
                    document.querySelector('table');
      if (table) {
        const headers = Array.from(table.querySelectorAll('thead th, tr th')).map(th => th.innerText.toLowerCase().trim());
        let descIdx = headers.findIndex(h => h.includes('destination') || h.includes('descri') || h.includes('nome'));
        
        // Fallback
        if (descIdx === -1) descIdx = 0;

        // Extract all tr elements that contain td elements (filters out the header row)
        const rows = Array.from(table.querySelectorAll('tr')).filter(tr => tr.querySelector('td'));

        for (const row of rows) {
          if (row.innerText.includes('No data') || row.innerText.includes('Nenhum registro') || row.querySelectorAll('td').length < 2) {
            continue;
          }
          const cells = Array.from(row.querySelectorAll('td'));
          const descCell = cells[descIdx];

          // Check if there is an edit link to extract targetId safely
          const link = row.querySelector('a[href*="id="]') || row.querySelector('a[href*="destid="]');
          let destid = '';
          if (link) {
            const href = link.getAttribute('href');
            const match = href.match(/[?&](?:id|destid)=([^&]+)/);
            if (match) destid = decodeURIComponent(match[1]);
          }

          const description = descCell ? descCell.innerText.trim() : 'Destino';

          if (destid && !results.some(r => r.destid === destid)) {
            results.push({ destid, description });
          }
        }
      }
      return results;
    });

    console.log(`[Puppeteer] Found ${destinationsBasic.length} custom destinations in list. Scraping form details...`);

    const finalDestinations = [];

    // Visit each edit form to extract the actual dial string (target) and notes
    for (const basic of destinationsBasic) {
      try {
        const editUrl = `https://${instance}.pbxfacil.com.br/admin/config.php?display=customdests&view=form&id=${encodeURIComponent(basic.destid)}&destid=${encodeURIComponent(basic.destid)}`;
        console.log(`[Puppeteer] Scraping target from edit page for ID ${basic.destid}: ${editUrl}`);
        
        await page.goto(editUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        
        // Wait for target field to be present
        await page.waitForSelector('input[name="customdest"], input#target', { timeout: 8000 }).catch(() => {});

        const details = await page.evaluate(() => {
          const targetInput = document.querySelector('input#target') || 
                              document.querySelector('input[name="customdest"]');
          const descInput = document.querySelector('input#description') || 
                            document.querySelector('input[name="description"]');
          const notesInput = document.querySelector('textarea[name="notes"]') || 
                             document.querySelector('textarea#notes');

          return {
            target: targetInput ? targetInput.value.trim() : '',
            description: descInput ? descInput.value.trim() : '',
            notes: notesInput ? notesInput.value.trim() : ''
          };
        });

        const targetVal = details.target || basic.destid;
        const descriptionVal = details.description || basic.description;

        finalDestinations.push({
          id: targetVal, // The actual dial string used by DID/Dialer
          description: descriptionVal,
          name: `${descriptionVal} (${targetVal})`,
          destid: basic.destid,
          notes: details.notes
        });
      } catch (err) {
        console.error(`[Puppeteer] Failed to scrape details for custom destination ${basic.destid}:`, err.message);
        finalDestinations.push({
          id: basic.destid,
          description: basic.description,
          name: `${basic.description} (${basic.destid})`,
          destid: basic.destid
        });
      }
    }

    console.log(`[Puppeteer] Extracted ${finalDestinations.length} custom destinations successfully.`);
    return finalDestinations;
  } catch (error) {
    console.error('[Puppeteer] Error listing custom destinations:', error.message);
    return [];
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

/**
 * Automate Custom Destination Creation
 */
export async function createCustomDestination(instance, cookies, data) {
  if (instance.toLowerCase() === 'mock') {
    return { success: true, message: 'Custom destination created successfully (Mock).' };
  }

  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);
    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=customdests&view=form`;
    console.log(`[Puppeteer] Navigating to create Custom Destination: ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    await page.waitForSelector('input[name="customdest"]', { timeout: 10000 });
    
    await page.type('input[name="customdest"]', data.id || data.customdest);
    await page.type('input[name="description"]', data.description || data.name);
    
    if (data.notes) {
      await page.type('textarea[name="notes"]', data.notes);
    }
    
    const submitBtnSelector = 'input[type="submit"]#submit, input[type="submit"]#save, button#submit, #submit, input[type="submit"]';
    await page.click(submitBtnSelector);
    
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    
    // Apply changes
    await applyConfig(page);
    
    return { success: true, message: 'Destino personalizado criado com sucesso.' };
  } catch (error) {
    console.error('[Puppeteer] Error creating custom destination:', error.message);
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

/**
 * Automate Custom Destination Inspection
 */
export async function inspectCustomDestination(instance, cookies, targetId) {
  if (instance.toLowerCase() === 'mock') {
    return { id: targetId, description: 'Mock Description', notes: 'Mock Notes' };
  }

  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);
    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=customdests&view=form&id=${encodeURIComponent(targetId)}`;
    console.log(`[Puppeteer] Inspecting Custom Destination: ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    await page.waitForSelector('input[name="customdest"]', { timeout: 10000 });
    
    const data = await page.evaluate(() => {
      const customdest = document.querySelector('input[name="customdest"]')?.value || '';
      const description = document.querySelector('input[name="description"]')?.value || '';
      const notes = document.querySelector('textarea[name="notes"]')?.value || '';
      return { id: customdest, description, notes };
    });
    
    return data;
  } catch (error) {
    console.error('[Puppeteer] Error inspecting custom destination:', error.message);
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

/**
 * Automate Custom Destination Editing
 */
export async function editCustomDestination(instance, cookies, targetId, data) {
  if (instance.toLowerCase() === 'mock') {
    return { success: true, message: 'Custom destination edited successfully (Mock).' };
  }

  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);
    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=customdests&view=form&id=${encodeURIComponent(targetId)}`;
    console.log(`[Puppeteer] Navigating to edit Custom Destination: ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    await page.waitForSelector('input[name="description"]', { timeout: 10000 });
    
    // Clear and type description
    await page.$eval('input[name="description"]', el => el.value = '');
    await page.type('input[name="description"]', data.description || data.name);
    
    if (data.notes !== undefined) {
      await page.$eval('textarea[name="notes"]', el => el.value = '');
      if (data.notes) {
        await page.type('textarea[name="notes"]', data.notes);
      }
    }
    
    const submitBtnSelector = 'input[type="submit"]#submit, input[type="submit"]#save, button#submit, #submit, input[type="submit"]';
    await page.click(submitBtnSelector);
    
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    
    // Apply changes
    await applyConfig(page);
    
    return { success: true, message: 'Destino personalizado editado com sucesso.' };
  } catch (error) {
    console.error('[Puppeteer] Error editing custom destination:', error.message);
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

/**
 * Automate Custom Destination Deletion
 */
export async function deleteCustomDestination(instance, cookies, targetId) {
  if (instance.toLowerCase() === 'mock') {
    return { success: true, message: 'Custom destination deleted successfully (Mock).' };
  }

  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);
    const url = `https://${instance}.pbxfacil.com.br/admin/config.php?display=customdests&view=form&id=${encodeURIComponent(targetId)}`;
    console.log(`[Puppeteer] Navigating to delete Custom Destination: ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    const deleteBtnSelector = 'input[type="submit"]#delete, input[type="button"]#delete, button#delete, #delbtn, #delete';
    await page.waitForSelector(deleteBtnSelector, { timeout: 10000 });
    
    // Handle alert dialogs (confirm delete)
    page.on('dialog', async (dialog) => {
      console.log(`[Puppeteer] Dialog detected: ${dialog.message()}. Accepting.`);
      await dialog.accept();
    });
    
    await page.click(deleteBtnSelector);
    
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    
    // Apply changes
    await applyConfig(page);
    
    return { success: true, message: 'Destino personalizado excluído com sucesso.' };
  } catch (error) {
    console.error('[Puppeteer] Error deleting custom destination:', error.message);
    throw error;
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

export async function dumpCustomDestsHTML(instance, cookies) {
  const browser = await getBrowser();
  let page;
  try {
    page = await createNewPage(browser, cookies);
    await page.goto(`https://${instance}.pbxfacil.com.br/admin/config.php?display=customdests`, { waitUntil: 'networkidle2' });
    const html = await page.content();
    fs.writeFileSync('customdests_debug.html', html, 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to dump HTML:', err.message);
    return false;
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}

export async function restoreOriginalDialplan(instance, cookies) {
  if (instance.toLowerCase() === 'mock') {
    return { success: true, message: 'Dialplan restaurado com sucesso (Mock).' };
  }

  const browser = await getBrowser();
  let page;
  try {
    const originalPath = path.resolve('extensions_custom_original.conf');
    let content = fs.readFileSync(originalPath, 'utf8');
    
    const amdCode = `\n\n[detect-amd]\nexten => s,1,NoOp(--- Iniciando Detecção de Caixa Postal ---)\nexten => s,n,Set(TARGET_CAMPAIGN_ID=\${CAMPAIGN_ID})\nexten => s,n,Set(TARGET_CAMPAIGN_PHONE=\${CAMPAIGN_PHONE})\nexten => s,n,Wait(0.8)\nexten => s,n,AMD(3000,1500,800,5000,120,50,3,256)\nexten => s,n,NoOp(Resultado AMD: \${AMDSTATUS} - Causa: \${AMDCAUSE})\nexten => s,n,UserEvent(AMDResult, CAMPAIGN_ID: \${TARGET_CAMPAIGN_ID}, CAMPAIGN_PHONE: \${TARGET_CAMPAIGN_PHONE}, AMDSTATUS: \${AMDSTATUS})\nexten => s,n,GotoIf(\$["\${AMDSTATUS}" = "HUMAN"]?human:machine)\nexten => s,n(machine),NoOp(Caixa Postal Detectada - Retornando para Stasis)\nexten => s,n,Set(__AMD_STATUS_RESULT=\${AMDSTATUS})\nexten => s,n,Stasis(dialer_app)\nexten => s,n,Hangup()\nexten => s,n(human),NoOp(Humano Detectado - Direcionando)\nexten => s,n,Goto(\${TARGET_CONTEXT},\${TARGET_EXTEN},\${TARGET_PRIORITY})\n`;
    
    content = content + amdCode;

    page = await createNewPage(browser, cookies);
    await page.goto(`https://${instance}.pbxfacil.com.br/admin/config.php?display=configedit`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    await page.waitForSelector('#jstree-proton-1', { timeout: 15000 });
    
    const clicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const targetLink = links.find(a => a.textContent.includes('extensions_custom.conf') || a.href.includes('extensions_custom.conf'));
      if (targetLink) {
        targetLink.click();
        return true;
      }
      const li = document.querySelector('li[data-file="extensions_custom.conf"] a');
      if (li) {
        li.click();
        return true;
      }
      return false;
    });

    if (!clicked) {
      throw new Error('Não foi possível encontrar o arquivo extensions_custom.conf na árvore de arquivos.');
    }
    
    await page.waitForFunction(() => {
      const btn = document.querySelector('#save');
      return btn && !btn.disabled;
    }, { timeout: 15000 });
    
    await page.evaluate((text) => {
      const editorEl = document.querySelector('#editor');
      const cmEl = document.querySelector('.CodeMirror');
      let myCodeMirror = null;
      if (editorEl && editorEl.CodeMirror) {
        myCodeMirror = editorEl.CodeMirror;
      } else if (cmEl && cmEl.CodeMirror) {
        myCodeMirror = cmEl.CodeMirror;
      }

      if (myCodeMirror) {
        myCodeMirror.setValue(text);
        myCodeMirror.save();
      } else if (editorEl) {
        editorEl.value = text;
      }

      if (editorEl) {
        editorEl.dispatchEvent(new Event('input', { bubbles: true }));
        editorEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, content);
    
    await page.click('#save');
    await new Promise(r => setTimeout(r, 3000));
    await applyPBXConfiguration(page);
    
    return { success: true, message: 'Conteúdo original restaurado e atualizado com sucesso no PABX!' };
  } finally {
    if (page) await page.close().catch(() => {});
    await browser.close();
  }
}


