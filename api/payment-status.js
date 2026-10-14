// api/payment-status.js
// pago.html lo usa al volver de Mercado Pago para CONFIRMAR con el servidor que el pago
// realmente está aprobado. Sin esto, cualquiera podría abrir pago.html?r=approved y ver
// una pantalla de "pago confirmado" sin haber pagado (y alguien del equipo podría confundirse).
// Lo único que se devuelve es el estado; no se expone ningún dato del comprador.

const { MercadoPagoConfig, Payment } = require('mercadopago');
const { applyCors, handlePreflight } = require('../lib/http');

module.exports = async (req, res) => {
  applyCors(req, res);
  if (handlePreflight(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido.' });

  const paymentId = String((req.query && req.query.payment_id) || '');
  if (!/^\d{5,20}$/.test(paymentId)) return res.status(400).json({ error: 'payment_id inválido.' });

  try {
    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const payment = await new Payment(client).get({ id: paymentId });

    if (!String(payment.external_reference || '').startsWith('mem-')) {
      return res.status(404).json({ error: 'Pago no encontrado.' });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      status: payment.status, // approved | pending | in_process | rejected ...
      total: payment.transaction_amount,
      external_reference: payment.external_reference,
    });
  } catch (err) {
    console.error('[payment-status] Error:', err);
    return res.status(502).json({ error: 'No se pudo verificar el pago.' });
  }
};
