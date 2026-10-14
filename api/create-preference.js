// api/create-preference.js
// pago.html llama acá con el carrito y los datos del comprador. Se crea la preferencia de
// Checkout Pro y se devuelve la URL de Mercado Pago a la que hay que redirigir.
//
// El PRECIO se calcula siempre en el servidor, desde lib/catalog.js. Si confiáramos en el
// precio que manda el navegador, cualquiera podría pagar $1 por una pizza desde la consola.

const { MercadoPagoConfig, Preference } = require('mercadopago');
const { CATALOGO, MAX_QTY_POR_ITEM } = require('../lib/catalog');
const { applyCors, handlePreflight, apiBase, siteBase, cleanText } = require('../lib/http');

module.exports = async (req, res) => {
  applyCors(req, res);
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

  try {
    if (!process.env.MP_ACCESS_TOKEN || !siteBase()) {
      console.error('Faltan MP_ACCESS_TOKEN o SITE_URL en las variables de entorno.');
      return res.status(500).json({ error: 'El pago online todavía no está configurado.' });
    }

    const { cart, buyer } = req.body || {};
    if (!cart || typeof cart !== 'object' || Array.isArray(cart)) {
      return res.status(400).json({ error: 'El carrito es inválido.' });
    }

    // --- Ítems: solo ids que existan en el catálogo, cantidades enteras y acotadas ---
    const items = [];
    for (const [id, entry] of Object.entries(cart)) {
      const producto = CATALOGO[id];
      const qty = Math.floor(Number(entry && entry.qty));
      if (!producto || !Number.isFinite(qty) || qty < 1) continue;
      items.push({
        id,
        title: producto.title,
        quantity: Math.min(qty, MAX_QTY_POR_ITEM),
        unit_price: producto.price,
        currency_id: 'ARS',
      });
    }
    if (items.length === 0) {
      return res.status(400).json({ error: 'No hay productos válidos en el carrito.' });
    }

    // --- Datos del comprador (los necesita el equipo para coordinar la entrega) ---
    const name = cleanText(buyer && buyer.name, 80);
    const phone = cleanText(buyer && buyer.phone, 30);
    const email = cleanText(buyer && buyer.email, 120);
    const notes = cleanText(buyer && buyer.notes, 300);
    if (name.length < 2) return res.status(400).json({ error: 'Ingresá tu nombre.' });
    if (phone.replace(/\D/g, '').length < 8) return res.status(400).json({ error: 'Ingresá un WhatsApp válido.' });
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    const externalReference = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const site = siteBase();

    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items,
        payer: { name, ...(emailOk ? { email } : {}) },
        external_reference: externalReference,
        // El comprador vuelve a pago.html con ?r=... ; además Mercado Pago agrega payment_id.
        back_urls: {
          success: `${site}/pago.html?r=approved`,
          pending: `${site}/pago.html?r=pending`,
          failure: `${site}/pago.html?r=failure`,
        },
        auto_return: 'approved',
        notification_url: `${apiBase()}/api/webhook`,
        statement_descriptor: 'MOLLICA E MOKA',
        // metadata viaja con el pago y la leemos en el webhook para completar la fila del Sheet.
        metadata: { buyer_name: name, buyer_phone: phone, buyer_email: emailOk ? email : '', notes },
      }
    });

    return res.status(200).json({
      init_point: result.init_point,
      external_reference: externalReference,
    });
  } catch (err) {
    console.error('Error creando la preferencia de Mercado Pago:', err);
    return res.status(500).json({ error: 'No se pudo iniciar el pago. Probá de nuevo en unos segundos.' });
  }
};
