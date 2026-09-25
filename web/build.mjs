// Genera las páginas de proyectos y categorías desde data/sitio.json, y el sitemap.
// Uso: node build.mjs   (sin dependencias). Las páginas usan URLs sin .html (Caddy: try_files {path}.html).
import {readFile, writeFile, mkdir} from 'node:fs/promises';

const site = JSON.parse(await readFile(new URL('./data/sitio.json', import.meta.url), 'utf8'));
// Solo proyectos con publicar: true (requiere autorización del cliente).
site.proyectos = site.proyectos.filter(p => p.publicar === true);
const {base, empresa} = site;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const ld = obj => `<script type="application/ld+json">\n${JSON.stringify(obj, null, 1)}\n</script>`;
const wa = text => `https://wa.me/${empresa.whatsapp}?text=${encodeURIComponent(text)}`;
const today = new Date().toISOString().slice(0, 10);
const org = {'@id': `${base}/#org`};

function page({path, title, description, h1, body, jsonld, breadcrumbs}) {
 const url = base + path;
 const crumbs = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{name: 'Inicio', path: '/'}, ...breadcrumbs].map((b, i) => ({'@type': 'ListItem', position: i + 1, name: b.name, item: base + b.path}))};
 return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#0b0b0c">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(empresa.nombre)}">
<meta property="og:locale" content="es_CL">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta name="twitter:card" content="summary">
<link rel="stylesheet" href="/css/paginas.css">
${ld(crumbs)}
${jsonld ? ld(jsonld) : ''}
</head>
<body>
<header class="top"><div class="wrap"><a class="brand" href="/">ION GROUP</a><nav aria-label="Principal"><a href="/#servicios">Servicios</a>${site.proyectos.length ? '<a href="/proyectos">Proyectos</a>' : ''}<a class="cta" href="/#contacto">Cotizar</a></nav></div></header>
<main class="wrap">
<nav class="crumbs" aria-label="Ruta"><a href="/">Inicio</a>${breadcrumbs.map((b, i) => i === breadcrumbs.length - 1 ? ` / <span aria-current="page">${esc(b.name)}</span>` : ` / <a href="${b.path}">${esc(b.name)}</a>`).join('')}</nav>
<h1>${esc(h1)}</h1>
${body}
</main>
<footer class="foot"><div class="wrap"><p><strong>${esc(empresa.nombre)}</strong> · Software, hardware y servicios digitales · Todo Chile</p><p><a href="${wa('Hola ION GROUP, quiero cotizar un sistema.')}" rel="noopener">WhatsApp ${esc(empresa.telefono)}</a> · <a href="mailto:${empresa.correo}">${esc(empresa.correo)}</a> · <a href="${empresa.instagram}" rel="noopener">Instagram</a></p></div></footer>
</body>
</html>
`;
}

const cta = text => `<section class="cta-box"><h2>¿Necesitas algo similar?</h2><p>Cuéntanos cómo trabaja tu negocio y te proponemos el sistema a tu medida. Sin compromiso.</p><p class="actions"><a class="btn primary" href="${wa(text)}" rel="noopener">Hablar con ION GROUP</a><a class="btn" href="/#contacto">Solicitar cotización</a></p></section>`;
const card = p => `<article class="card"><h3><a href="/proyectos/${p.slug}">${esc(p.nombre)}</a></h3><p>${esc(p.resumen)}</p><p class="tag">${esc(p.estado)}</p></article>`;
const relatedTo = c => site.proyectos.filter(p => p.categoria === c.clave || p.funcionalidades.some(f => f.toLowerCase().includes(c.clave.slice(0, 6))));
const pages = [];
// Título de hasta ~65 caracteres sin cortar palabras: acorta la marca antes que el contenido.
function fitTitle(text) {
 for (const brand of [` | ${empresa.nombre}`, ' | ION GROUP', '']) if ((text + brand).length <= 65) return text + brand;
 return text.slice(0, 64).replace(/\s+\S*$/, '') + '…';
}

for (const p of site.proyectos) {
 const cat = site.categorias.find(c => relatedTo(c).includes(p));
 const path = `/proyectos/${p.slug}`;
 const about = {'@type': p.tipoNegocio, name: p.nombre, ...(p.region ? {address: {'@type': 'PostalAddress', addressRegion: p.region, addressCountry: 'CL'}} : {}), ...(p.enlace ? {url: p.enlace} : {})};
 pages.push({path, html: page({
  path, title: fitTitle(`${p.nombre}: ${p.resumen.split(' para ')[0].toLowerCase()}`),
  description: `${p.resumen} Proyecto desarrollado por ${empresa.nombre}.`.slice(0, 160),
  h1: `${p.nombre}`,
  breadcrumbs: [{name: 'Proyectos', path: '/proyectos'}, {name: p.nombre, path}],
  jsonld: {'@context': 'https://schema.org', '@type': 'CreativeWork', name: `Sistema para ${p.nombre}`, description: p.resumen, url: base + path, creator: org, about},
  body: `<p class="lead">${esc(p.resumen)}</p>
