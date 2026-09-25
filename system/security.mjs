// Validación de origen y host del panel.
// PUBLIC_ORIGIN (opcional) es la URL exacta del túnel o dominio público, p. ej. https://abc.a.pinggy.net.
// Antes se aceptaba cualquier *.pinggy.net, y cualquiera puede obtener uno gratis.
const LOCAL = new Set(['localhost', '127.0.0.1']);

export function allowedOrigin(origin, publicOrigin = process.env.PUBLIC_ORIGIN) {
 let url;
 try { url = new URL(origin); } catch { return false; }
 if (LOCAL.has(url.hostname)) return url.protocol === 'http:' || url.protocol === 'https:';
 return Boolean(publicOrigin) && url.origin === publicOrigin.replace(/\/$/, '');
}

// Frena DNS rebinding: una web ajena que resuelva a 127.0.0.1 llega con su propio Host.
export function allowedHost(host, publicOrigin = process.env.PUBLIC_ORIGIN) {
 const name = String(host || '').replace(/:\d+$/, '').toLowerCase();
 if (LOCAL.has(name)) return true;
 if (!publicOrigin) return false;
 try { return new URL(publicOrigin).hostname === name; } catch { return false; }
}

export const securityHeaders = {
 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
 'X-Frame-Options': 'DENY',
 'X-Content-Type-Options': 'nosniff',
 'Referrer-Policy': 'same-origin'
};
