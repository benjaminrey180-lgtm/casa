# SUPERMERCADO BARRÓN · Página NFC / QR

Página móvil para tarjeta **NFC / código QR** de Supermercado Barrón (Arturo Prat #862, Coihueco).
Misma estructura y lenguaje visual del sistema **ION GROUP** (familia *Capital's Barber*),
con la identidad propia de Barrón: **fondo blanco** y la paleta corporativa
**rojo rey `#C8102E` + amarillo rey `#FFC72C` + azul rey `#0B4EA2` + blanco**,
más el degradado amarillo → naranja → rojo en detalles y bordes.

```
casa/
├── index.html                 · la página completa (todo el contenido)
├── manifest.webmanifest       · para "Agregar a pantalla de inicio"
├── assets/
│   ├── css/styles.css         · diseño, animaciones, responsive
│   ├── js/config.js           · ★ ÚNICO ARCHIVO A EDITAR PARA LOS ENLACES
│   ├── js/app.js              · lógica (enlaces, compartir, horario)
│   └── img/
│       ├── logo-barron.png    · ← COLOCA AQUÍ LA MASCOTA (ver LEEME-*.txt)
│       └── favicon.svg        · ícono de pestaña
└── README.md
```

---

## 1. Colocar la mascota

Guarda el PNG **original con fondo transparente** en `assets/img/` con el nombre
`logo-barron.png` (también acepta `logo-barron.jpg`, `.jpeg`, `.webp` o `.svg`).
Aparece sola en la cabecera (recomendado: 400×400 px, < 150 KB).
No está redibujada ni reemplazada por otra mascota: mientras falte el archivo,
se muestra un recuadro discreto "LOGO BARRÓN".

## 2. Poner los enlaces reales

Abre **`assets/js/config.js`** y completa solo las líneas marcadas con `// TODO: REEMPLAZAR`:

| Campo | Qué poner | Estado |
|---|---|---|
| `enlaces.googleReviewUrl` | **Tu enlace corto de reseña**: `https://g.page/r/XXXX/review` (el que termina en `/review` abre directo el formulario de estrellas) | ⬜ pendiente |
| `enlaces.googlePlaceId` | Alternativa (`ChIJ...`) — arma sola el enlace directo a estrellas | ⬜ opcional |
| `enlaces.whatsappComunidad` | Invitación del canal (`https://whatsapp.com/channel/...`) — **único acceso a WhatsApp** | ⬜ pendiente |
| `enlaces.ofertas` | Destino real de las ofertas (ya **no** usa Instagram). Si no quieres la tarjeta: `mostrarOfertas: false` | ⬜ pendiente |
| `enlaces.ionGroup` | Instagram / WhatsApp / web de ION GROUP | ⬜ pendiente |
| `enlaces.instagram` | `https://www.instagram.com/barron.cl/` | ✅ ya puesto |
| `enlaces.tiktok` | `https://www.tiktok.com/@barroncl` | ✅ ya puesto |
| `enlaces.googleMaps` | Búsqueda de la dirección en Maps | ✅ ya puesto |

Las 4 tarjetas principales son: **Comunidad Barrón** (con el logo de WhatsApp) · **Instagram** · **TikTok** · **Google Maps**.
La tarjeta de WhatsApp directo fue eliminada.

> Sin datos reales no se inventó ninguna URL: los botones que aún no tienen enlace
> muestran el aviso *"Este enlace se está configurando"* en vez de llevar a un lugar equivocado.
> Si prefieres ocultarlos hasta tenerlos, pon `ocultarEnlacesPendientes: true`.
> Mientras falten datos, esas tarjetas muestran el rótulo naranjo **"config. pendiente"**
> para que sepas de un vistazo qué falta antes de imprimir las tarjetas NFC.

## 3. Publicar

Es un sitio estático: sube la carpeta a **Netlify, Vercel, Cloudflare Pages o GitHub Pages**
y graba esa URL en las etiquetas NFC / genera el QR.

Todo funciona sin servidor, sin dependencias y sin conexiones externas
(las tipografías son las del sistema), así que carga rápido incluso con datos móviles lentos.

---

### Ver la página en tu computador

```bash
python3 -m http.server 8000
# luego abrir http://localhost:8000
```

### Detalles de funcionamiento

- **Mobile first**, ancho máximo de contenido 460 px centrado (también se ve bien en PC).
- **Compartir**: usa `navigator.share` (menú nativo de iPhone y Android); si no existe, copia el enlace.
- **Horario en vivo**: la pastilla de la cabecera calcula abierto/cerrado con la hora de Chile.
- **Accesibilidad**: foco visible, `prefers-reduced-motion`, textos alternativos.
- **Sin sobrecarga**: animaciones suaves, un solo PNG y ningún script de terceros.

---

Desarrollado por **ION GROUP**.
