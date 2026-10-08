const cameraBtn = document.getElementById('camera-btn');
const searchBtn = document.getElementById('search-btn');
const eanInput = document.getElementById('ean-input');
const video = document.getElementById('webcam');
const laser = document.getElementById('laser');
const placeholder = document.getElementById('placeholder');
const productName = document.getElementById('product-name');
const statusText = document.getElementById('status-text');
const verdictText = document.getElementById('verdict-text');

let codeReader = null;
let isScanning = false;
let lastScannedBarcode = null;
let isProcessing = false; // Evita peticiones duplicadas consecutivas

// Tono de confirmación cuando escanea correctamente
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

if (typeof ZXing !== 'undefined') {
  // Configuración optimizada para EAN y lectura en directo
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.EAN_13,
    ZXing.BarcodeFormat.EAN_8,
    ZXing.BarcodeFormat.UPC_A
  ]);
  codeReader = new ZXing.BrowserMultiFormatReader(hints);
}

// Consulta a Open Food Facts
async function fetchProductData(barcode) {
  if (isProcessing) return;
  isProcessing = true;
  lastScannedBarcode = barcode;
  
  playBeep();

  productName.textContent = "Consultando base de datos...";
  statusText.textContent = EAN: ${barcode};
  verdictText.textContent = "PROCESANDO";
  verdictText.style.color = "#eab308";
  verdictText.style.background = "#1e293b";

  try {
    const response = await fetch(https://world.openfoodfacts.org/api/v0/product/${barcode}.json);
    const data = await response.json();

    if (data.status === 1 && data.product) {
      const p = data.product;
      const name = p.product_name || p.product_name_es || "Producto sin nombre";
      const carbs = p.nutriments && p.nutriments['carbohydrates_100g'] !== undefined 
        ? p.nutriments['carbohydrates_100g'] 
        : null;

      productName.textContent = name;

      if (carbs !== null) {
        evaluateKeto(carbs);
      } else {
        statusText.textContent = "Sin datos de carbohidratos desglosados";
        verdictText.textContent = "INDETERMINADO";
        verdictText.style.color = "#94a3b8";
      }
    } else {
      productName.textContent = "Producto no encontrado";
      statusText.textContent = El código ${barcode} no está en Open Food Facts;
      verdictText.textContent = "NO REGISTRADO";
      verdictText.style.color = "#94a3b8";
    }
  } catch (error) {
    productName.textContent = "Error de conexión";
    statusText.textContent = "Comprueba tu conexión a internet";
    verdictText.textContent = "ERROR";
    verdictText.style.color = "#ef4444";
  } finally {
    // Permitir nuevo escaneo tras 2 segundos
    setTimeout(() => {
      isProcessing = false;
    }, 2000);
  }
}

// Evaluación Keto UE
function evaluateKeto(carbs) {
  statusText.textContent = Carbohidratos (UE): ${carbs}g por cada 100g;

  if (carbs <= 5.0) {
    verdictText.textContent = "APTO KETO";
    verdictText.style.color = "#22c55e";
    verdictText.style.background = "rgba(34, 197, 94, 0.1)";
  } else if (carbs <= 10.0) {
    verdictText.textContent = "PRECAUCIÓN / MODERADO";
    verdictText.style.color = "#eab308";
    verdictText.style.background = "rgba(234, 179, 8, 0.1)";
  } else {
    verdictText.textContent = "NO APTO KETO";
    verdictText.style.color = "#ef4444";
    verdictText.style.background = "rgba(239, 68, 68, 0.1)";
  }
}

// Control del Escáner
cameraBtn.addEventListener('click', () => {
  if (!isScanning) {
    startCamera();
  } else {
    stopCamera();
  }
});

function startCamera() {
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

  // Escaneo continuo optimizado
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

// Búsqueda Manual
searchBtn.addEventListener('click', () => {
  const code = eanInput.value.trim();
  if (code) {
    isProcessing = false;
    fetchProductData(code);
  }
});
