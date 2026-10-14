// lib/http.js — CORS y helpers compartidos por los endpoints.
//
// Solo se acepta que llame a la API el propio sitio (SITE_URL). Esto no es "seguridad
// fuerte" (cualquiera puede llamar a la API desde fuera de un navegador), pero evita que
// otras páginas web usen tu backend desde el navegador de sus visitantes.

function applyCors(req, res) {
  const allowed = (process.env.SITE_URL || '').replace(/\/$/, '');
  const origin = req.headers.origin;

  // Mismo origen (sitio y API en el mismo dominio): el navegador no manda Origin, no hace falta CORS.
  if (origin && allowed && origin === allowed) {
    res.setHeader('Access-Control-Allow-Origin', allowed);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Devuelve true si ya respondió (preflight) y el handler debe cortar.
function handlePreflight(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

// URL base pública del backend (para notification_url). Si no hay API_URL, es el mismo dominio del sitio.
function apiBase() {
  return (process.env.API_URL || process.env.SITE_URL || '').replace(/\/$/, '');
}

function siteBase() {
  return (process.env.SITE_URL || '').replace(/\/$/, '');
}

// Limpia texto libre que viene del navegador: sin saltos raros, con largo máximo.
function cleanText(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

module.exports = { applyCors, handlePreflight, apiBase, siteBase, cleanText };
