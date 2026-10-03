import { readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const envPath = join(dir, '.env');

function cargarEnv() {
  if (!existsSync(envPath)) {
    console.error('Falta el archivo ' + envPath + ' (copiá .env.example a .env y completalo)');
    process.exit(1);
  }
  const env = {};
  for (const linea of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = linea.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    let valor = t.slice(i + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    env[t.slice(0, i).trim()] = valor;
  }
  return env;
}

const env = cargarEnv();
for (const nombre of ['MP_SELLER_ACCESS_TOKEN', 'MP_SELLER_PUBLIC_KEY', 'MP_BUYER_EMAIL']) {
  if (!env[nombre]) {
    console.error('Falta la variable ' + nombre + ' en ' + envPath);
    process.exit(1);
  }
}

const ACCESS_TOKEN = env.MP_SELLER_ACCESS_TOKEN;
const PUBLIC_KEY = env.MP_SELLER_PUBLIC_KEY;
const BUYER_EMAIL = env.MP_BUYER_EMAIL;
const API = 'https://api.mercadopago.com';

async function leerJson(res) {
  const texto = await res.text();
  try {
    return JSON.parse(texto);
  } catch {
    return { raw: texto };
  }
}

function errorMp(httpStatus, cuerpo, etapa) {
  return {
    httpStatus,
    id: null,
    status: 'ERROR',
    status_detail: etapa + ': ' + (cuerpo.message || cuerpo.error || JSON.stringify(cuerpo)),
    error: { message: cuerpo.message, cause: cuerpo.cause, cuerpo }
  };
}

async function crearPago({ nombreTitular, monto, externalReference }) {
  const resToken = await fetch(API + '/v1/card_tokens?public_key=' + encodeURIComponent(PUBLIC_KEY), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      card_number: '5031755734530604',
      security_code: '123',
      expiration_month: 11,
      expiration_year: 2030,
      cardholder: {
        name: nombreTitular,
        identification: { type: 'DNI', number: '12345678' }
      }
    })
  });
  const cuerpoToken = await leerJson(resToken);
  if (!resToken.ok || !cuerpoToken.id) {
    return errorMp(resToken.status, cuerpoToken, 'card_token');
  }

  const resPago = await fetch(API + '/v1/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + ACCESS_TOKEN,
      'X-Idempotency-Key': randomUUID()
    },
    body: JSON.stringify({
      transaction_amount: monto,
      token: cuerpoToken.id,
      description: 'Prueba automatizada',
      installments: 1,
      payment_method_id: 'master',
      payer: { email: BUYER_EMAIL },
      external_reference: externalReference
    })
  });
  const cuerpoPago = await leerJson(resPago);
  if (!resPago.ok) {
    return errorMp(resPago.status, cuerpoPago, 'payment');
  }
  return {
    httpStatus: resPago.status,
    id: cuerpoPago.id,
    status: cuerpoPago.status,
    status_detail: cuerpoPago.status_detail
  };
}

async function buscarPagos(externalReference) {
  const res = await fetch(
    API + '/v1/payments/search?external_reference=' + encodeURIComponent(externalReference),
    { headers: { Authorization: 'Bearer ' + ACCESS_TOKEN } }
  );
  const cuerpo = await leerJson(res);
  if (!res.ok) {
    return { httpStatus: res.status, error: cuerpo, pagos: [] };
  }
  return { httpStatus: res.status, pagos: cuerpo.results || [] };
}

async function main() {
  const corrida = 'spike-' + Date.now();
  const filas = [];
  let contador = 0;
  let monto = 1000;

  async function ejecutar(escenario, nombreTitular, externalReference) {
    contador += 1;
    monto += 1;
    const r = await crearPago({ nombreTitular, monto, externalReference });
    filas.push({
      escenario,
      http: r.httpStatus,
      id: r.id,
      status: r.status,
      status_detail: r.status_detail
    });
    if (r.error) {
      console.error('Error en ' + escenario + ':', JSON.stringify(r.error, null, 2));
    }
    return r;
  }

  await ejecutar('APRO', 'APRO', corrida + '-1');
  await ejecutar('OTHE', 'OTHE', corrida + '-2');
  await ejecutar('CONT', 'CONT', corrida + '-3');

  const refReintento = corrida + '-4';
  await ejecutar('Reintento: OTHE', 'OTHE', refReintento);
  await ejecutar('Reintento: APRO', 'APRO', refReintento);

  console.table(filas);

  console.log('\nBusqueda por external_reference=' + refReintento);
  const busqueda = await buscarPagos(refReintento);
  if (busqueda.error) {
    console.error('Error en la busqueda (HTTP ' + busqueda.httpStatus + '):', JSON.stringify(busqueda.error, null, 2));
    return;
  }
  console.table(
    busqueda.pagos.map((p) => ({
      id: p.id,
      status: p.status,
      status_detail: p.status_detail,
      date_created: p.date_created
    }))
  );
}

main().catch((e) => {
  console.error('Fallo inesperado:', e.message);
  process.exit(1);
});
