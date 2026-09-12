/* ============================================================================
   SUPERMERCADO BARRÓN · CONFIGURACIÓN CENTRAL DE ENLACES
   ----------------------------------------------------------------------------
   ESTE ES EL ÚNICO ARCHIVO QUE TIENES QUE EDITAR para cambiar cualquier enlace.
   Se edita con cualquier editor de texto (Bloc de notas incluido) y no rompe nada.

   ESTADO ACTUAL (lo que falta completar):
     ⬜ 1. enlaces.googleReviewUrl  ... tu enlace corto de reseña de Google
     ⬜ 2. enlaces.whatsappNumero   ... número de WhatsApp del supermercado
     ⬜ 3. enlaces.whatsappComunidad... canal de WhatsApp "Comunidad Barrón"
     ⬜ 4. enlaces.ionGroup         ... contacto de ION GROUP (opcional)

   Mientras un campo esté vacío (""), la página NO rompe: muestra un aviso
   discreto "config. pendiente" y, al tocar, el mensaje
   "Este enlace se está configurando. ¡Pronto estará disponible!".
   ============================================================================ */

window.BARRON_CONFIG = {

  /* ---------- Datos del negocio (textos visibles) ---------- */
  negocio: {
    nombre:        "SUPERMERCADO BARRÓN",
    saludo:        "¡HOLA, FAMILIA BARRÓN!",
    tagline:       "Más cerca de ti",
    descripcion:   "Precios bajos todo el año · Ofertas, sorteos y productos frescos",
    direccion:     "Arturo Prat #862, Coihueco",
    horarioApertura: "09:00",   // formato 24 h
    horarioCierre:   "20:30",   // formato 24 h
    zonaHoraria:   "America/Santiago"
  },

  /* ---------- Enlaces (botones y tarjetas) ---------- */
  enlaces: {

    /* 1) RESEÑA EN GOOGLE ----------------------------------------------------
       ← PEGA AQUÍ TU ENLACE CORTO DE RESEÑA. Acepta dos formatos:

       a) Enlace corto (el más simple):
          https://g.page/r/XXXXXXXXXXXXXXXX/review
          o  https://search.google.com/local/reviews?placeid=ChIJ...

          Dónde conseguirlo: Google Maps → busca "Supermercado Barrón Coihueco"
          → botón Compartir / "Pedir reseñas" (si administras la ficha) → copiar.
          OJO: usa el enlace que termina en /review (ese abre el formulario
          de estrellas). Un enlace normal de Maps solo muestra la ficha.

       b) Place ID (opcional, más técnico): si lo tienes, la página arma sola
          el enlace que abre DIRECTAMENTE el formulario de estrellas.
          Se obtiene en el "Place ID Finder" de Google. Empieza con "ChIJ".   */
    googleReviewUrl: "",  // ⬅ PEGA AQUÍ tu enlace corto  · TODO: REEMPLAZAR
    googlePlaceId:   "",  // opcional: "ChIJ..."         · TODO: REEMPLAZAR

    /* 2) WHATSAPP -----------------------------------------------------------
       Número del supermercado con código de país, SIN "+", espacios ni guiones.
       Ejemplo Chile: 56 9 1234 5678  ->  "56912345678"                       */
    whatsappNumero: "",   // TODO: REEMPLAZAR  ej: "56912345678"
    whatsappMensaje: "¡Hola, Familia Barrón! Quisiera hacer una consulta.",

    /* 3) INSTAGRAM ---------------------------------------------------------- */
    instagram: "https://www.instagram.com/barron.cl/",

    /* 4) COMUNIDAD BARRÓN (canal oficial de WhatsApp) -----------------------
       Enlace de invitación del canal: https://whatsapp.com/channel/XXXXXXXX   */
    whatsappComunidad: "",  // TODO: REEMPLAZAR

    /* 5) GOOGLE MAPS -------------------------------------------------------- */
    googleMaps: "https://www.google.com/maps/search/?api=1&query=Arturo%20Prat%20862%2C%20Coihueco",

    /* 6) OFERTAS Y SORTEOS --------------------------------------------------
       Déjalo vacío ("") para que use el Instagram automáticamente.
       O pega aquí el enlace del canal de WhatsApp / sección de ofertas.    */
    ofertas: "",   // vacío = usa Instagram

    /* 7) ION GROUP (desarrollador) ------------------------------------------
       Instagram, WhatsApp o sitio web de ION GROUP.                        */
    ionGroup: "",  // TODO: REEMPLAZAR (opcional)

    /* ---------- Comportamiento ---------- */
    /* true  = las tarjetas sin enlace configurado se ocultan
                (útil si publicas antes de tener todos los datos).
       false = se muestran y avisan "enlace en configuración".            */
    ocultarEnlacesPendientes: false
  },

  /* ---------- Textos de aviso ---------- */
  mensajes: {
    pendiente:    "Este enlace se está configurando. ¡Pronto estará disponible!",
    compartido:   "¡Gracias por compartir, Familia Barrón!",
    copiado:      "Enlace copiado. ¡Compártelo por WhatsApp!",
    compartirError: "No pudimos abrir el menú de compartir. Copia el enlace manualmente."
  }
};
