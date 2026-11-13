import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { login, ADMIN_USUARIO, ADMIN_PASSWORD_CONOCIDA } from '../tests/helpers/backend';
import { abrirComoUsuario } from '../tests/helpers/multicomercio';
import { abrirComoUsuarioConContexto } from '../tests/helpers/empleado';
import { cargarOCrearEscenario } from './escenario';

const PREFIJO = process.env.PREFIJO || 'antes-';
const DIR = process.env.DIR_CAPTURAS || path.resolve(__dirname, '../../../docs/capturas-escritorio-e4');
const ANCHOS = (process.env.ANCHOS || '1024,1280,1440,1920').split(',').map(Number);
const INTERMEDIOS = process.env.INTERMEDIOS === '1';
const SOLO = process.env.SOLO ? process.env.SOLO.split(',') : null;
const PAGINAS = process.env.PAGINAS ? process.env.PAGINAS.split(',') : null;

interface Pagina {
  rol: string;
  ruta: string;
  nombre: string;
}

test('capturas', async ({ browser, request }) => {
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
  agregar('dueno', ['comercio-dashboard.html', 'comercio-productos.html', ['comercio-producto-form.html', 'producto-form'], 'comercio-pedidos.html', [`comercio-pedido-detalle.html?id=${c.pedidos.pendiente}`, 'pedido-detalle'], 'comercio-perfil.html', 'comercio-estadisticas.html', 'comercio-documentacion.html', 'notificaciones.html', 'mis-consultas.html', 'ayuda.html', 'agregar-comercio.html', ['seleccionar-contexto.html', 'seleccionar-contexto'], [`soporte-consulta.html?id=${c.consultaId}`, 'soporte-consulta']]);
  agregar('empleado', ['comercio-dashboard.html', 'comercio-productos.html', 'comercio-pedidos.html', 'comercio-perfil.html', 'notificaciones.html']);
  agregar('admin', ['admin-dashboard.html', 'admin-comercios-pendientes.html', 'admin-comercios.html', 'admin-resolicitudes.html', 'admin-documentos.html', 'admin-soporte.html', 'admin-clientes.html', 'admin-duenos.html', 'admin-reembolsos.html', 'admin-tarifas.html', 'admin-categorias.html', 'admin-tags.html', 'admin-reclamos.html', [`admin-comercio-detalle.html?id=${a.comercioPendienteId}`, 'comercio-detalle'], [`admin-resolicitud-detalle.html?id=${a.resolicitudId}`, 'resolicitud-detalle'], [`admin-documento-revision.html?comercioId=${a.comercioBaseId}&id=${a.documentoId}`, 'documento-revision'], [`admin-comercio-equipo.html?id=${a.comercioBaseId}`, 'comercio-equipo'], [`admin-comercio-actividad.html?id=${a.comercioBaseId}`, 'comercio-actividad']]);
  agregar('cliente', ['index.html', 'explorar.html', [`comercio-detalle.html?id=${c.dueno.comercioId}`, 'comercio-detalle'], 'carrito.html', 'checkout.html', 'pedidos.html', [`pedidos.html?id=${c.pedidoEnCamino}`, 'pedidos-id'], [`pedido-detalle.html?id=${c.pedidoEnCamino}`, 'pedido-detalle'], 'perfil.html', 'notificaciones.html', 'mis-consultas.html', [`reclamo-nuevo.html?pedido=${c.pedidoReclamable}`, 'reclamo-nuevo'], 'ayuda.html', [`soporte-consulta.html?id=${c.consultaId}`, 'soporte-consulta'], 'soporte.html']);

  const sesiones: Record<string, () => Promise<Awaited<ReturnType<typeof login>> | null>> = {
    acceso: async () => null,
    dueno: () => login(request, c.dueno.nombreUsuario, c.dueno.password),
    empleado: () => login(request, c.empleado.nombreUsuario, c.empleado.password),
    admin: () => login(request, ADMIN_USUARIO, ADMIN_PASSWORD_CONOCIDA),
    cliente: () => login(request, c.cliente.nombreUsuario, c.cliente.password),
  };
  const informe: unknown[] = [];
  for (const rol of Object.keys(sesiones)) {
    if (SOLO && !SOLO.includes(rol)) continue;
    const sesion = await sesiones[rol]();
    const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await contexto.route(/^https:\/\/fonts\.googleapis\.com\//, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await contexto.route(/^https:\/\/fonts\.gstatic\.com\//, (r) => r.abort());
    const page = await contexto.newPage();
    if (sesion && rol === 'empleado') {
      await abrirComoUsuarioConContexto(page, sesion, { contexto: { tipo: 'EMPLEADO', comercioId: c.dueno.comercioId }, ultimoContexto: `EMPLEADO:${c.dueno.comercioId}` });
    } else if (sesion && rol === 'dueno') {
      await abrirComoUsuarioConContexto(page, sesion, { contexto: { tipo: 'DUENO', comercioId: c.dueno.comercioId }, ultimoContexto: `DUENO:${c.dueno.comercioId}` });
    } else if (sesion) {
      await abrirComoUsuario(page, sesion);
    }
    const errores: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errores.push(m.text());
    });
    for (const p of paginas.filter((x) => x.rol === rol && (!PAGINAS || PAGINAS.some((n) => x.nombre.includes(n))))) {
      const anchos = INTERMEDIOS ? [1023, 700] : ANCHOS;
      for (const ancho of anchos) {
        errores.length = 0;
        await page.setViewportSize({ width: ancho, height: 900 });
        try {
          await page.goto(`/${p.ruta}`, { waitUntil: 'load' });
          await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(700);
          const m = await page.evaluate(() => {
            const w = window.innerWidth;
            const sobran = document.documentElement.scrollWidth - w;
            const chicos: string[] = [];
            document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab]').forEach((el) => {
              const r = (el as HTMLElement).getBoundingClientRect();
              const st = getComputedStyle(el);
              if (r.width === 0 || r.height === 0 || st.visibility === 'hidden' || st.display === 'none') return;
              if (r.height < 32 || r.width < 32) {
                chicos.push(`${el.tagName.toLowerCase()}[${(el as HTMLElement).dataset.testid || ''}] ${Math.round(r.width)}x${Math.round(r.height)} ${(el.textContent || '').trim().slice(0, 20)}`);
              }
            });
            const desbordan: string[] = [];
            document.querySelectorAll('body *').forEach((el) => {
              const r = (el as HTMLElement).getBoundingClientRect();
              if (r.width > 0 && r.right > w + 1 && getComputedStyle(el).position !== 'fixed') {
                desbordan.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 40)} der=${Math.round(r.right)}`);
              }
            });
            return { url: location.pathname + location.search, sobran, nChicos: chicos.length, chicos: chicos.slice(0, 10), desbordan: desbordan.slice(0, 5), altoDoc: document.documentElement.scrollHeight };
          });
          informe.push({ pagina: p.nombre, ancho, ...m, errores: [...errores] });
          if (!process.env.SIN_FOTO) await page.screenshot({ path: path.join(DIR, `${PREFIJO}${p.nombre}-${ancho}.png`), fullPage: true });
        } catch (e) {
          informe.push({ pagina: p.nombre, ancho, fallo: String(e).slice(0, 200) });
        }
      }
    }
    await contexto.close();
  }
  writeFileSync(path.join(DIR, `${PREFIJO}informe${SOLO ? '-' + SOLO.join('_') : ''}${INTERMEDIOS ? '-inter' : ''}.json`), JSON.stringify(informe, null, 1));
});
