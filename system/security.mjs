// Compara el hostname exacto; antes bastaba con que el texto contuviera "localhost"
// (por ejemplo, http://localhost.atacante.com pasaba el filtro).
// *.pinggy.net se mantiene por compatibilidad con el túnel usado hoy; ver docs/AUDITORIA.md.
export function allowedOrigin(origin) {
 let url;
 try { url = new URL(origin); } catch { return false; }
 const host = url.hostname;
 if (host === 'localhost' || host === '127.0.0.1') return url.protocol === 'http:' || url.protocol === 'https:';
 return url.protocol === 'https:' && host.endsWith('.pinggy.net');
}
