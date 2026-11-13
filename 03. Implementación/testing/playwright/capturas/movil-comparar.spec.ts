import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { login, ADMIN_USUARIO, ADMIN_PASSWORD_CONOCIDA } from '../tests/helpers/backend';
import { abrirComoUsuario } from '../tests/helpers/multicomercio';
import { abrirComoUsuarioConContexto } from '../tests/helpers/empleado';
import { cargarOCrearEscenario } from './escenario';

const { PNG } = require('playwright-core/lib/utilsBundle') as { PNG: any };

const BASE = process.env.URL_BASE || 'http://localhost:5502';
const ACTUAL = process.env.URL_ACTUAL || 'http://localhost:5501';
const DIR = process.env.DIR_DIFF || path.resolve(__dirname, '../../../docs/capturas-escritorio-e4/movil-diferencias');
const ANCHOS = (process.env.ANCHOS || '375,390,700').split(',').map(Number);
const SOLO = process.env.SOLO ? process.env.SOLO.split(',') : null;
const PAGINAS = process.env.PAGINAS ? process.env.PAGINAS.split(',') : null;
const HORA_FIJA = new Date('2026-11-12T23:30:00-03:00');

interface Pagina {
  rol: string;
  ruta: string;
  nombre: string;
}

function comparar(a: Buffer, b: Buffer): { iguales: boolean; mismoTamano: boolean; pixelesDistintos: number; ancho: number; alto: number; diff?: Buffer } {
  const imagenA = PNG.sync.read(a);
  const imagenB = PNG.sync.read(b);
  if (imagenA.width !== imagenB.width || imagenA.height !== imagenB.height) {
    return { iguales: false, mismoTamano: false, pixelesDistintos: -1, ancho: imagenA.width, alto: imagenA.height };
  }
  const diff = new PNG({ width: imagenA.width, height: imagenA.height });
  let distintos = 0;
  for (let i = 0; i < imagenA.data.length; i += 4) {
    const igual = imagenA.data[i] === imagenB.data[i] && imagenA.data[i + 1] === imagenB.data[i + 1] && imagenA.data[i + 2] === imagenB.data[i + 2] && imagenA.data[i + 3] === imagenB.data[i + 3];
    if (igual) {
      diff.data[i] = 255;
      diff.data[i + 1] = 255;
      diff.data[i + 2] = 255;
      diff.data[i + 3] = 255;
    } else {
      distintos += 1;
      diff.data[i] = 255;
      diff.data[i + 1] = 0;
      diff.data[i + 2] = 0;
      diff.data[i + 3] = 255;
    }
  }
  return { iguales: distintos === 0, mismoTamano: true, pixelesDistintos: distintos, ancho: imagenA.width, alto: imagenA.height, diff: distintos > 0 ? PNG.sync.write(diff) : undefined };
}

