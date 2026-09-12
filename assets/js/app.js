/* ============================================================================
   SUPERMERCADO BARRÓN · Lógica de la página
   Lee assets/js/config.js y conecta cada botón con su enlace real.
   Sin dependencias · sin frameworks · pensado para redes móviles lentas.
   ============================================================================ */
(function () {
  'use strict';

  var CFG = window.BARRON_CONFIG || {};
  var L   = CFG.enlaces  || {};
  var N   = CFG.negocio  || {};
  var M   = CFG.mensajes || {};

  /* ---------------------------------------------------------------- Utilidades */
  function $(id) { return document.getElementById(id); }

  function isSet(v) { return typeof v === 'string' && v.trim() !== ''; }

  function normalizarWhatsApp(numero) {
    var soloDigitos = String(numero).replace(/[^0-9]/g, '');
    if (!soloDigitos) return '';
    return 'https://wa.me/' + soloDigitos +
           (isSet(L.whatsappMensaje) ? '?text=' + encodeURIComponent(L.whatsappMensaje) : '');
  }

  function urlResenaGoogle() {
    // 1º el enlace corto de reseña (abre directo el formulario de estrellas)
    if (isSet(L.googleReviewUrl)) return L.googleReviewUrl.trim();
    // 2º el Place ID, si lo prefieres
    if (isSet(L.googlePlaceId)) {
      return 'https://search.google.com/local/writereview?placeid=' +
             encodeURIComponent(L.googlePlaceId.trim());
    }
    return ''; // sin configurar -> se usa el respaldo del HTML (búsqueda en Maps)
  }

  /* Aviso flotante breve */
  var toastEl = $('toast');
  var toastTimer = null;
  function toast(mensaje) {
    if (!toastEl || !mensaje) return;
    toastEl.textContent = mensaje;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-visible'); }, 3800);
  }

  /* ---------------------------------------------------------------- Enlaces */
  function aplicar(id, url, pendiente) {
    var el = $(id);
    if (!el) return null;

    if (isSet(url)) {
      el.setAttribute('href', url);
      return el;
    }

    // Sin enlace configurado todavía
    if (pendiente) {
      if (L.ocultarEnlacesPendientes === true) {
        el.classList.add('is-hidden');
      } else {
        el.classList.add('is-pending');
        el.setAttribute('href', '#');
        el.addEventListener('click', function (ev) {
          ev.preventDefault();
          toast(M.pendiente || 'Enlace en configuración.');
        });
      }
    }
    return el;
  }

  /* 2) Reseña en Google ------------------------------------------------ */
  var reviewUrl = urlResenaGoogle();
  var reviewCard = $('reviewCard');
  if (reviewCard && isSet(reviewUrl)) reviewCard.setAttribute('href', reviewUrl);

  /* 4) Tarjetas principales ------------------------------------------- */
  aplicar('tileWhatsapp',  normalizarWhatsApp(L.whatsappNumero), true);
  aplicar('tileInstagram', isSet(L.instagram) ? L.instagram : 'https://www.instagram.com/barron.cl/', true);
  aplicar('tileComunidad', L.whatsappComunidad, true);
  aplicar('tileMaps',      L.googleMaps, true);

  /* 5) Ofertas y sorteos ----------------------------------------------
     Ya NO apunta a Instagram. Solo se activa cuando hay un destino real
     (página de ofertas, canal de WhatsApp, etc.).
     Para quitar la tarjeta del todo: mostrarOfertas: false en config.js  */
  if (L.mostrarOfertas === false) {
    var offersBlock = $('offersBlock');
    if (offersBlock) offersBlock.classList.add('is-hidden');
  } else {
    aplicar('offersCard', L.ofertas, true);
  }

  /* 6) Dirección ------------------------------------------------------ */
  var addressCard = $('addressCard');
  if (addressCard && isSet(L.googleMaps)) addressCard.setAttribute('href', L.googleMaps);

  /* 7) ION GROUP ------------------------------------------------------ */
  var ionLink = $('ionLink');
  if (ionLink) {
    if (isSet(L.ionGroup)) {
      ionLink.setAttribute('href', L.ionGroup);
    } else {
      ionLink.removeAttribute('target');
      ionLink.addEventListener('click', function (ev) { ev.preventDefault(); });
    }
  }

  /* 3) Compartir (Web Share API + respaldo) --------------------------- */
  var shareBtn = $('shareBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', function () {
      var datos = {
        title: 'SUPERMERCADO BARRÓN · ¡Hola, Familia Barrón!',
        text:  'Barrón, más cerca de ti. Precios bajos todo el año · Ofertas, sorteos y productos frescos.',
        url:   window.location.href
      };

      if (navigator.share) {
        navigator.share(datos).then(function () {
          toast(M.compartido || '¡Gracias por compartir!');
        }).catch(function () { /* el usuario canceló: no molestamos */ });
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(datos.url)
          .then(function () { toast(M.copiado || 'Enlace copiado.'); })
          .catch(function () { toast(M.compartirError || 'Copia el enlace manualmente.'); });
        return;
      }
      window.prompt('Copia este enlace para compartir:', datos.url);
    });
  }

  /* Horario: estado "abierto / cerrado" en hora de Chile ----------------- */
  (function horario() {
    var pill = $('hoursPill');
    var txt  = $('hoursText');
    if (!pill || !txt) return;

    var abre  = isSet(N.horarioApertura) ? N.horarioApertura : '09:00';
    var cierra= isSet(N.horarioCierre)   ? N.horarioCierre   : '20:30';
    var rango = 'Hoy de ' + abre + ' a ' + cierra;
    txt.textContent = rango;

    try {
      var partes = new Intl.DateTimeFormat('es-CL', {
        timeZone: N.zonaHoraria || 'America/Santiago',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).format(new Date()).split(':');
      var ahora  = parseInt(partes[0], 10) * 60 + parseInt(partes[1], 10);
      var aMin   = parseInt(abre.split(':')[0], 10)   * 60 + parseInt(abre.split(':')[1], 10);
      var cMin   = parseInt(cierra.split(':')[0], 10) * 60 + parseInt(cierra.split(':')[1], 10);
      var abierto = ahora >= aMin && ahora < cMin;

      pill.setAttribute('data-open', abierto ? 'true' : 'false');
      txt.textContent = abierto
        ? 'Abierto ahora · ' + abre + ' a ' + cierra
        : 'Cerrado ahora · ' + rango;
    } catch (e) {
      /* Navegador antiguo: dejamos el texto simple sin estado en vivo */
    }
  })();

  /* Mascota: acepta .png, .jpg, .jpeg, .webp o .svg con el mismo nombre ---- */
  (function logo() {
    var img  = $('brandLogo');
    var slot = $('logoSlot');
    if (!img || !slot) return;

    var candidatos = [
      'assets/img/logo-barron.png',
      'assets/img/logo-barron.jpg',
      'assets/img/logo-barron.jpeg',
      'assets/img/logo-barron.webp',
      'assets/img/logo-barron.svg'
    ];
    var intento = 0;

    // Arranca desde el archivo que ya viene en el HTML
    var actual = img.getAttribute('src');
    var pos = candidatos.indexOf(actual);
    if (pos > -1) intento = pos;

    img.addEventListener('error', function () {
      intento++;
      if (intento < candidatos.length) {
        img.setAttribute('src', candidatos[intento]); // prueba el siguiente formato
        return;
      }
      img.hidden = true;      // sin logo: se muestra la reserva, nunca otra mascota
      slot.hidden = false;
    });

    img.addEventListener('load', function () {
      img.hidden = false;
      slot.hidden = true;
    });
  })();

})();
