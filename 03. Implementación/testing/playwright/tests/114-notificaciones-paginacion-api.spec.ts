import { test, expect } from '@playwright/test';
import { API_BASE_URL, sqlTest as sql } from './helpers/backend';
import { borrarAvisos, prepararClienteDeAvisos, sembrarAvisos } from './helpers/avisos-cliente';
import type { ClienteDeAvisos } from './helpers/avisos-cliente';

test.describe('Tramo 2C: API de avisos, paginación por cursor y "marcar todas" personales', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  let cliente: ClienteDeAvisos;
  let otro: ClienteDeAvisos;

  test.beforeAll(async ({ request }) => {
    cliente = await prepararClienteDeAvisos(request);
    otro = await prepararClienteDeAvisos(request);
  });

  test.beforeEach(() => {
    borrarAvisos(cliente.usuarioId);
    borrarAvisos(otro.usuarioId);
  });

  function pedir(request: import('@playwright/test').APIRequestContext, ruta: string, token = cliente.sesion.token, metodo: 'GET' | 'PUT' = 'GET', headers: Record<string, string> = {}) {
    return request.fetch(`${API_BASE_URL}${ruta}`, { method: metodo, headers: { Authorization: `Bearer ${token}`, ...headers } });
  }

  test('sin parámetros devuelve 20, el arreglo sigue siendo data y la cabecera trae el cursor', async ({ request }) => {
    sembrarAvisos(cliente.usuarioId, 45);
    const respuesta = await pedir(request, '/notificaciones');
    expect(respuesta.status()).toBe(200);
    const cuerpo = await respuesta.json();
    expect(Array.isArray(cuerpo.data)).toBe(true);
    expect(cuerpo.data).toHaveLength(20);
    expect(respuesta.headers()['x-siguiente-cursor']).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+_\d+$/);
    expect(cuerpo.data[0].mensaje).toBe('Aviso 1');
  });

  test('recorrer con el cursor entrega las 45 filas sin repetir y la última página no trae cursor', async ({ request }) => {
    sembrarAvisos(cliente.usuarioId, 45);
    const ids: number[] = [];
    let cursor: string | undefined;
    let paginas = 0;
    do {
      const ruta: string = cursor ? `/notificaciones?cursor=${encodeURIComponent(cursor)}` : '/notificaciones';
      const respuesta = await pedir(request, ruta);
      expect(respuesta.status()).toBe(200);
      (await respuesta.json()).data.forEach((n: { id: number }) => ids.push(n.id));
      cursor = respuesta.headers()['x-siguiente-cursor'];
      paginas += 1;
    } while (cursor);
    expect(paginas).toBe(3);
    expect(ids).toHaveLength(45);
    expect(new Set(ids).size).toBe(45);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
  });

  test('exactamente 20 avisos no dejan cursor, y el límite se respeta con tope en 50', async ({ request }) => {
    sembrarAvisos(cliente.usuarioId, 20);
    const exacta = await pedir(request, '/notificaciones');
    expect(exacta.headers()['x-siguiente-cursor']).toBeUndefined();

    sembrarAvisos(cliente.usuarioId, 40, { prefijo: 'Más', desfaseSegundos: 100 });
    expect((await (await pedir(request, '/notificaciones?limite=5')).json()).data).toHaveLength(5);
    const tope = await pedir(request, '/notificaciones?limite=500');
    expect((await tope.json()).data).toHaveLength(50);
    expect(tope.headers()['x-siguiente-cursor']).toBeDefined();
  });

  test('un límite menor que 1 o un cursor roto dan 400', async ({ request }) => {
    expect((await pedir(request, '/notificaciones?limite=0')).status()).toBe(400);
    expect((await pedir(request, '/notificaciones?limite=-3')).status()).toBe(400);
    expect((await pedir(request, '/notificaciones?cursor=basura')).status()).toBe(400);
    expect((await pedir(request, '/notificaciones?cursor=2026-01-01T00:00:00_x')).status()).toBe(400);
  });

  test('el navegador puede leer la cabecera del cursor desde otro origen', async ({ request }) => {
    sembrarAvisos(cliente.usuarioId, 25);
    const respuesta = await pedir(request, '/notificaciones', cliente.sesion.token, 'GET', { Origin: 'http://localhost:5501' });
    expect(respuesta.headers()['access-control-expose-headers']).toContain('X-Siguiente-Cursor');
  });

  test('el contador cuenta todas las no leídas aunque la lista venga paginada', async ({ request }) => {
    sembrarAvisos(cliente.usuarioId, 45);
    expect((await (await pedir(request, '/notificaciones/no-leidas/contador')).json()).data).toBe(45);
  });

  test('marcar todas las personales: marca solo las propias, devuelve la cantidad y es idempotente', async ({ request }) => {
    sembrarAvisos(cliente.usuarioId, 4);
    sembrarAvisos(otro.usuarioId, 3);
    const delComercio = sembrarAvisos(cliente.usuarioId, 1, { comercioId: 987654, prefijo: 'Del comercio' });
    const email = sembrarAvisos(cliente.usuarioId, 1, { canal: 'EMAIL', prefijo: 'Email' });

    const primera = await pedir(request, '/notificaciones/personales/leidas', cliente.sesion.token, 'PUT');
    expect(primera.status()).toBe(200);
    expect((await primera.json()).data).toBe(4);
    const segunda = await pedir(request, '/notificaciones/personales/leidas', cliente.sesion.token, 'PUT');
    expect(segunda.status()).toBe(200);
    expect((await segunda.json()).data).toBe(0);

    expect(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${otro.usuarioId} AND leida = 0;`)).toBe('3');
    expect(sql(`SELECT leida FROM notificacion WHERE id = ${delComercio[0]};`)).toBe('0');
    expect(sql(`SELECT leida FROM notificacion WHERE id = ${email[0]};`)).toBe('0');
    expect((await (await pedir(request, '/notificaciones/no-leidas/contador')).json()).data).toBe(0);
  });

  test('marcar todas las personales ignora el encabezado de comercio y no marca los del comercio', async ({ request }) => {
    sembrarAvisos(cliente.usuarioId, 2);
    const delComercio = sembrarAvisos(cliente.usuarioId, 1, { comercioId: 987654, prefijo: 'Del comercio' });
    const respuesta = await pedir(request, '/notificaciones/personales/leidas', cliente.sesion.token, 'PUT', { 'X-Comercio-Id': '987654' });
    expect(respuesta.status()).toBe(200);
    expect((await respuesta.json()).data).toBe(2);
    expect(sql(`SELECT leida FROM notificacion WHERE id = ${delComercio[0]};`)).toBe('0');
  });

  test('marca por lotes una cantidad grande', async ({ request }) => {
    sembrarAvisos(cliente.usuarioId, 620);
    const respuesta = await pedir(request, '/notificaciones/personales/leidas', cliente.sesion.token, 'PUT');
    expect((await respuesta.json()).data).toBe(620);
    expect(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${cliente.usuarioId} AND leida = 0;`)).toBe('0');
  });

  test('sin sesión da 401', async ({ request }) => {
    const respuesta = await request.fetch(`${API_BASE_URL}/notificaciones/personales/leidas`, { method: 'PUT' });
    expect(respuesta.status()).toBe(401);
  });
});
