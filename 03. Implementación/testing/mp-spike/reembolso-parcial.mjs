import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const envPath = join(dir, '.env');
if (!existsSync(envPath)) {
  console.error('Falta ' + envPath + ' (copiá .env.example a .env y completalo con credenciales de PRUEBA)');
  process.exit(1);
}
const env = {};
for (const linea of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const t = linea.trim();
  if (!t || t.startsWith('#') || !t.includes('=')) continue;
  const i = t.indexOf('=');
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
for (const n of ['MP_SELLER_OAUTH_TOKEN', 'MP_SELLER_PUBLIC_KEY', 'MP_BUYER_EMAIL']) {
  if (!env[n]) {
    console.error('Falta la variable ' + n + ' en ' + envPath);
    process.exit(1);
  }
}
if (!/^APP_USR-|^TEST-/.test(env.MP_SELLER_OAUTH_TOKEN)) {
  console.error('MP_SELLER_OAUTH_TOKEN no parece un access_token de Mercado Pago');
  process.exit(1);
}

const API = process.env.MERCADOPAGO_API_BASE_URL || 'https://api.mercadopago.com';
const TOKEN = env.MP_SELLER_OAUTH_TOKEN;
const MONTO = 1000;
const COMISION = 200;
const bitacora = [];

async function llamar(etapa, metodo, ruta, cuerpo, clave) {
  const res = await fetch(API + ruta, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + TOKEN,
      ...(clave ? { 'X-Idempotency-Key': clave } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await res.text();
  let json;
  try { json = JSON.parse(texto); } catch { json = { raw: texto.slice(0, 300) }; }
  bitacora.push({ etapa, http: res.status, respuesta: resumir(json) });
  return { http: res.status, json };
}

function resumir(j) {
  if (Array.isArray(j)) return j.map(resumir);
  const campos = ['id', 'status', 'status_detail', 'transaction_amount', 'transaction_amount_refunded', 'amount', 'application_fee',
    'fee_details', 'refunds', 'payment_id', 'message', 'error', 'cause', 'raw', 'amount_refunded_to_payer', 'adjustment_amount', 'source', 'date_created'];
  const salida = {};
  for (const c of campos) if (j && j[c] !== undefined) salida[c] = j[c];
  if (salida.refunds) salida.refunds = salida.refunds.map(resumir);
  return salida;
}

async function estadoDelPago(etapa, id) {
  const r = await llamar(etapa + ': GET pago', 'GET', '/v1/payments/' + id);
  const r2 = await llamar(etapa + ': GET reembolsos', 'GET', '/v1/payments/' + id + '/refunds');
  return { pago: r.json, reembolsos: r2.json };
}

async function main() {
  const resToken = await fetch(API + '/v1/card_tokens?public_key=' + encodeURIComponent(env.MP_SELLER_PUBLIC_KEY), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      card_number: '5031755734530604', security_code: '123', expiration_month: 11, expiration_year: 2030,
      cardholder: { name: 'APRO', identification: { type: 'DNI', number: '12345678' } },
    }),
  });
  const tarjeta = await resToken.json();
  if (!tarjeta.id) {
    console.error('No se pudo tokenizar la tarjeta de prueba:', JSON.stringify(resumir(tarjeta)));
    process.exit(1);
  }

  const pago = await llamar('1. pago con application_fee', 'POST', '/v1/payments', {
    transaction_amount: MONTO, token: tarjeta.id, description: 'Spike reembolso parcial', installments: 1,
    payment_method_id: 'master', payer: { email: env.MP_BUYER_EMAIL }, application_fee: COMISION,
    external_reference: 'spike-parcial-' + Date.now(),
  }, randomUUID());
  if (pago.http >= 300 || pago.json.status !== 'approved') {
    console.error('El pago no quedó aprobado:', JSON.stringify(resumir(pago.json)));
    guardar();
    process.exit(1);
  }
  const id = pago.json.id;
  await estadoDelPago('2. antes de reembolsar', id);

  const claveA = randomUUID();
  await llamar('3. reembolso parcial de 300', 'POST', '/v1/payments/' + id + '/refunds', { amount: 300 }, claveA);
  await estadoDelPago('4. después del primer parcial', id);

  await llamar('5. mismo pedido con la misma clave de idempotencia (no debe duplicar)', 'POST', '/v1/payments/' + id + '/refunds', { amount: 300 }, claveA);
  await estadoDelPago('6. después de repetir la clave', id);

  await llamar('7. segundo parcial de 200', 'POST', '/v1/payments/' + id + '/refunds', { amount: 200 }, randomUUID());
  await estadoDelPago('8. después del segundo parcial', id);

  await llamar('9. intento de superar el saldo (600 sobre 500 restantes)', 'POST', '/v1/payments/' + id + '/refunds', { amount: 600 }, randomUUID());

  await llamar('10. intento con monto cero', 'POST', '/v1/payments/' + id + '/refunds', { amount: 0 }, randomUUID());

  await llamar('11. reembolso por el saldo exacto (500)', 'POST', '/v1/payments/' + id + '/refunds', { amount: 500 }, randomUUID());
  await estadoDelPago('12. después del saldo exacto', id);

  await llamar('13. otro reembolso sobre un pago ya reembolsado del todo', 'POST', '/v1/payments/' + id + '/refunds', { amount: 1 }, randomUUID());
  guardar();
}

function guardar() {
  const salida = join(dir, 'resultado-reembolso-parcial.json');
  writeFileSync(salida, JSON.stringify({ fecha: new Date().toISOString(), monto: MONTO, comision: COMISION, bitacora }, null, 2));
  console.log('Resultado sin credenciales guardado en ' + salida);
  for (const fila of bitacora) console.log(fila.etapa, '->', fila.http, JSON.stringify(fila.respuesta).slice(0, 400));
}

main().catch((e) => {
  console.error('Fallo inesperado:', e.message);
  guardar();
  process.exit(1);
});
