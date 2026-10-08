// Configuración del escáner de cámara
let codeReader = null;

// Inicialización de botones al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    const searchBtn = document.getElementById('search-btn');
    const eanInput = document.getElementById('ean-input');
    const cameraBtn = document.getElementById('camera-btn');

    // Evento para botón de búsqueda manual
    if (searchBtn && eanInput) {
        searchBtn.addEventListener('click', () => {
            const ean = eanInput.value.trim();
            if (ean) buscarProducto(ean);
        });

        eanInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const ean = eanInput.value.trim();
                if (ean) buscarProducto(ean);
            }
        });
    }

    // Evento para activar/desactivar la cámara
    if (cameraBtn) {
        cameraBtn.addEventListener('click', toggleCamera);
    }
});

// Evaluación de la dieta Keto según carbohidratos
function evaluarKeto(carbs, azucares) {
    if (carbs === null || carbs === undefined || isNaN(carbs)) {
        return "❓ DATOS INCOMPLETOS";
    }
    const c = parseFloat(carbs);
    const a = parseFloat(azucares || 0);

    if (c <= 5 && a <= 2) {
        return "✅ APTO KETO (Bajo en carbohidratos)";
    } else if (c <= 10) {
        return "⚠️ CONSUMO MODERADO (Revisar porción)";
    } else {
        return "❌ NO KETO (Alto en carbohidratos)";
    }
}

// Búsqueda jerárquica: 1º Memoria Local -> 2º JSON GitHub -> 3º API Open Food Facts
async function buscarProducto(ean) {
    const statusText = document.getElementById('status-text');
    const productName = document.getElementById('product-name');
    const verdictText = document.getElementById('verdict-text');

    statusText.textContent = "Buscando información...";
    productName.textContent = EAN: ${ean};
    verdictText.textContent = "-";

    // 1. Buscar en la memoria del teléfono (Caché Local)
    const localSaved = localStorage.getItem(ean_${ean});
    if (localSaved) {
        const prod = JSON.parse(localSaved);
        productName.textContent = prod.nombre;
        statusText.textContent = Carbohidratos: ${prod.carbohidratos}g | Azúcares: ${prod.azucares}g (Guardado en dispositivo);
        verdictText.textContent = evaluarKeto(prod.carbohidratos, prod.azucares);
        return;
    }

    // 2. Buscar en el archivo productos_base.json de GitHub
    try {
        const localResponse = await fetch('productos_base.json');
        if (localResponse.ok) {
            const localData = await localResponse.json();
            if (localData[ean]) {
                const p = localData[ean];
                productName.textContent = p.nombre;
                statusText.textContent = Carbohidratos: ${p.carbohidratos}g | Azúcares: ${p.azucares}g (Base Local);
                verdictText.textContent = evaluarKeto(p.carbohidratos, p.azucares);
                return;
            }
        }
    } catch (e) {
        console.log("Continuando a la búsqueda en internet...");
    }

    // 3. Consultar la API global de Open Food Facts
    try {
        const apiResponse = await fetch(https://world.openfoodfacts.org/api/v2/product/${ean}.json);
        if (apiResponse.ok) {
            const apiData = await apiResponse.json();
            if (apiData.status === 1 && apiData.product) {
                const prod = apiData.product;
                const nombre = prod.product_name_es || prod.product_name || "Producto sin nombre";
                const nutriments = prod.nutriments || {};
                
                const carbs = nutriments.carbohydrates_100g ?? nutriments.carbohydrates;
                const azucares = nutriments.sugars_100g ?? nutriments.sugars ?? 0;

                productName.textContent = nombre;

                if (carbs !== undefined && carbs !== null) {
                    statusText.textContent = Carbohidratos: ${carbs}g / 100g | Azúcares: ${azucares}g;
                    verdictText.textContent = evaluarKeto(carbs, azucares);

                    // Guardar resultado en el teléfono del usuario
                    const itemToSave = { nombre: nombre, carbohidratos: carbs, azucares: azucares };
                    localStorage.setItem(ean_${ean}, JSON.stringify(itemToSave));
                } else {
                    statusText.textContent = "Producto encontrado pero sin datos nutricionales.";
                    verdictText.textContent = "❓ DATOS INCOMPLETOS";
                }
                return;
            }
        }
        
        productName.textContent = "Producto no encontrado";
        statusText.textContent = "El código EAN no está registrado en la base de datos.";
        verdictText.textContent = "❌ SIN REGISTRO";

    } catch (error) {
        statusText.textContent = "Error de conexión a internet.";
        verdictText.textContent = "⚠️ ERROR DE RED";
    }
}

// Control del lector de cámara ZXing
function toggleCamera() {
    const laser = document.getElementById('laser');
    const placeholder = document.getElementById('placeholder');
    const cameraBtn = document.getElementById('camera-btn');

    if (codeReader) {
        codeReader.reset();
        codeReader = null;
        if (laser) laser.style.display = 'none';
        if (placeholder) placeholder.style.display = 'block';
        if (cameraBtn) cameraBtn.textContent = 'Activar Escáner de Cámara';
        return;
    }

    if (typeof ZXing === 'undefined') {
        alert("La librería de la cámara aún no ha cargado. Inténtalo en unos segundos.");
        return;
    }

    codeReader = new ZXing.BrowserMultiFormatReader();
    if (placeholder) placeholder.style.display = 'none';
    if (laser) laser.style.display = 'block';
    if (cameraBtn) cameraBtn.textContent = 'Desactivar Cámara';

    codeReader.decodeFromVideoDevice(null, 'webcam', (result, err) => {
        if (result) {
            const eanScanned = result.getText();
            buscarProducto(eanScanned);
        }
    }).catch((err) => {
        console.error("Error al acceder a la cámara:", err);
        alert("No se pudo acceder a la cámara. Asegúrate de dar permisos en el navegador.");
        toggleCamera();
    });
}