<p class="tag">${esc(p.estado)}${p.region ? ` · ${esc(p.region)}` : ''}</p>
<section><h2>La solución</h2><p>${esc(p.solucion)}</p></section>
<section><h2>Funcionalidades</h2><ul class="checks">${p.funcionalidades.map(f => `<li>${esc(f)}</li>`).join('')}</ul></section>
${p.enlace ? `<p><a class="btn" href="${esc(p.enlace)}" rel="noopener">Visitar ${esc(p.nombre)}</a></p>` : ''}
${cat ? `<p>Conoce más sobre nuestros <a href="/${cat.slug}">${esc(cat.titulo.toLowerCase())}</a>.</p>` : ''}
${cta(`Hola ION GROUP, vi el proyecto de ${p.nombre} y quiero algo similar.`)}`
 })});
}

if (site.proyectos.length) pages.push({path: '/proyectos', html: page({
 path: '/proyectos', title: `Proyectos y clientes | ${empresa.nombre}`, h1: 'Sistemas que ya funcionan',
 description: 'Proyectos de software a medida desarrollados por ION GROUP SpA para negocios en Chile: administración, barberías y comida.',
 breadcrumbs: [{name: 'Proyectos', path: '/proyectos'}],
 body: `<p class="lead">Negocios con los que hemos trabajado y seguimos trabajando. Cada sistema se construyó según la forma real de operar de cada cliente.</p><div class="grid">${site.proyectos.map(card).join('')}</div>${cta('Hola ION GROUP, quiero cotizar un sistema para mi negocio.')}`
})});

for (const c of site.categorias) {
 const related = relatedTo(c);
 pages.push({path: `/${c.slug}`, html: page({
  path: `/${c.slug}`, title: fitTitle(c.titulo), description: c.descripcion, h1: c.titulo,
  breadcrumbs: [{name: c.titulo, path: `/${c.slug}`}],
  jsonld: {'@context': 'https://schema.org', '@type': 'Service', name: c.titulo, description: c.descripcion, provider: org, areaServed: {'@type': 'Country', name: 'Chile'}, url: `${base}/${c.slug}`},
  body: `<p class="lead">${esc(c.intro)}</p>
<section><h2>Qué puede incluir tu sistema</h2><div class="grid">${c.modulos.map(([t, d]) => `<article class="card"><h3>${esc(t)}</h3><p>${esc(d)}</p></article>`).join('')}</div><p class="note">Cada sistema se define según el alcance acordado: incluimos lo que tu negocio necesita, no un paquete genérico.</p></section>
<section><h2>Cómo trabajamos</h2><ol class="steps"><li><strong>Analizamos</strong> cómo funciona tu negocio.</li><li><strong>Diseñamos</strong> el sistema y acordamos alcance y valores.</li><li><strong>Desarrollamos</strong>, instalamos y capacitamos a tu equipo.</li><li><strong>Acompañamos</strong> con soporte, mantención y mejoras.</li></ol></section>
${related.length ? `<section><h2>Proyectos relacionados</h2><div class="grid">${related.map(card).join('')}</div></section>` : ''}
${cta(`Hola ION GROUP, me interesan los ${c.titulo.toLowerCase()}.`)}`
 })});
}

for (const {path, html} of pages) {
 const file = new URL(`.${path}.html`, import.meta.url);
 await mkdir(new URL('.', file), {recursive: true});
 await writeFile(file, html);
}
const urls = ['/', ...pages.map(p => p.path)];
await writeFile(new URL('./sitemap.xml', import.meta.url), `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generado por build.mjs: solo páginas existentes. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${base}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);
console.log(`Generadas ${pages.length} páginas:`, pages.map(p => p.path).join(' '));
