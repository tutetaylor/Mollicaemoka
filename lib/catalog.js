// lib/catalog.js
// FUENTE DE VERDAD DE LOS PRECIOS PARA COBRAR.
// El navegador nunca decide cuánto se cobra: el servidor busca el precio acá por id.
// Si cambiás un precio en index.html (data-price), cambialo también acá.
// Corré `npm run check-prices` para comprobar que ambos coinciden antes de publicar.
//
// Valores actuales = los que hoy muestra el sitio. (Los precios recomendados en la
// conversación — $13.000, $11.500, etc. — NO están aplicados todavía: si los adoptás,
// actualizá index.html Y este archivo.)

const CATALOGO = {
  'segreto-bianco':      { title: 'Il Segreto Bianco',   price: 8900 },
  'segreto-nero':        { title: 'Il Segreto Nero',     price: 8900 },
  'oreo-stremo':         { title: 'Oreo Stremo',         price: 7900 },
  'frittella':           { title: 'Frittella',           price: 6200 },
  'pizza-al-limone':     { title: 'Pizza al Limone',     price: 6500 },
  'torta-al-cioccolato': { title: 'Torta al Cioccolato', price: 6200 },
  'cipolla-e-miele':     { title: 'Cipolla e Miele',     price: 7200 },
  'diavola-di-chipa':    { title: 'La Diavola di Chipa', price: 7800 },
};

const MAX_QTY_POR_ITEM = 20;

module.exports = { CATALOGO, MAX_QTY_POR_ITEM };