test('comparar la móvil contra el commit anterior al escritorio', async ({ browser, request }) => {
  mkdirSync(DIR, { recursive: true });
  const esc = await cargarOCrearEscenario(request);
  const c = esc.cliente;
  const a = esc.admin;
  const paginas: Pagina[] = [];
  const agregar = (rol: string, rutas: Array<string | [string, string]>) => {
    for (const r of rutas) {
      const [ruta, nombre] = Array.isArray(r) ? r : [r, r.replace(/\.html.*$/, '').replace(/[/?=&]/g, '-')];
      paginas.push({ rol, ruta, nombre: `${rol}-${nombre}` });
    }
  };
  agregar('acceso', ['login.html', 'bienvenida.html', 'registro-tipo-cuenta.html', 'registro-cliente.html', 'registro-comercio.html', 'recuperar-password.html', ['verificar-email.html?email=a%40b.com', 'verificar-email'], 'reactivar-cuenta.html', 'invitacion-empleado.html', 'soporte.html', 'terminos.html', 'privacidad.html', 'faq.html', 'splash.html', 'errores/404.html', 'errores/500.html', 'errores/acceso-denegado.html', 'errores/sesion-expirada.html', 'errores/sin-conexion.html', 'errores/timeout.html']);
  agregar('dueno', ['comercio-dashboard.html', 'comercio-productos.html', ['comercio-producto-form.html', 'producto-form'], 'comercio-pedidos.html', [`comercio-pedido-detalle.html?id=${c.pedidos.pendiente}`, 'pedido-detalle'], 'comercio-perfil.html', 'comercio-estadisticas.html', 'comercio-documentacion.html', 'notificaciones.html', 'mis-consultas.html', 'ayuda.html', 'agregar-comercio.html']);
  agregar('empleado', ['comercio-dashboard.html', 'comercio-productos.html', 'comercio-pedidos.html', 'comercio-perfil.html', 'notificaciones.html', 'ayuda.html']);
  agregar('admin', ['admin-dashboard.html', 'admin-comercios-pendientes.html', 'admin-comercios.html', 'admin-resolicitudes.html', 'admin-documentos.html', 'admin-soporte.html', 'admin-clientes.html', 'admin-duenos.html', 'admin-reembolsos.html', 'admin-tarifas.html', 'admin-categorias.html', 'admin-tags.html', 'admin-reclamos.html', [`admin-comercio-detalle.html?id=${a.comercioPendienteId}`, 'comercio-detalle'], [`admin-resolicitud-detalle.html?id=${a.resolicitudId}`, 'resolicitud-detalle'], [`admin-documento-revision.html?comercioId=${a.comercioBaseId}&id=${a.documentoId}`, 'documento-revision'], [`admin-comercio-equipo.html?id=${a.comercioBaseId}`, 'comercio-equipo'], [`admin-comercio-actividad.html?id=${a.comercioBaseId}`, 'comercio-actividad']]);
  agregar('cliente', ['index.html', 'explorar.html', [`comercio-detalle.html?id=${c.dueno.comercioId}`, 'comercio-detalle'], 'carrito.html', 'checkout.html', 'pedidos.html', [`pedido-detalle.html?id=${c.pedidoEnCamino}`, 'pedido-detalle'], 'perfil.html', 'notificaciones.html', 'mis-consultas.html', [`reclamo-nuevo.html?pedido=${c.pedidoReclamable}`, 'reclamo-nuevo'], 'ayuda.html', [`soporte-consulta.html?id=${c.consultaId}`, 'soporte-consulta'], 'soporte.html']);

  const sesiones: Record<string, () => Promise<Awaited<ReturnType<typeof login>> | null>> = {
    acceso: async () => null,
    dueno: () => login(request, c.dueno.nombreUsuario, c.dueno.password),
    empleado: () => login(request, c.empleado.nombreUsuario, c.empleado.password),
    admin: () => login(request, ADMIN_USUARIO, ADMIN_PASSWORD_CONOCIDA),
    cliente: () => login(request, c.cliente.nombreUsuario, c.cliente.password),
  };

  const resultados: Array<Record<string, unknown>> = [];
  for (const rol of Object.keys(sesiones)) {
    if (SOLO && !SOLO.includes(rol)) continue;
    const sesion = await sesiones[rol]();
    const paginasDelRol = paginas.filter((p) => p.rol === rol && (!PAGINAS || PAGINAS.some((n) => p.nombre.includes(n))));
    const contextos = [BASE, ACTUAL].map(async (origen) => {
      const contexto = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: origen, reducedMotion: 'reduce' });
      await contexto.route(/^https:\/\/fonts\.googleapis\.com\//, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      await contexto.route(/^https:\/\/fonts\.gstatic\.com\//, (r) => r.abort());
      await contexto.route(/^https:\/\/res\.cloudinary\.com\//, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') }));
      await contexto.route('**/api/v1/catalogo/**', async (ruta) => {
        if (ruta.request().method() !== 'GET') {
          return ruta.continue();
        }
        const respuesta = await ruta.fetch();
        let json: any;
        try {
          json = await respuesta.json();
        } catch {
          return ruta.fulfill({ response: respuesta });
        }
        const ordenar = (lista: any[]) => lista.sort((a: any, b: any) => (a.id ?? 0) - (b.id ?? 0));
        if (json && Array.isArray(json.data)) {
          ordenar(json.data);
        } else if (json && json.data && typeof json.data === 'object') {
          Object.values(json.data).forEach((valor) => {
            if (Array.isArray(valor)) ordenar(valor);
          });
        }
        return ruta.fulfill({ response: respuesta, json });
      });
      const page = await contexto.newPage();
      await page.clock.install({ time: HORA_FIJA });
      await page.clock.setFixedTime(HORA_FIJA);
      if (sesion && rol === 'empleado') {
        await abrirComoUsuarioConContexto(page, sesion, { contexto: { tipo: 'EMPLEADO', comercioId: c.dueno.comercioId }, ultimoContexto: `EMPLEADO:${c.dueno.comercioId}` });
      } else if (sesion && rol === 'dueno') {
        await abrirComoUsuarioConContexto(page, sesion, { contexto: { tipo: 'DUENO', comercioId: c.dueno.comercioId }, ultimoContexto: `DUENO:${c.dueno.comercioId}` });
      } else if (sesion) {
        await abrirComoUsuario(page, sesion);
      }
      return { contexto, page };
    });
    const [base, actual] = await Promise.all(contextos);
    for (const p of paginasDelRol) {
      for (const ancho of ANCHOS) {
        const tomar = async (pagina: typeof base.page) => {
          await pagina.setViewportSize({ width: ancho, height: 844 });
          await pagina.goto(`/${p.ruta}`, { waitUntil: 'load' });
          await pagina.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
          await pagina.waitForTimeout(1200);
          const urlFinal = new URL(pagina.url());
          const captura = await pagina.screenshot({ fullPage: true, animations: 'disabled' });
          const cajas = await pagina.evaluate(() => {
            const lista: string[] = [];
            document.querySelectorAll('body *').forEach((el) => {
              const r = (el as HTMLElement).getBoundingClientRect();
              if (r.width > 0 && r.height > 0) lista.push(`${el.tagName}:${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`);
            });
            return lista;
          });
          return { captura, cajas, ruta: urlFinal.pathname + urlFinal.search };
        };
        const resultadoBase = await tomar(base.page);
        const resultadoActual = await tomar(actual.page);
        const cmp = comparar(resultadoBase.captura, resultadoActual.captura);
        const cajasIguales = resultadoBase.cajas.join('|') === resultadoActual.cajas.join('|');
        const soloBase = resultadoBase.cajas.filter((caja: string) => !resultadoActual.cajas.includes(caja)).slice(0, 8);
        const soloActual = resultadoActual.cajas.filter((caja: string) => !resultadoBase.cajas.includes(caja)).slice(0, 8);
        const entrada = { pagina: p.nombre, ancho, iguales: cmp.iguales, pixelesDistintos: cmp.pixelesDistintos, mismoTamano: cmp.mismoTamano, cajasIguales, rutaBase: resultadoBase.ruta, rutaActual: resultadoActual.ruta, ...(cajasIguales ? {} : { soloBase, soloActual, cantidadBase: resultadoBase.cajas.length, cantidadActual: resultadoActual.cajas.length }) };
        resultados.push(entrada);
        if (!cmp.iguales || !cajasIguales) {
          writeFileSync(path.join(DIR, `${p.nombre}-${ancho}-base.png`), resultadoBase.captura);
          writeFileSync(path.join(DIR, `${p.nombre}-${ancho}-actual.png`), resultadoActual.captura);
          if (cmp.diff) writeFileSync(path.join(DIR, `${p.nombre}-${ancho}-diff.png`), cmp.diff);
        }
      }
    }
    await base.contexto.close();
    await actual.contexto.close();
  }
  writeFileSync(path.join(DIR, `resultado${SOLO ? '-' + SOLO.join('_') : ''}.json`), JSON.stringify(resultados, null, 1));
  const distintos = resultados.filter((r) => !r.iguales || !r.cajasIguales);
  console.log(`TOTAL ${resultados.length} · distintos ${distintos.length}`);
  for (const d of distintos) console.log(JSON.stringify(d));
});
