// lib/sheets.js
// Registro de pedidos en Google Sheets con una Service Account.
// Variables de entorno: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID

const { google } = require('googleapis');

const SHEET_NAME = 'Pedidos Web'; // pestaña dentro del Google Sheet (se crea sola)
const HEADERS = [
  'Fecha', 'Hora', 'ID de pago (Mercado Pago)', 'Estado de pago', 'Productos', 'Total',
  'Nombre', 'WhatsApp', 'Email', 'Notas / dirección', 'Medio de pago', 'Referencia interna', 'Entrega'
];
const COL_PAYMENT_ID = 'C'; // columna usada para evitar filas duplicadas

function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // La clave se pega en Vercel en una sola línea, con "\n" literales: acá se convierten en saltos reales.
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) {
    throw new Error('Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_PRIVATE_KEY.');
  }
  const auth = new google.auth.JWT(email, null, key, ['https://www.googleapis.com/auth/spreadsheets']);
  return google.sheets({ version: 'v4', auth });
}

async function ensureSheet(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (meta.data.sheets || []).some(s => s.properties.title === SHEET_NAME);
  if (exists) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME, gridProperties: { frozenRowCount: 1 } } } }] }
  });
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] }
  });
}

// Mercado Pago puede avisar varias veces del mismo pago (reintentos). No duplicamos filas.
async function alreadyRecorded(sheets, spreadsheetId, paymentId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!${COL_PAYMENT_ID}:${COL_PAYMENT_ID}`
  });
  const rows = res.data.values || [];
  return rows.some(r => String(r[0]) === String(paymentId));
}

// order = { paymentId, status, itemsText, total (número), name, phone, email, notes, method, externalReference }
// Devuelve { recorded: true } si agregó la fila, o { recorded: false, reason: 'duplicado' }.
async function appendOrder(order) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('Falta GOOGLE_SHEET_ID.');

  const sheets = getSheetsClient();
  await ensureSheet(sheets, spreadsheetId);

  if (await alreadyRecorded(sheets, spreadsheetId, order.paymentId)) {
    return { recorded: false, reason: 'duplicado' };
  }

  const now = new Date();
  const tz = 'America/Argentina/Buenos_Aires';
  const fecha = now.toLocaleDateString('es-AR', { timeZone: tz });
  const hora = now.toLocaleTimeString('es-AR', { timeZone: tz });

  // Los textos que empiezan con = + - @ se interpretarían como fórmula en USER_ENTERED
  // (inyección de fórmulas desde datos que escribe el cliente). Se neutralizan con un apóstrofe.
  const safe = (v) => {
    const s = String(v == null ? '' : v);
    return /^[=+\-@]/.test(s) ? "'" + s : s;
  };

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        fecha, hora, String(order.paymentId), order.status, safe(order.itemsText), Number(order.total) || 0,
        safe(order.name), safe(order.phone), safe(order.email), safe(order.notes),
        safe(order.method), safe(order.externalReference), 'Pendiente'
      ]]
    }
  });
  return { recorded: true };
}

module.exports = { appendOrder, SHEET_NAME, HEADERS };
