import puppeteer from 'puppeteer';
import fs from 'fs';

async function run() {
  console.log('Launching interactive browser (headless: false)...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null, // fits screen
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--ignore-certificate-errors'
    ]
  });

  const page = await browser.newPage();

  // Inject mock jQuery cookie methods to prevent page crashes
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

  console.log('Navigating to smart instance...');
  
  // Use domcontentloaded to prevent long-polling hang
  await page.goto('https://smart.pbxfacil.com.br/admin/config.php', { waitUntil: 'domcontentloaded' });

  console.log('==================================================================');
  console.log('O NAVEGADOR ESTÁ ABERTO NA SUA TELA!');
  console.log('Por favor, faça o login manualmente e navegue até a tela de ramais.');
  console.log('Vou aguardar 5 minutos (300 segundos) para você fazer isso. Não feche o navegador...');
  console.log('==================================================================');

  // Wait 300 seconds (5 minutes)
  await new Promise(resolve => setTimeout(resolve, 300000));

  console.log('Tempo esgotado! Capturando o estado atual do navegador...');
  const currentUrl = page.url();
  console.log(`URL Atual: ${currentUrl}`);

  // Retrieve cookies and save them to a file
  const cookies = await page.cookies();
  fs.writeFileSync('c:/Users/GuiAschi/Desktop/Pabx2.0/cookies.json', JSON.stringify(cookies, null, 2), 'utf-8');
  console.log('Cookies salvos em: c:/Users/GuiAschi/Desktop/Pabx2.0/cookies.json');

  // Capture DOM structural selectors of tables and forms on the final page
  const domDetails = await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll('table')).map(t => ({
      id: t.id,
      className: t.className,
      headers: Array.from(t.querySelectorAll('th')).map(h => h.innerText.trim())
    }));
    return {
      title: document.title,
      tables
    };
  });

  console.log('Estrutura de tabelas encontradas:', JSON.stringify(domDetails, null, 2));

  // Save screenshot
  await page.screenshot({ path: 'c:/Users/GuiAschi/Desktop/Pabx2.0/interactive_state.png' });
  console.log('Print da tela salvo em: c:/Users/GuiAschi/Desktop/Pabx2.0/interactive_state.png');

  await browser.close();
  console.log('Navegador fechado.');
}

run().catch(console.error);
