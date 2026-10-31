import { createServer } from 'node:http';

const PUERTO = Number(process.env.MP_STUB_PORT || 9099);
const BASE_ID_PAGO = 100000;
const DEMORA_MS = Number(process.env.MP_STUB_DEMORA_MS || 60);

const estados = new Map();
const contadores = { consultas: 0, preferencias: 0, reembolsos: 0, tokens: 0 };

const pago = (pedidoId) => ({
  id: BASE_ID_PAGO + pedidoId,
  status: estados.get(pedidoId) || 'approved',
  external_reference: String(pedidoId),
  payment_type_id: 'account_money',
  date_created: '2026-01-01T00:00:00.000-03:00',
  fee_details: [{ type: 'application_fee', fee_payer: 'collector', amount: 300 }],
});

const servidor = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const cuerpoPedido = [];
  req.on('data', (parte) => cuerpoPedido.push(parte));
  req.on('end', () => {
    const responder = (cuerpo, estado = 200, demora = DEMORA_MS) => {
      setTimeout(() => {
        res.writeHead(estado, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(cuerpo));
      }, demora);
    };
    if (url.pathname === '/__control/estado') return responder({ ...contadores }, 200, 0);
    const control = url.pathname.match(/^\/__control\/pago\/(\d+)$/);
    if (control && req.method === 'PUT') {
      estados.set(Number(control[1]), url.searchParams.get('estado') || 'approved');
      return responder({ pedido: Number(control[1]), estado: estados.get(Number(control[1])) }, 200, 0);
    }
    if (req.method === 'POST' && /^\/v1\/payments\/\d+\/refunds$/.test(url.pathname)) {
      contadores.reembolsos += 1;
      return responder({ id: 900000 + contadores.reembolsos, status: 'approved' });
    }
    if (req.method === 'POST' && url.pathname === '/checkout/preferences') {
      contadores.preferencias += 1;
      return responder({
        id: `pref-sim-${contadores.preferencias}`,
        init_point: `https://mp.test/pagar/${contadores.preferencias}`,
        sandbox_init_point: `https://mp.test/sandbox/${contadores.preferencias}`,
      });
    }
    if (req.method === 'POST' && url.pathname === '/oauth/token') {
      contadores.tokens += 1;
      const codigo = Buffer.concat(cuerpoPedido).toString('utf8').match(/"code"\s*:\s*"c(\d+)"/);
      return responder({
        access_token: `APP_USR-sim-${contadores.tokens}`,
        token_type: 'bearer',
        expires_in: 15552000,
        user_id: codigo ? Number(codigo[1]) : 1,
        refresh_token: `TG-sim-${contadores.tokens}`,
        public_key: `APP_USR-pub-${contadores.tokens}`,
      });
    }
    contadores.consultas += 1;
    if (url.pathname === '/v1/payments/search') {
      return responder({ results: [pago(Number(url.searchParams.get('external_reference')))] });
    }
    const m = url.pathname.match(/^\/v1\/payments\/(\d+)$/);
    if (m) return responder(pago(Number(m[1]) - BASE_ID_PAGO));
    return responder({ message: 'no encontrado' }, 404);
  });
});

servidor.listen(PUERTO, () => console.log(`Mercado Pago simulado escuchando en el puerto ${PUERTO}`));
