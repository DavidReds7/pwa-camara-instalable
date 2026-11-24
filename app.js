// app.js - Instalabilidad + acceso ético a cámara (Pre-Permiso UX).
// Asincronía resuelta solo con Promesas: then / catch / finally.

// ---------- Service Worker ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then((reg) => console.log('[App] SW registrado. Scope:', reg.scope))
    .catch((err) => console.error('[App] Error registrando SW:', err));
}

// ---------- Instalabilidad ----------
const btnInstalar = document.getElementById('btn-instalar');
const avisoIOS = document.getElementById('aviso-ios');
let eventoInstalacionDiferido = null;

function estaInstalada() {
  return window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
}

function esIOS() {
  const ua = navigator.userAgent;
  // iPadOS 13+ se identifica como Mac; se distingue por pantalla táctil.
  return /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Android / Chrome / Edge: se intercepta el evento y se ofrece un botón propio.
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  eventoInstalacionDiferido = event;
  btnInstalar.hidden = false;
});

btnInstalar.addEventListener('click', () => {
  if (!eventoInstalacionDiferido) return;

  eventoInstalacionDiferido.prompt();
  eventoInstalacionDiferido.userChoice
    .then((resultado) => {
      console.log('[App] Resultado de instalación:', resultado.outcome);
      if (resultado.outcome === 'accepted') {
        btnInstalar.hidden = true;
      }
    })
    .catch((err) => console.error('[App] Error en instalación:', err))
    .finally(() => {
      // El evento solo puede usarse una vez
      eventoInstalacionDiferido = null;
    });
});

window.addEventListener('appinstalled', () => {
  btnInstalar.hidden = true;
  avisoIOS.hidden = true;
});

// iOS / Safari: nunca dispara beforeinstallprompt -> instrucciones manuales.
if (esIOS() && !estaInstalada()) {
  avisoIOS.hidden = false;
}

// ---------- Cámara ----------
const visorVideo = document.getElementById('visor-camara');
const estado = document.getElementById('estado');
const avisoPermiso = document.getElementById('aviso-permiso');
const lenteSolicitado = document.getElementById('lente-solicitado');
const btnPreparar = document.getElementById('btn-preparar-camara');
const btnAlternar = document.getElementById('btn-alternar-camara');
const btnApagar = document.getElementById('btn-apagar-camara');

let streamActual = null;
let modoCamaraActual = 'environment'; // 'environment' = trasera | 'user' = frontal

function nombreLente(modo) {
  return modo === 'environment' ? 'Trasera' : 'Frontal';
}

function actualizarMensajeEstado(texto) {
  estado.textContent = texto;
}

function actualizarBotones() {
  const activa = streamActual !== null;
  btnAlternar.disabled = !activa;
  btnApagar.disabled = !activa;
}

// Libera el sensor: obligatorio antes de abrir otro lente.
function detenerCamaraActiva() {
  if (streamActual) {
    streamActual.getTracks().forEach((track) => {
      track.stop();
    });
    streamActual = null;
  }
}

function iniciarCamara(modo) {
  detenerCamaraActiva();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    actualizarMensajeEstado('Este navegador no soporta acceso a cámara (se requiere HTTPS).');
    actualizarBotones();
    return Promise.resolve();
  }

  const restricciones = {
    video: { facingMode: modo },
    audio: false
  };

  return navigator.mediaDevices.getUserMedia(restricciones)
    .then((stream) => {
      streamActual = stream;
      visorVideo.srcObject = stream;
      // Algunos Safari no arrancan el autoplay: se fuerza play() y se ignora su rechazo.
      const intento = visorVideo.play();
      if (intento && intento.catch) intento.catch(() => {});
      actualizarMensajeEstado('Cámara activa (' + nombreLente(modo) + ')');
    })
    .catch((error) => {
      if (error.name === 'NotAllowedError') {
        actualizarMensajeEstado('Permiso denegado. Habilita el acceso a la cámara en los ajustes de tu navegador.');
      } else if (error.name === 'NotFoundError') {
        actualizarMensajeEstado('No se detectó el sensor de cámara solicitado en este dispositivo.');
      } else if (error.name === 'NotReadableError') {
        actualizarMensajeEstado('La cámara está siendo usada por otra aplicación.');
      } else {
        actualizarMensajeEstado('Error al acceder al hardware: ' + error.message);
      }
    })
    .finally(() => {
      actualizarBotones();
    });
}

// Paso 1: aviso explicativo (aún NO se toca el hardware).
btnPreparar.addEventListener('click', () => {
  lenteSolicitado.textContent = nombreLente(modoCamaraActual).toLowerCase();
  avisoPermiso.hidden = false;
});

// Paso 2: consentimiento consciente -> ahora sí se dispara el diálogo nativo.
document.getElementById('btn-confirmar-permiso').addEventListener('click', () => {
  avisoPermiso.hidden = true;
  iniciarCamara(modoCamaraActual);
});

document.getElementById('btn-cancelar-permiso').addEventListener('click', () => {
  avisoPermiso.hidden = true;
  actualizarMensajeEstado('Sin permiso: la cámara permanece apagada.');
});

btnAlternar.addEventListener('click', () => {
  modoCamaraActual = modoCamaraActual === 'environment' ? 'user' : 'environment';
  iniciarCamara(modoCamaraActual);
});

btnApagar.addEventListener('click', () => {
  detenerCamaraActiva();
  visorVideo.srcObject = null;
  actualizarMensajeEstado('La cámara está apagada.');
  actualizarBotones();
});

// Libera el sensor si la página se oculta o se cierra.
window.addEventListener('pagehide', detenerCamaraActiva);
