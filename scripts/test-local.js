// scripts/test-local.js — prueba la lógica SIN internet: reemplaza mercadopago y googleapis por simulados.
// Uso: npm test
const Module = require('module');
const assert = require('assert');
const crypto = require('crypto');

const calls = { prefs: [], rows: [], existingIds: [] };
let paymentToReturn = null;

const stubs = {
  mercadopago: {
    MercadoPagoConfig: class { constructor(o) { this.o = o; } },
    Preference: class { async create({ body }) { calls.prefs.push(body); return { init_point: 'https://mp.test/pay' }; } },
    Payment: class { async get() { return paymentToReturn; } },
  },
  googleapis: {
    google: {
      auth: { JWT: class {} },
      sheets: () => ({
        spreadsheets: {
          get: async () => ({ data: { sheets: [{ properties: { title: 'Pedidos Web' } }] } }),
          batchUpdate: async () => ({}),
          values: {
            get: async () => ({ data: { values: calls.existingIds.map(i => [i]) } }),
            append: async ({ requestBody }) => { const row = requestBody.values[0]; calls.rows.push(row); calls.existingIds.push(row[2]); return {}; },
          },
        },
      }),
    },
  },
};
const origLoad = Module._load;
Module._load = function (req, ...r) { return stubs[req] || origLoad.call(this, req, ...r); };

process.env.MP_ACCESS_TOKEN = 'TEST';
process.env.SITE_URL = 'https://mollicaemoka.store';
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'x@y.iam.gserviceaccount.com';
process.env.GOOGLE_PRIVATE_KEY = 'k\\nk';
process.env.GOOGLE_SHEET_ID = 'sheet';
process.env.MP_WEBHOOK_SECRET = 'secreto';

const create = require('../api/create-preference');
const webhook = require('../api/webhook');
const status = require('../api/payment-status');

function mock(method, { body, query, headers } = {}) {
  const res = { code: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
    json(o) { this.body = o; return this; }, send(o) { this.body = o; return this; }, end() { return this; } };
  return [{ method, body, query: query || {}, headers: { origin: 'https://mollicaemoka.store', ...(headers || {}) } }, res];
}
const buyer = { name: 'Ana', phone: '11 5555 1234', email: 'a@b.com', notes: '=HYPERLINK("x")' };

(async () => {
  // 1) El servidor ignora precios del cliente y descarta ids inventados
  let [req, res] = mock('POST', { body: { cart: { 'segreto-bianco': { qty: 2, price: 1 }, fake: { qty: 1 } }, buyer } });
  await create(req, res);
  assert.strictEqual(res.code, 200);
  assert.strictEqual(calls.prefs[0].items.length, 1);
  assert.strictEqual(calls.prefs[0].items[0].unit_price, 8900);
  assert.strictEqual(calls.prefs[0].items[0].quantity, 2);
  console.log('✓ precios definidos por el servidor');

  // 2) Cantidad acotada y validaciones
  [req, res] = mock('POST', { body: { cart: { frittella: { qty: 9999 } }, buyer } });
  await create(req, res);
  assert.strictEqual(calls.prefs[1].items[0].quantity, 20);
  [req, res] = mock('POST', { body: { cart: { frittella: { qty: 1 } }, buyer: { name: '', phone: '1' } } });
  await create(req, res); assert.strictEqual(res.code, 400);
  [req, res] = mock('POST', { body: { cart: {}, buyer } });
  await create(req, res); assert.strictEqual(res.code, 400);
  console.log('✓ validaciones');

  // 3) Webhook: pago aprobado -> fila; repetido -> no duplica; con inyección neutralizada
  const approved = { id: 123456789, status: 'approved', external_reference: 'mem-1-abc', transaction_amount: 17800,
    payment_method_id: 'visa', metadata: { buyer_name: 'Ana', buyer_phone: '1155551234', buyer_email: '', notes: '=HYPERLINK("x")' },
    additional_info: { items: [{ title: 'Segreto Bianco', quantity: 2 }] } };
  paymentToReturn = approved;
  [req, res] = mock('POST', { query: { type: 'payment', 'data.id': '123456789' } });
  await webhook(req, res);
  assert.strictEqual(res.code, 200); assert.strictEqual(calls.rows.length, 1);
  assert.ok(calls.rows[0][9].startsWith("'="), 'fórmula neutralizada');
  [req, res] = mock('POST', { query: { type: 'payment', 'data.id': '123456789' } });
  await webhook(req, res); assert.strictEqual(calls.rows.length, 1);
  console.log('✓ webhook registra una sola vez y neutraliza fórmulas');

  // 4) No aprobado / ajeno -> ignorado
  paymentToReturn = { ...approved, id: 5, status: 'pending' };
  [req, res] = mock('POST', { query: { type: 'payment', 'data.id': '5' } }); await webhook(req, res);
  paymentToReturn = { ...approved, id: 6, external_reference: 'otro' };
  [req, res] = mock('POST', { query: { type: 'payment', 'data.id': '6' } }); await webhook(req, res);
  assert.strictEqual(calls.rows.length, 1);
  console.log('✓ pendientes y pagos ajenos no se registran');

  // 5) Fallo de Sheets -> 500 (para que MP reintente)
  const sheetsId = process.env.GOOGLE_SHEET_ID; delete process.env.GOOGLE_SHEET_ID;
  paymentToReturn = { ...approved, id: 777 };
  [req, res] = mock('POST', { query: { type: 'payment', 'data.id': '777' } }); await webhook(req, res);
  assert.strictEqual(res.code, 500); process.env.GOOGLE_SHEET_ID = sheetsId;
  console.log('✓ error de Sheets devuelve 500');

  // 6) Modo estricto con firma mala -> 401; con firma buena -> pasa
  process.env.MP_WEBHOOK_STRICT = 'true';
  [req, res] = mock('POST', { query: { type: 'payment', 'data.id': '888' }, headers: { 'x-signature': 'ts=1,v1=00', 'x-request-id': 'r' } });
  await webhook(req, res); assert.strictEqual(res.code, 401);
  const v1 = crypto.createHmac('sha256', 'secreto').update('id:888;request-id:r;ts:1;').digest('hex');
  paymentToReturn = { ...approved, id: 888 };
  [req, res] = mock('POST', { query: { type: 'payment', 'data.id': '888' }, headers: { 'x-signature': `ts=1,v1=${v1}`, 'x-request-id': 'r' } });
  await webhook(req, res); assert.strictEqual(res.code, 200);
  delete process.env.MP_WEBHOOK_STRICT;
  console.log('✓ firma (modo estricto)');

  // 7) payment-status
  paymentToReturn = approved;
  [req, res] = mock('GET', { query: { payment_id: '123456789' } }); await status(req, res);
  assert.strictEqual(res.body.status, 'approved');
  [req, res] = mock('GET', { query: { payment_id: 'abc' } }); await status(req, res); assert.strictEqual(res.code, 400);
  console.log('✓ payment-status');
  console.log('\nTodas las pruebas pasaron.');
})().catch(e => { console.error('✗ FALLÓ:', e); process.exit(1); });
