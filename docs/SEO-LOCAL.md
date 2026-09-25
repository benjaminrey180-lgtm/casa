# SEO local de clientes y Google Business Profile

Objetivo: que Google entienda con claridad **qué es cada negocio, dónde está y cómo contactarlo**. No se promete ningún puesto en los resultados. No se usan páginas falsas, relleno de palabras clave ni reseñas inventadas.

## 1. Dónde vive cada cosa

| Qué | Dónde | Por qué |
|---|---|---|
| Ficha del negocio con JSON-LD `Restaurant`, `HairSalon` o `LocalBusiness`, dirección, horarios y `geo` | **Sitio del cliente** (p. ej. `duo.iongroup.cl` o su dominio propio) | Es la entidad del negocio. Google la cruza con su ficha de Business Profile |
| Página del proyecto `iongroup.cl/proyectos/[slug]` | Web de ION | Muestra el trabajo de ION. Usa `CreativeWork` + `about`; ION es el proveedor, no el dueño del negocio |
| Páginas de categoría (`/sistemas-para-barberias`…) | Web de ION | Posicionan a ION como proveedor de software, con los proyectos reales como ejemplo |
| Placa NFC `iongroup.cl/nfc/[código]` | Oficina ION | Página de acción rápida. Lleva `noindex` porque no es contenido para buscar |

En el sitio del cliente, la marca principal es la del cliente. ION aparece solo al pie: "Desarrollado por ION GROUP" con enlace a iongroup.cl.

## 2. Datos a pedir a cada cliente (con autorización para publicarlos)

- **Datos del negocio:**
  - Nombre comercial exacto, **idéntico** al de Google Business Profile.
  - Rubro principal, que se usa para elegir el tipo de schema.org más específico.
  - Dirección completa: calle, número, comuna, región y código postal. Si atiende solo a domicilio, la zona de cobertura.
  - Coordenadas: se obtienen de Google Maps, en el punto exacto del local.
  - Teléfono y WhatsApp, en el mismo formato en todas partes (`+56 9 XXXX XXXX`).
  - Horarios por día, incluidos los feriados especiales.
  - Enlaces: Instagram, Facebook, ficha de Google Maps y reseñas (`https://g.page/r/.../review`).
- **Según el rubro:**
  - **Comida:** tipo de cocina (`servesCuisine`), URL del menú, si hay retiro o delivery y si acepta reservas.
  - **Barbería o servicios:** servicios con sus precios si se quieren publicar, y el enlace para reservar.
- **Material:** logo cuadrado y fotos reales del local, con permiso de uso.

Registra estos datos en **Cartera de clientes** (Oficina ION). Marca "Autoriza aparecer en el portafolio público" solo cuando el cliente lo confirme.

## 3. Plantilla JSON-LD para el sitio del cliente

Incluye solo los campos confirmados. Borra los que no tengas en lugar de inventarlos.

```json
{
 "@context": "https://schema.org",
 "@type": "Restaurant",
 "name": "Dúo",
 "url": "https://duo.iongroup.cl/",
 "logo": "https://duo.iongroup.cl/logo.png",
 "image": ["https://duo.iongroup.cl/local.jpg"],
 "telephone": "+56 9 XXXX XXXX",
 "address": {"@type": "PostalAddress", "streetAddress": "…", "addressLocality": "…", "addressRegion": "Ñuble", "addressCountry": "CL"},
 "geo": {"@type": "GeoCoordinates", "latitude": 0, "longitude": 0},
 "openingHoursSpecification": [{"@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday","Tuesday"], "opens": "12:00", "closes": "22:00"}],
 "servesCuisine": ["Bowls"],
 "menu": "https://duo.iongroup.cl/menu",
 "acceptsReservations": false,
 "sameAs": ["https://www.instagram.com/…"],
 "hasMap": "https://maps.google.com/?cid=…"
}
```

- Para una barbería usa `"@type": "HairSalon"` y agrega `"potentialAction": {"@type": "ReserveAction", "target": "https://…/reservar"}`.
- Valida siempre con la [prueba de resultados enriquecidos](https://search.google.com/test/rich-results) y el [validador de schema.org](https://validator.schema.org/) antes de publicar.

## 4. Contenido que ayuda (natural, no repetido)

En la portada del sitio del cliente conviene una frase que describa el negocio como lo buscaría una persona. Ejemplo: "Barbería en [comuna]: cortes, barba y reservas en línea."

Además:
- Una sección de servicios o menú con texto real, no solo imágenes.
- Horarios y dirección visibles en el HTML, no solo dentro de una imagen.
- Botones claros de acción: Reservar, Pedir, WhatsApp y Cómo llegar (enlace a Google Maps).
- Enlace a la ficha de Google para dejar una reseña. Las placas NFC y QR de ION sirven justamente para eso.

## 5. Consistencia con Google Business Profile

Nombre, dirección, teléfono, horarios, categoría y sitio web deben coincidir **exactamente** entre la ficha de Google, el sitio del cliente, Instagram y la página del proyecto en iongroup.cl. Cada cambio de horario o teléfono se actualiza en todos esos lugares el mismo día.

## 6. Técnica mínima por sitio de cliente

- HTTPS, sin contenido mixto, y `robots.txt` y `sitemap.xml` propios.
- Canonical en cada página, un solo H1 y texto `alt` en las imágenes.
- Se ve bien en el teléfono. Carga rápida: imágenes WebP con `width`/`height` y sin JavaScript bloqueante.
- El sitio se registra en Google Search Console, con verificación por DNS en iongroup.cl.
- Panel de administración con `noindex` y detrás de login.

## 7. Estado actual

| Cliente | Página del proyecto en ION | Datos para SEO local | Sitio propio |
|---|---|---|---|
| Vega Barrón SpA | `/proyectos/vega-barron` | Solo la región (Ñuble). Falta todo lo demás | Sin confirmar |
| Capital's Barber | `/proyectos/capitals-barber` | Ninguno confirmado | Existe `capitalbarber.iongroup.cl` en DNS; contenido sin revisar |
| Dúo | `/proyectos/duo` | Ninguno confirmado | Existe `duo.iongroup.cl` en DNS; contenido sin revisar |
| Golden Roll | Sin página: no aparece en la web pública | Ninguno | Existe `goldenroll.iongroup.cl` en DNS; contenido sin revisar |
