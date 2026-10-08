let codeReader = null;
let isScanning = false;
let lastScannedBarcode = null;
let isProcessing = false;

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch(e){}
}

document.addEventListener('DOMContentLoaded', () => {
  const cameraBtn = document.getElementById('camera-btn');
  const searchBtn = document.getElementById('search-btn');
  const eanInput = document.getElementById('ean-input');

  if (typeof ZXing !== 'undefined') {
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      ZXing.BarcodeFormat.EAN_13,
      ZXing.BarcodeFormat.EAN_8,
      ZXing.BarcodeFormat.UPC_A
    ]);
    codeReader = new ZXing.BrowserMultiFormatReader(hints);
  }

  if (cameraBtn) {
    cameraBtn.addEventListener('click', () => {
      if (!isScanning) {
        startCamera();
      } else {
        stopCamera();
      }
    });
  }

  if (searchBtn && eanInput) {
    searchBtn.addEventListener('click', () => {
      const code = eanInput.value.trim();
      if (code) {
        isProcessing = false;
        fetchProductData(code);
      }
    });

    eanInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const code = eanInput.value.trim();
        if (code) {
          isProcessing = false;
          fetchProductData(code);
        }
      }
    });
  }
});

async function fetchProductData(barcode) {
  if (isProcessing) return;
  isProcessing = true;
  lastScannedBarcode = barcode;
  
  playBeep();

  const productName = document.getElementById('product-name');
  const statusText = document.getElementById('status-text');
  const verdictText = document.getElementById('verdict-text');

  productName.textContent = "Consultando base de datos...";
  statusText.textContent = `EAN: ${barcode}`;
  verdictText.textContent = "PROCESANDO";
  verdictText.style.color = "#eab308";
  verdictText.style.background = "#1e293b";

  // 1. Memoria Local / Base de datos interna
  try {
    const localResponse = await fetch('productos_base.json');
    if (localResponse.ok) {
      const localData = await localResponse.json();
      if (localData[barcode]) {
        const p = localData[barcode];
        productName.textContent = p.nombre;
        evaluateKeto(p.carbohidratos, p.azucares ?? 0);
        isProcessing = false;
        return;
      }
    }
  } catch (e) {}

  // 2. Open Food Facts
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
    const data = await response.json();

    if (data.status === 1 && data.product) {
      const p = data.product;
      const name = p.product_name_es || p.product_name || "Producto sin nombre";
      const carbs = p.nutriments ? (p.nutriments['carbohydrates_100g'] ?? p.nutriments['carbohydrates']) : null;
      const sugars = p.nutriments ? (p.nutriments['sugars_100g'] ?? p.nutriments['sugars'] ?? 0) : 0;

      productName.textContent = name;

      if (carbs !== null && carbs !== undefined) {
        evaluateKeto(carbs, sugars);
      } else {
        statusText.textContent = "Sin datos de carbohidratos desglosados";
        verdictText.textContent = "INDETERMINADO";
        verdictText.style.color = "#94a3b8";
      }
    } else {
      productName.textContent = "Producto no encontrado";
      statusText.textContent = `El código ${barcode} no está registrado`;
      verdictText.textContent = "NO REGISTRADO";
      verdictText.style.color = "#94a3b8";
    }
  } catch (error) {
    productName.textContent = "Error de conexión";
    statusText.textContent = "Comprueba tu conexión a internet";
    verdictText.textContent = "ERROR";
    verdictText.style.color = "#ef4444";
  } finally {
    setTimeout(() => {
      isProcessing = false;
    }, 2000);
  }
}

function evaluateKeto(carbs, sugars = 0) {
  const statusText = document.getElementById('status-text');
  const verdictText = document.getElementById('verdict-text');

  statusText.textContent = `Carbs: ${carbs}g | Azúcares: ${sugars}g (por 100g)`;

  // Evaluación con filtro estricto para azúcares libres y zumos
  if (sugars > 3.0 || carbs > 5.0) {
    verdictText.textContent = "NO APTO KETO";
    verdictText.style.color = "#ef4444";
    verdictText.style.background = "rgba(239, 68, 68, 0.1)";
  } else if (carbs > 2.5 || sugars > 1.5) {
    verdictText.textContent = "PRECAUCIÓN / MODERADO";
    verdictText.style.color = "#eab308";
    verdictText.style.background = "rgba(234, 179, 8, 0.1)";
  } else {
    verdictText.textContent = "APTO KETO";
    verdictText.style.color = "#22c55e";
    verdictText.style.background = "rgba(34, 197, 94, 0.1)";
  }
}

function startCamera() {
  const video = document.getElementById('webcam');
  const laser = document.getElementById('laser');
  const placeholder = document.getElementById('placeholder');
  const cameraBtn = document.getElementById('camera-btn');
  const productName = document.getElementById('product-name');
  const statusText = document.getElementById('status-text');
  const verdictText = document.getElementById('verdict-text');

  if (!codeReader) {
    alert("Cargando componentes... Reintentar.");
    return;
  }

  video.style.display = 'block';
  laser.style.display = 'block';
  placeholder.style.display = 'none';

  productName.textContent = 'Encuadra el código de barras';
  statusText.textContent = 'Buscando código...';
  verdictText.textContent = "-";
  verdictText.style.color = "#94a3b8";

  cameraBtn.textContent = 'Detener Cámara';
  cameraBtn.classList.add('active');
  isScanning = true;

  codeReader.decodeFromVideoDevice(undefined, 'webcam', (result, err) => {
    if (result && result.getText() !== lastScannedBarcode && !isProcessing) {
      fetchProductData(result.getText());
    }
  }).catch((err) => {
    alert("Permiso de cámara denegado o no disponible.");
    stopCamera();
  });
}

function stopCamera() {
  const video = document.getElementById('webcam');
  const laser = document.getElementById('laser');
  const placeholder = document.getElementById('placeholder');
  const cameraBtn = document.getElementById('camera-btn');
  const productName = document.getElementById('product-name');
  const statusText = document.getElementById('status-text');
  const verdictText = document.getElementById('verdict-text');

  if (codeReader) {
    codeReader.reset();
  }
  video.style.display = 'none';
  laser.style.display = 'none';
  placeholder.style.display = 'block';

  productName.textContent = 'Esperando lectura...';
  statusText.textContent = 'Apunta al código EAN de un producto';
  verdictText.textContent = "-";
  verdictText.style.color = "#94a3b8";
  verdictText.style.background = "#1e293b";

  cameraBtn.textContent = 'Activar Escáner de Cámara';
  cameraBtn.classList.remove('active');
  isScanning = false;
  lastScannedBarcode = null;
  isProcessing = false;
}
