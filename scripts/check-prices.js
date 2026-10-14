// scripts/check-prices.js
// Compara los precios (data-price) de index.html con lib/catalog.js.
// Uso:  npm run check-prices     (corrélo antes de cada publicación)
// Sale con código 1 si hay diferencias: lo que ve el cliente tiene que ser lo que se cobra.

const fs = require('fs');
const path = require('path');
const { CATALOGO } = require('../lib/catalog');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const re = /data-id="([^"]+)"[^>]*?data-price="(\d+)"/g;

const enSitio = {};
let m;
while ((m = re.exec(html))) enSitio[m[1]] = Number(m[2]);

let errores = 0;
for (const [id, p] of Object.entries(CATALOGO)) {
  if (!(id in enSitio)) { console.log(`✗ ${id}: está en catalog.js pero no en index.html`); errores++; continue; }
  if (enSitio[id] !== p.price) {
    console.log(`✗ ${id}: sitio $${enSitio[id]} ≠ servidor $${p.price}`);
    errores++;
  } else {
    console.log(`✓ ${id}: $${p.price}`);
  }
}
for (const id of Object.keys(enSitio)) {
  if (!(id in CATALOGO)) { console.log(`✗ ${id}: está en index.html pero NO se puede cobrar (falta en catalog.js)`); errores++; }
}
console.log(errores ? `\n${errores} diferencia(s). Corregí antes de publicar.` : '\nTodo coincide.');
process.exit(errores ? 1 : 0);
