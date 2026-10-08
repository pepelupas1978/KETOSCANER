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
    // Añadimos compatibilidad con QR Code y DataMatrix de Mercadona
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      ZXing.BarcodeFormat.EAN_13,
      ZXing.BarcodeFormat.EAN_8,
      ZXing.BarcodeFormat.UPC_A,
      ZXing.BarcodeFormat.QR_CODE,
      ZXing.BarcodeFormat.DATA_MATRIX
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

// Función para extraer el código de producto de un QR interno de Mercadona
function parseMercadonaQR(qrText) {
  // Los QR de Mercadona suelen empezar por (01) o contener identificadores GS1
  if (qrText.includes('010') || qrText.startsWith('01') || qrText.length > 20) {
    // Extrae la secuencia numérica principal del producto
    const match = qrText.match(/01(\d{14})/);
    if (match) {
      return match[1];
    }
  }
  return qrText;
}

async function fetchProductData(barcode) {
  if (isProcessing) return;
  isProcessing = true;
  
  // Limpiamos el código en caso de ser un QR de Mercadona
  const cleanCode = parseMercadonaQR(barcode);
  lastScannedBarcode = barcode;
  
  playBeep();

  const productName = document.getElementById('product-name');
  const statusText = document.getElementById('status-text');
  const verdictText = document.getElementById('verdict-text');

  productName.textContent = "Consultando base de datos...";
  statusText.textContent = `Código: ${cleanCode}`;
  verdictText.textContent = "PROCESANDO";
  verdictText.style.color = "#eab308";
  verdictText.style.background = "#1e293b";

  // 1. Memoria Local / Base de datos interna (Ideal para carnes/frescos de Mercadona)
  try {
    const localResponse = await fetch('productos_base.json');
    if (localResponse.ok) {
      const localData = await localResponse.json();
      if (localData[cleanCode] || localData[barcode]) {
        const p = localData[cleanCode] || localData[barcode];
        productName.textContent = p.nombre;
        evaluateKeto(p.carbohidratos, p.azucares ?? 0);
        isProcessing = false;
        return;
      }
    }
  } catch (e) {}

  // Detectar si es carne/fresco no registrado de Mercadona
  const isInternalQR = barcode.length > 15 || barcode !== cleanCode;

  // 2. Open Food Facts
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${cleanCode}.json`);
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
      if (isInternalQR) {
        // En carnes frescas de Mercadona sin procesar (vacuno, cerdo, pollo), casi siempre es 0g carbohidratos
        productName.textContent = "Producto fresco / Mercadona";
        statusText.textContent = "QR interno detectado (Carne/Pescado fresco)";
        verdictText.textContent = "APTO KETO (FRESCO)";
        verdictText.style.color = "#22c55e";
        verdictText.style.background = "rgba(34, 197, 94, 0.1)";
      } else {
        productName.textContent = "Producto no encontrado";
        statusText.textContent = `El código ${cleanCode} no está registrado`;
        verdictText.textContent = "NO REGISTRADO";
        verdictText.style.color = "#94a3b8";
      }
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

  productName.textContent = 'Encuadra el código o QR';
  statusText.textContent = 'Buscando código/QR...';
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
  statusText.textContent = 'Apunta al código o QR de un producto';
  verdictText.textContent = "-";
  verdictText.style.color = "#94a3b8";
  verdictText.style.background = "#1e293b";

  cameraBtn.textContent = 'Activar Escáner de Cámara';
  cameraBtn.classList.remove('active');
  isScanning = false;
  lastScannedBarcode = null;
  isProcessing = false;
}
