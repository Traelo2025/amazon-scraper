// Importar dependencias
const puppeteer = require('puppeteer');
const axios = require('axios');
const chromium = require("@sparticuz/chromium");

const browser = await puppeteer.launch({
  headless: "new",  // Modo headless requerido en Puppeteer 22+
  args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
  executablePath: process.env.CHROME_EXECUTABLE_PATH || await chromium.executablePath(),
});

// Función principal (manejador de la API)
const handler = async (req, res) => {
  try {
    // ======================================
    // 1. Validar parámetro "url"
    // ======================================
    const amazonUrl = req.query.url;
    if (!amazonUrl) {
      return res.status(400).json({ error: 'Debes enviar el parámetro "url"' });
    }

    // ======================================
    // 2. Extraer ASIN de la URL
    // ======================================
    const ASIN = amazonUrl.match(/\/dp\/([A-Z0-9]{10})/)?.[1];
    if (!ASIN) {
      return res.status(400).json({ error: 'URL de Amazon no válida. Ejemplo: https://www.amazon.com/dp/B0XXXXXXX' });
    }

    // ======================================
    // 3. Scrapear Amazon con Puppeteer
    // ======================================
    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
      ],
      executablePath: process.env.CHROME_EXECUTABLE_PATH || await chromium.executablePath(), // Usa Chromium para Vercel
    });

    const page = await browser.newPage();
    await page.goto(`https://www.amazon.com/dp/${ASIN}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000 // 30 segundos
    });

    // Extraer datos
    const productData = await page.evaluate(() => ({
      title: document.querySelector('#productTitle')?.innerText?.trim() || 'Sin título',
      price: parseFloat(
        (document.querySelector('.a-price-whole')?.innerText?.replace(/[^0-9.]/g, '') || 0
      )),
      image: document.querySelector('#landingImage')?.src || '',
    }));
    
    await browser.close();

    // ======================================
    // 4. Crear producto en Shopify
    // ======================================
    const respuesta = await axios.post(
      'https://cydteb-fc.myshopify.com/admin/api/2023-07/products.json',
      {
        product: {
          title: productData.title,
          variants: [{ price: productData.price }],
          images: [{ src: productData.image }]
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_TOKEN, // Usamos variable de entorno
          'Content-Type': 'application/json'
        }
      }
    );

    // ======================================
    // 5. Enviar respuesta con CORS habilitado
    // ======================================
    res.setHeader('Access-Control-Allow-Origin', 'https://cydteb-fc.myshopify.com');
    res.json({
      success: true,
      product: respuesta.data.product
    });

  } catch (error) {
    // Manejar errores
    res.setHeader('Access-Control-Allow-Origin', 'https://cydteb-fc.myshopify.com');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ======================================
// 6. Exportar el manejador (¡OBLIGATORIO!)
// ======================================
module.exports = handler; // <─ Esto permite que Vercel reconozca la función