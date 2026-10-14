// api/webhook.js — el WEBHOOK de Mercado Pago.
//
// Mercado Pago llama a esta URL sola cada vez que cambia el estado de un pago. El aviso
// solo trae el ID del pago. Nosotros:
//   1. (opcional) revisamos la firma x-signature.
//   2. Le preguntamos a la API de Mercado Pago los datos REALES de ese pago, usando nuestro
//      Access Token. Esto es lo que impide falsificar ventas: aunque alguien le mande un
//      aviso falso a esta URL, lo único que logra es que consultemos un pago real.
//   3. Si está aprobado y es de esta tienda, lo anotamos en Google Sheets (sin duplicar).
//
// Si algo falla al anotar, respondemos 500 a propósito: Mercado Pago reintenta el aviso
// y, como no duplicamos filas, es seguro.

const crypto = require('crypto');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { appendOrder } = require('../lib/sheets');
const { cleanText } = require('../lib/http');

// --- Firma x-signature -------------------------------------------------------------------
// Formato del header: "ts=<timestamp>,v1=<firma hexadecimal>".
// Implementación: HMAC-SHA256 con tu clave secreta sobre "id:<data.id>;request-id:<x-request-id>;ts:<ts>;".
// OJO: esta fórmula no pude confirmarla en la documentación pública de Mercado Pago, por eso
// por defecto solo se REGISTRA una advertencia si no coincide, sin bloquear el pedido.
// Activá MP_WEBHOOK_STRICT=true recién cuando la prueba "Simular" muestre "firma válida".
function checkSignature(req, dataId) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return { checked: false, ok: true, reason: 'sin MP_WEBHOOK_SECRET' };

  const header = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'] || '';
  if (!header) return { checked: true, ok: false, reason: 'falta x-signature' };

  const parts = {};
  String(header).split(',').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) parts[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  if (!parts.ts || !parts.v1) return { checked: true, ok: false, reason: 'x-signature mal formada' };

  const candidates = [String(dataId), String(dataId).toLowerCase()];
  for (const id of candidates) {
    const manifest = `id:${id};request-id:${requestId};ts:${parts.ts};`;
    const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(parts.v1, 'utf8');
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return { checked: true, ok: true };
  }
  return { checked: true, ok: false, reason: 'la firma no coincide' };
}

module.exports = async (req, res) => {
  // Algunos servicios hacen un GET de prueba a la URL.
  if (req.method === 'GET') return res.status(200).send('webhook activo');
  if (req.method !== 'POST') return res.status(405).send('método no permitido');

  try {
    const q = req.query || {};
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const type = q.type || q.topic || body.type || body.topic;
    const paymentId = q['data.id'] || q.id || (body.data && body.data.id) || null;

    // Solo nos interesan los eventos de pago.
    if (type && !/^payment$/i.test(String(type))) return res.status(200).send('ignorado: no es un pago');
    if (!paymentId) return res.status(200).send('ignorado: sin id de pago');

    const sig = checkSignature(req, paymentId);
    if (sig.checked && !sig.ok) {
      console.warn(`[webhook] Firma no validada (${sig.reason}) para el pago ${paymentId}.`);
      if (process.env.MP_WEBHOOK_STRICT === 'true') return res.status(401).send('firma inválida');
    }

    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const payment = await new Payment(client).get({ id: paymentId });

    // Solo pagos generados por ESTE sitio (create-preference.js usa el prefijo "mem-").
    const ref = String(payment.external_reference || '');
    if (!ref.startsWith('mem-')) {
      return res.status(200).send('ignorado: el pago no es de la tienda web');
    }

    if (payment.status !== 'approved') {
      // pending / in_process / rejected: no se registra. Si luego se aprueba, llega otro aviso.
      return res.status(200).send(`pago ${payment.status}: no registrado`);
    }

    const items = (payment.additional_info && payment.additional_info.items) || [];
    const itemsText = items.map(i => `${i.quantity}x ${i.title}`).join(', ') || '(sin detalle)';
    const meta = payment.metadata || {};

    const result = await appendOrder({
      paymentId: payment.id,
      status: payment.status,
      itemsText,
      total: payment.transaction_amount,
      name: cleanText(meta.buyer_name, 80),
      phone: cleanText(meta.buyer_phone, 30),
      email: cleanText(meta.buyer_email || (payment.payer && payment.payer.email), 120),
      notes: cleanText(meta.notes, 300),
      method: payment.payment_method_id,
      externalReference: ref,
    });

    return res.status(200).send(result.recorded ? 'ok: pedido registrado' : 'ok: ya estaba registrado');
  } catch (err) {
    console.error('[webhook] Error procesando la notificación:', err);
    return res.status(500).send('error interno'); // Mercado Pago va a reintentar
  }
};
