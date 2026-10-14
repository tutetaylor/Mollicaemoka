# Mollica e Moka — Pagos con Mercado Pago + pedidos en Google Sheets

Archivos: `index.html`, `pago.html` (sitio) · `api/` (3 funciones: create-preference, webhook, payment-status) · `lib/` · `scripts/`.

## Paso a paso
1. **GitHub**: creá un repo privado y subí TODO el contenido de esta carpeta (el `.env` real nunca se sube).
2. **Vercel**: vercel.com → Add New → Project → importá el repo → Deploy.
3. **Mercado Pago**: mercadopago.com.ar/developers → Tus integraciones → Crear aplicación → Checkout Pro. Copiá el *Access Token de prueba* (credenciales de prueba).
4. **Google**: console.cloud.google.com → proyecto nuevo → habilitar *Google Sheets API* → Credenciales → Cuenta de servicio → Claves → JSON. Del JSON usá `client_email` y `private_key`. Abrí tu Google Sheet → Compartir → pegá el `client_email` como Editor. El ID del Sheet es el tramo largo de su URL (`/d/<ID>/edit`).
5. **Variables en Vercel** (Settings → Environment Variables), ver `.env.example`: `MP_ACCESS_TOKEN`, `SITE_URL`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` (en una línea, con `\n` literales), `GOOGLE_SHEET_ID`. Redeploy.
6. **Dominio**: Settings → Domains → agregá `mollicaemoka.store` y cambiá el DNS como indique Vercel. Si el sitio queda en otro hosting, poné `API_URL` (URL de Vercel) y en `pago.html` completá `API_BASE`.
7. **Webhook**: en tu app de MP → Webhooks → URL `https://TU-DOMINIO/api/webhook`, evento *Pagos*. Copiá la clave secreta a `MP_WEBHOOK_SECRET`. Probá con *Simular*.
8. **Prueba completa** con usuarios y tarjetas de prueba de MP: comprá, volvé al sitio, verificá que aparece una fila en la pestaña "Pedidos Web".
9. **Producción**: reemplazá `MP_ACCESS_TOKEN` por el de producción y redeploy. Hacé una compra real chica.
10. Recién cuando los logs de Vercel no muestren "Firma no validada", poné `MP_WEBHOOK_STRICT=true`.

## Mantenimiento
- Cambiar un precio: editar `data-price` en `index.html` **y** `lib/catalog.js`; correr `npm run check-prices`.
- `npm test` corre las pruebas locales (sin internet).
