import puppeteer from 'puppeteer';

async function run() {
  console.log('[DEBUG] Launching Puppeteer...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();
  
  // Inject mock jQuery cookie patch to prevent crashes
  await page.evaluateOnNewDocument(() => {
    let jq;
    const patchJQuery = (val) => {
      jq = val;
      if (jq) {
        if (!jq.removeCookie) jq.removeCookie = () => {};
        if (!jq.cookie) jq.cookie = () => {};
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

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('[DEBUG] Navigating to login...');
  await page.goto('https://smart.pbxfacil.com.br/admin/config.php', { waitUntil: 'domcontentloaded' });
  await new Promise(resolve => setTimeout(resolve, 2000));

  const needLogin = await page.evaluate(() => {
    return !!document.querySelector('#login_admin') || !!document.querySelector('input[name="username"]');
  });

  if (needLogin) {
    console.log('[DEBUG] Login required. Performing login...');
    const hasAdminBtn = !!document.querySelector('#login_admin');
    if (hasAdminBtn) {
      await page.click('#login_admin');
      await page.waitForSelector('input[name="username"]', { visible: true });
    }

    await page.type('input[name="username"]', 'parceiro');
    await page.type('input[name="password"]', 'L6asVa5$tVZTT87M');
    
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('input[type="submit"], button[type="submit"], #loginform input[type="button"], #loginform input[type="submit"]')
    ]);
    console.log('[DEBUG] Login complete. URL is:', page.url());
  } else {
    console.log('[DEBUG] Already logged in? URL:', page.url());
  }

  console.log('[DEBUG] Navigating to Inbound Routes (display=did)...');
  await page.goto('https://smart.pbxfacil.com.br/admin/config.php?display=did', { waitUntil: 'networkidle2' });

  // Let's inspect the page content
  const pageDetails = await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll('table')).map(t => {
      return {
        id: t.id,
        className: t.className,
        headers: Array.from(t.querySelectorAll('thead th')).map(th => th.innerText.trim()),
        rowsCount: t.querySelectorAll('tbody tr').length
      };
    });
    
    // Dump outerHTML of the first row of table if table exists
    const mainTable = document.querySelector('#didtable') || 
                      document.querySelector('#table') || 
                      document.querySelector('.bootstrap-table table') || 
                      document.querySelector('table[data-toggle="table"]');
    
    let firstRowHTML = 'No table found';
    if (mainTable) {
      const firstRow = mainTable.querySelector('tbody tr');
      firstRowHTML = firstRow ? firstRow.outerHTML : 'Table has no rows';
    }

    return {
      url: window.location.href,
      bodyTextLength: document.body.innerText.length,
      tables,
      firstRowHTML
    };
  });

  console.log('[DEBUG] Page Details:', JSON.stringify(pageDetails, null, 2));

  await browser.close();
}

run().catch(console.error);
