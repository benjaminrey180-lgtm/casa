/* ============================================================================
   SUPERMERCADO BARRÓN · CONFIGURACIÓN CENTRAL DE ENLACES
   ----------------------------------------------------------------------------
   ESTE ES EL ÚNICO ARCHIVO QUE TIENES QUE EDITAR para cambiar cualquier enlace.

   Los campos marcados con  // TODO: REEMPLAZAR  todavía no tienen el dato real.
   Mientras estén vacíos (""), la página NO rompe: muestra un aviso discreto
   ("enlace en configuración") cuando el cliente toca esas tarjetas.
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
       Lo ideal es el "Place ID" de la ficha de Supermercado Barrón en Google:
       la tarjeta abrirá DIRECTAMENTE el formulario de estrellas.
       Cómo obtenerlo: https://developers.google.com/maps/documentation/places/web-service/place-id
       (buscador: "Place ID Finder" de Google).
       Inicio del ID: suele empezar con "ChIJ..."                            */
    googlePlaceId: "",   // TODO: REEMPLAZAR  ej: "ChIJxxxxxxxxxxxxxxxxxxx"

    /* Opcional: si ya tienes el enlace corto de reseña de Google
       (ej: https://g.page/r/XXXXXXXX/review), pégalo aquí.
       Tiene prioridad si googlePlaceId está vacío.                        */
    googleReviewUrl: "",  // TODO: REEMPLAZAR (opcional)

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
