import { test, expect } from '@playwright/test';
import type { APIRequestContext, Page, Request } from '@playwright/test';
import {
  aTitleCase,
  apiGet,
  clonarComercioTest,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  suspenderComercio,
  sufijoUnico,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import { loginUi, prepararAprobado, prepararRechazado, registrarPendiente } from './helpers/multicomercio';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
import type { Dueno } from './helpers/multicomercio';
import {
  CLAVE_ULTIMO_PREFIJO,
  abrirComoUsuarioConComercio,
  abrirPanel,
  comercioActivoEnSesion,
  mantenerApretado,
  seleccionarComercioEnPanel,
  ultimoComercioGuardado,
} from './helpers/selector';

const VIEWPORT = { width: 390, height: 844 };
const HEADER = 'x-comercio-id';
const MOTIVO = 'Motivo del tramo 4 entrega B';

interface Grande {
  dueno: Dueno;
  a: number;
  b: number;
  d: number;
  p: number;
  r: number;
  s: number;
  nombres: Record<number, string>;
}

let adminToken: string;
let localidadId: string;
let grande: Grande;
let sinOperativos: { dueno: Dueno; r: number; p: number; d: number };

function insertarNotificaciones(duenoId: number, comercioId: number, cantidad: number, mensaje: string) {
  for (let i = 1; i <= cantidad; i += 1) {
    sql(
      `INSERT INTO notificacion (usuario_id, tipo, mensaje, leida, fecha_creacion, canal, estado, entidad_tipo, entidad_id) ` +
        `VALUES (${duenoId}, 'COMERCIO_APROBADO', '${mensaje} ${i}', 0, NOW(), 'PUSH', 'PENDIENTE', 'COMERCIO', ${comercioId});`,
    );
  }
}

async function nombresDe(request: APIRequestContext, token: string): Promise<Record<number, string>> {
  const { body } = await apiGet(request, '/comercios/mis-comercios', token);
  return Object.fromEntries((body.data as any[]).map((c) => [c.id, c.nombre]));
}

async function armarGrande(request: APIRequestContext): Promise<Grande> {
  const dueno = await prepararAprobado(request, adminToken, localidadId);
  const suf = sufijoUnico().slice(-6);
  const clon = (nombre: string, estado: string) => clonarComercioTest(request, dueno.comercioId, aTitleCase(`${nombre} ${suf}`), estado);
  const b = await clon('Beta', 'APROBADO');
  const d = await clon('Delta', 'RECHAZO_DEFINITIVO');
  const p = await clon('Pendiente', 'PENDIENTE');
  const r = await clon('Rechazado', 'RECHAZADO');
  const s = await clon('Suspendido', 'SUSPENDIDO');
  const sesion = await login(request, dueno.nombreUsuario, dueno.password);
  const nombres = await nombresDe(request, sesion.token);
  insertarNotificaciones(dueno.duenoId, b, 2, 'Aviso B');
  insertarNotificaciones(dueno.duenoId, p, 1, 'Aviso P');
  insertarNotificaciones(dueno.duenoId, r, 1, 'Aviso R');
  return { dueno, a: dueno.comercioId, b, d, p, r, s, nombres };
}

async function armarSinOperativos(request: APIRequestContext) {
  const dueno = await prepararRechazado(request, adminToken, localidadId, MOTIVO);
  const p = await clonarComercioTest(request, dueno.comercioId, aTitleCase(`Pendiente Sin Op ${sufijoUnico().slice(-6)}`), 'PENDIENTE');
  const d = await clonarComercioTest(request, dueno.comercioId, aTitleCase(`Definitivo Sin Op ${sufijoUnico().slice(-6)}`), 'RECHAZO_DEFINITIVO');
  return { dueno, r: dueno.comercioId, p, d };
}

async function sesionFresca(request: APIRequestContext, dueno: Dueno): Promise<SesionApi> {
  return login(request, dueno.nombreUsuario, dueno.password);
}

async function abrirDashboardDe(page: Page, request: APIRequestContext, dueno: Dueno, opciones: { ultimo?: number; activo?: number } = {}) {
  const sesion = await sesionFresca(request, dueno);
  await abrirComoUsuarioConComercio(page, sesion, { ultimoComercioId: opciones.ultimo, comercioActivoId: opciones.activo });
  await page.goto('/comercio-dashboard.html');
  await expect(page.getByTestId('franja-comercio')).toBeVisible();
  return sesion;
}

async function sembrarUltimo(page: Page, duenoId: number, comercioId: number) {
  await page.addInitScript(
    ([clave, valor]) => {
      localStorage.setItem(clave, valor);
    },
    [`${CLAVE_ULTIMO_PREFIJO}${duenoId}`, String(comercioId)],
  );
}

function registrarHeaders(page: Page, fragmento: string): Array<string | undefined> {
  const encontrados: Array<string | undefined> = [];
  page.on('request', (peticion: Request) => {
    if (peticion.url().includes(fragmento)) {
      encontrados.push(peticion.headers()[HEADER]);
    }
  });
  return encontrados;
}

test.describe('Multi-comercio, tramo 4B: selector de comercio del Dueño (UI)', () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ viewport: VIEWPORT });

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    grande = await armarGrande(request);
    sinOperativos = await armarSinOperativos(request);
  });

  test.describe('login: a qué comercio entra el Dueño', () => {
    test('entra con el último usado cuando es válido, no con el más antiguo', async ({ page }) => {
      await sembrarUltimo(page, grande.dueno.duenoId, grande.b);
      await loginUi(page, grande.dueno.nombreUsuario, grande.dueno.password);
      await page.waitForURL('**/comercio-dashboard.html');
      await expect(page.getByTestId('franja-comercio-nombre')).toHaveText(grande.nombres[grande.b]);
      expect((await comercioActivoEnSesion(page))?.comercioId).toBe(grande.b);
    });

    for (const caso of ['pendiente', 'ajeno', 'inexistente']) {
      test(`un último usado ${caso} no sirve: entra con el operativo más antiguo`, async ({ page, request }) => {
        let ultimo = 99999999;
        if (caso === 'pendiente') {
          ultimo = grande.p;
        } else if (caso === 'ajeno') {
          ultimo = (await registrarPendiente(request, adminToken, localidadId)).comercioId;
        }
        await sembrarUltimo(page, grande.dueno.duenoId, ultimo);
        await loginUi(page, grande.dueno.nombreUsuario, grande.dueno.password);
        await page.waitForURL('**/comercio-dashboard.html');
        await expect(page.getByTestId('franja-comercio-nombre')).toHaveText(grande.nombres[grande.a]);
        expect((await comercioActivoEnSesion(page))?.comercioId).toBe(grande.a);
        expect(await ultimoComercioGuardado(page, grande.dueno.duenoId)).toBe(grande.a);
      });
    }

    test('sin operativos entra por el rechazado, y no guarda nada como activo ni como último', async ({ page }) => {
      await loginUi(page, sinOperativos.dueno.nombreUsuario, sinOperativos.dueno.password);
      await page.waitForURL(`**/comercio-rechazado.html?id=${sinOperativos.r}`);
      expect(await comercioActivoEnSesion(page)).toBeNull();
      expect(await ultimoComercioGuardado(page, sinOperativos.dueno.duenoId)).toBeNull();
    });

    test('sin operativos ni rechazados entra por el pendiente', async ({ page, request }) => {
      const dueno = await registrarPendiente(request, adminToken, localidadId);
      await clonarComercioTest(request, dueno.comercioId, aTitleCase(`Definitivo Aparte ${sufijoUnico().slice(-6)}`), 'RECHAZO_DEFINITIVO');
      await loginUi(page, dueno.nombreUsuario, dueno.password);
      await page.waitForURL(`**/comercio-pendiente.html?id=${dueno.comercioId}`);
    });

    test('con solo un rechazo definitivo entra por su pantalla', async ({ page, request }) => {
      const dueno = await prepararRechazado(request, adminToken, localidadId, MOTIVO);
      sql(`UPDATE comercio SET estado = 'RECHAZO_DEFINITIVO' WHERE id = ${dueno.comercioId};`);
      await loginUi(page, dueno.nombreUsuario, dueno.password);
      await page.waitForURL(`**/comercio-rechazo-definitivo.html?id=${dueno.comercioId}`);
    });

    test('con solo un comercio suspendido se queda en el login con el aviso de siempre', async ({ page, request }) => {
      const dueno = await prepararAprobado(request, adminToken, localidadId);
      await suspenderComercio(request, adminToken, dueno.comercioId, MOTIVO);
      await loginUi(page, dueno.nombreUsuario, dueno.password);
      await expect(page.getByTestId('mensaje-banner')).toContainText('no está operativo');
      expect(page.url()).toContain('/login.html');
    });

    test('un Dueño distinto en la misma pestaña no hereda el comercio del anterior', async ({ page, request }) => {
      const otro = await prepararAprobado(request, adminToken, localidadId);
      const encabezados = registrarHeaders(page, '/pedidos/comercio');
      await loginUi(page, grande.dueno.nombreUsuario, grande.dueno.password);
      await page.waitForURL('**/comercio-dashboard.html');
      expect((await comercioActivoEnSesion(page))?.comercioId).toBe(grande.a);
      await page.getByTestId('btn-nav-perfil').click();
      await page.waitForURL('**/comercio-perfil.html');
      await page.getByTestId('btn-cerrar-sesion').click();
      await page.getByTestId('btn-confirmar-logout').click();
      await page.waitForURL('**/login.html**');
      expect(await comercioActivoEnSesion(page)).toBeNull();
      await loginUi(page, otro.nombreUsuario, otro.password);
      await page.waitForURL('**/comercio-dashboard.html');
      expect((await comercioActivoEnSesion(page))?.comercioId).toBe(otro.comercioId);
      await expect.poll(() => encabezados.at(-1)).toBe(String(otro.comercioId));
    });
  });

  test.describe('franja y panel', () => {
    test('la franja aparece en las 4 pestañas con el nombre del comercio activo y "Cambiar"', async ({ page, request }) => {
      await abrirDashboardDe(page, request, grande.dueno);
      for (const ruta of ['comercio-dashboard.html', 'comercio-productos.html', 'comercio-pedidos.html', 'comercio-perfil.html']) {
        await page.goto(`/${ruta}`);
        await expect(page.getByTestId('franja-comercio-nombre')).toHaveText(grande.nombres[grande.a]);
        await expect(page.getByTestId('franja-comercio')).toContainText('Cambiar');
      }
    });

    test('las pantallas de detalle y de formulario no llevan franja', async ({ page, request }) => {
      await abrirDashboardDe(page, request, grande.dueno);
      const rutas = [
        'comercio-pedido-detalle.html?id=1',
        'comercio-producto-form.html',
        'notificaciones.html',
        'agregar-comercio.html',
        `comercio-corregir.html?id=${grande.r}`,
      ];
      for (const ruta of rutas) {
        await page.goto(`/${ruta}`);
        await page.waitForLoadState('networkidle');
        await expect(page.getByTestId('franja-comercio')).toHaveCount(0);
      }
    });

    test('la franja no pisa el header de ninguna pestaña a 360 px y no hay scroll horizontal', async ({ page, request }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await abrirDashboardDe(page, request, grande.dueno);
      for (const ruta of ['comercio-dashboard.html', 'comercio-productos.html', 'comercio-pedidos.html', 'comercio-perfil.html']) {
        await page.goto(`/${ruta}`);
        await expect(page.getByTestId('franja-comercio-nombre')).toBeVisible();
        const medidas = await page.evaluate(() => {
          const header = document.querySelector('header')!.getBoundingClientRect();
          const franja = document.querySelector('[data-testid="franja-comercio"]')!.getBoundingClientRect();
          return { headerFondo: header.bottom, franjaTope: franja.top, franjaDerecha: franja.right, ancho: document.documentElement.scrollWidth };
        });
        expect(medidas.franjaTope).toBeGreaterThanOrEqual(medidas.headerFondo - 0.5);
        expect(medidas.franjaDerecha).toBeLessThanOrEqual(360);
        expect(medidas.ancho).toBeLessThanOrEqual(360);
      }
    });

    test('mientras carga muestra un esqueleto y después la franja real', async ({ page, request }) => {
      const sesion = await sesionFresca(request, grande.dueno);
      await abrirComoUsuarioConComercio(page, sesion);
      await page.route('**/comercios/mis-comercios', async (ruta) => {
        await new Promise((resolver) => setTimeout(resolver, 1200));
        await ruta.continue();
      });
      await page.goto('/comercio-pedidos.html');
      await expect(page.getByTestId('franja-comercio-cargando')).toBeVisible();
      await expect(page.getByTestId('franja-comercio')).toBeVisible();
      await expect(page.getByTestId('franja-comercio-cargando')).toHaveCount(0);
    });

    test('el panel agrupa y ordena: operativos, pendientes, rechazados (definitivos al final) y otros', async ({ page, request }) => {
      await abrirDashboardDe(page, request, grande.dueno);
      await abrirPanel(page);
      const panel = page.getByTestId('panel-comercios');
      await expect(panel.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
      const grupos = await panel.locator('[data-testid^="grupo-comercios-"]').evaluateAll((nodos) => nodos.map((n) => n.getAttribute('data-testid')));
      expect(grupos).toEqual(['grupo-comercios-operativos', 'grupo-comercios-pendientes', 'grupo-comercios-rechazados', 'grupo-comercios-otros']);
      const ordenOperativos = await panel.getByTestId('grupo-comercios-operativos').locator('[data-testid^="fila-comercio-"]').evaluateAll((n) => n.map((x) => x.getAttribute('data-testid')));
      expect(ordenOperativos).toEqual([`fila-comercio-${grande.a}`, `fila-comercio-${grande.b}`]);
      const ordenRechazados = await panel.getByTestId('grupo-comercios-rechazados').locator('[data-testid^="fila-comercio-"]').evaluateAll((n) => n.map((x) => x.getAttribute('data-testid')));
      expect(ordenRechazados).toEqual([`fila-comercio-${grande.r}`, `fila-comercio-${grande.d}`]);
    });

    test('cada fila muestra su etiqueta, su subtítulo y su contador solo si es mayor que cero', async ({ page, request }) => {
      await abrirDashboardDe(page, request, grande.dueno);
      await abrirPanel(page);
      const panel = page.getByTestId('panel-comercios');
      await expect(panel.getByTestId(`fila-comercio-${grande.a}`).getByTestId('tilde-comercio-activo')).toBeVisible();
      await expect(panel.getByTestId(`subtitulo-comercio-${grande.a}`)).toHaveText('1 notificación');
      await expect(panel.getByTestId(`subtitulo-comercio-${grande.b}`)).toHaveText('2 notificaciones');
      await expect(panel.getByTestId(`etiqueta-estado-comercio-${grande.b}`)).toHaveCount(0);
      await expect(panel.getByTestId(`etiqueta-estado-comercio-${grande.p}`)).toHaveText('Pendiente');
      await expect(panel.getByTestId(`subtitulo-comercio-${grande.p}`)).toHaveText('En revisión · 1 notificación');
      await expect(panel.getByTestId(`etiqueta-estado-comercio-${grande.r}`)).toHaveText('Rechazado');
      await expect(panel.getByTestId(`subtitulo-comercio-${grande.r}`)).toHaveText('1 notificación');
      await expect(panel.getByTestId(`etiqueta-estado-comercio-${grande.d}`)).toHaveText('Definitivo');
      await expect(panel.getByTestId(`subtitulo-comercio-${grande.d}`)).toHaveText('Sin más intentos');
      await expect(panel.getByTestId(`etiqueta-estado-comercio-${grande.s}`)).toHaveText('Suspendido');
      await expect(panel.getByTestId(`subtitulo-comercio-${grande.s}`)).toHaveCount(0);
    });

    test('el panel se cierra con Escape, con el fondo y con el asa', async ({ page, request }) => {
      await abrirDashboardDe(page, request, grande.dueno);
      await abrirPanel(page);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('panel-comercios')).toHaveCount(0);
      await abrirPanel(page);
      await page.mouse.click(195, 30);
      await expect(page.getByTestId('panel-comercios')).toHaveCount(0);
      await abrirPanel(page);
      await page.getByTestId('btn-cerrar-panel-comercios').click();
      await expect(page.getByTestId('panel-comercios')).toHaveCount(0);
      await expect(page.getByTestId('franja-comercio')).toBeFocused();
    });

    test('hay punto en la franja cuando los otros comercios suman notificaciones sin leer', async ({ page, request }) => {
      await abrirDashboardDe(page, request, grande.dueno);
      await expect(page.getByTestId('franja-comercio-puntito')).toBeVisible();
    });

    test('un Dueño con un solo comercio ve la franja pero sin punto', async ({ page, request }) => {
      const solo = await prepararAprobado(request, adminToken, localidadId);
      await abrirDashboardDe(page, request, solo);
      await expect(page.getByTestId('franja-comercio-puntito')).toBeHidden();
      await abrirPanel(page);
      await expect(page.getByTestId('lista-comercios').locator('[data-testid^="fila-comercio-"]')).toHaveCount(1);
    });

    test('"Agregar comercio" aparece cuando el Dueño es elegible y lleva a agregar-comercio.html', async ({ page, request }) => {
      await abrirDashboardDe(page, request, grande.dueno);
      await abrirPanel(page);
      await expect(page.getByTestId('btn-agregar-comercio')).toBeVisible();
      await page.getByTestId('btn-agregar-comercio').click();
      await page.waitForURL('**/agregar-comercio.html');
    });
  });

  test.describe('cambiar de comercio y abrir pantallas de estado', () => {
    test('elegir un operativo lo activa, lo guarda como último y lleva a su dashboard con su header', async ({ page, request }) => {
      const encabezados = registrarHeaders(page, '/comercios/perfil');
      await abrirDashboardDe(page, request, grande.dueno);
      await seleccionarComercioEnPanel(page, grande.b);
      await page.waitForURL('**/comercio-dashboard.html');
      await expect(page.getByTestId('franja-comercio-nombre')).toHaveText(grande.nombres[grande.b]);
      await expect(page.getByTestId('mensaje-saludo')).toContainText(grande.nombres[grande.b]);
      expect((await comercioActivoEnSesion(page))?.comercioId).toBe(grande.b);
      expect(await ultimoComercioGuardado(page, grande.dueno.duenoId)).toBe(grande.b);
      await expect.poll(() => encabezados.at(-1)).toBe(String(grande.b));
    });

    test('después de cambiar, las demás pestañas operan sobre el comercio elegido', async ({ page, request }) => {
      await abrirDashboardDe(page, request, grande.dueno);
      await seleccionarComercioEnPanel(page, grande.b);
      await page.waitForURL('**/comercio-dashboard.html');
      const encabezados = registrarHeaders(page, '/productos');
      await page.getByTestId('btn-nav-productos').click();
      await page.waitForURL('**/comercio-productos.html');
      await expect(page.getByTestId('franja-comercio-nombre')).toHaveText(grande.nombres[grande.b]);
      await expect.poll(() => encabezados.at(-1)).toBe(String(grande.b));
    });

    for (const [clave, pantalla] of [
      ['p', 'comercio-pendiente.html'],
      ['r', 'comercio-rechazado.html'],
      ['d', 'comercio-rechazo-definitivo.html'],
    ] as const) {
      test(`tocar un comercio ${clave === 'p' ? 'pendiente' : clave === 'r' ? 'rechazado' : 'en rechazo definitivo'} abre ${pantalla} con ?id y no guarda nada`, async ({ page, request }) => {
        await abrirDashboardDe(page, request, grande.dueno);
        const marcadoLeidas = page.waitForResponse(
          (res) => res.request().method() === 'PUT' && res.url().includes(`/notificaciones/comercio/${grande[clave]}/leidas`),
        );
        await seleccionarComercioEnPanel(page, grande[clave]);
        await page.waitForURL(`**/${pantalla}?id=${grande[clave]}`);
        await marcadoLeidas;
        await expect(page.getByTestId('btn-volver-a-mis-comercios')).toBeVisible();
        expect((await comercioActivoEnSesion(page))?.comercioId).toBe(grande.a);
        expect(await ultimoComercioGuardado(page, grande.dueno.duenoId)).toBe(grande.a);
      });
    }

    test('"Otros" va en gris, sin acción al tocar, y la pantalla no cambia', async ({ page, request }) => {
      await abrirDashboardDe(page, request, grande.dueno);
      await abrirPanel(page);
      const fila = page.getByTestId(`fila-comercio-${grande.s}`);
      await expect(fila).toHaveAttribute('aria-disabled', 'true');
      await fila.click();
      await page.waitForTimeout(500);
      expect(page.url()).toContain('/comercio-dashboard.html');
      await expect(page.getByTestId('panel-comercios')).toBeVisible();
      expect((await comercioActivoEnSesion(page))?.comercioId).toBe(grande.a);
    });
  });

  test.describe('pantallas de estado', () => {
    for (const pantalla of ['comercio-pendiente.html', 'comercio-rechazado.html', 'comercio-rechazo-definitivo.html']) {
      test(`${pantalla} sin ?id aplica la regla por defecto y redirige con ?id`, async ({ page, request }) => {
        const sesion = await sesionFresca(request, sinOperativos.dueno);
        await abrirComoUsuarioConComercio(page, sesion);
        await page.goto(`/${pantalla}`);
        await page.waitForURL(`**/comercio-rechazado.html?id=${sinOperativos.r}`);
        await expect(page.getByTestId('texto-correccion')).toBeVisible();
      });
    }

    test('si el estado no coincide con la pantalla, va a la que corresponde con el mismo ?id', async ({ page, request }) => {
      const sesion = await sesionFresca(request, sinOperativos.dueno);
      await abrirComoUsuarioConComercio(page, sesion);
      await page.goto(`/comercio-pendiente.html?id=${sinOperativos.d}`);
      await page.waitForURL(`**/comercio-rechazo-definitivo.html?id=${sinOperativos.d}`);
      await page.goto(`/comercio-rechazado.html?id=${sinOperativos.p}`);
      await page.waitForURL(`**/comercio-pendiente.html?id=${sinOperativos.p}`);
    });

    test('si el comercio ya es operativo lo activa y va al dashboard', async ({ page, request }) => {
      const sesion = await sesionFresca(request, grande.dueno);
      await abrirComoUsuarioConComercio(page, sesion, { comercioActivoId: grande.a });
      await page.goto(`/comercio-pendiente.html?id=${grande.b}`);
      await page.waitForURL('**/comercio-dashboard.html');
      expect((await comercioActivoEnSesion(page))?.comercioId).toBe(grande.b);
      expect(await ultimoComercioGuardado(page, grande.dueno.duenoId)).toBe(grande.b);
    });

    for (const id of ['abc', '0', '99999999', 'ajeno']) {
      test(`un ?id ${id === 'ajeno' ? 'de otro Dueño' : `inválido (${id})`} cae en la regla por defecto`, async ({ page, request }) => {
        const valor = id === 'ajeno' ? String((await registrarPendiente(request, adminToken, localidadId)).comercioId) : id;
        const sesion = await sesionFresca(request, sinOperativos.dueno);
        await abrirComoUsuarioConComercio(page, sesion);
        await page.goto(`/comercio-pendiente.html?id=${valor}`);
        await page.waitForURL(`**/comercio-rechazado.html?id=${sinOperativos.r}`);
      });
    }

    for (const [clave, pantalla] of [
      ['p', 'comercio-pendiente.html'],
      ['r', 'comercio-rechazado.html'],
      ['d', 'comercio-rechazo-definitivo.html'],
    ] as const) {
      test(`${pantalla}: "Volver a mis comercios" abre el panel sin "Agregar comercio" si no es elegible`, async ({ page, request }) => {
        const sesion = await sesionFresca(request, sinOperativos.dueno);
        await abrirComoUsuarioConComercio(page, sesion);
        await page.goto(`/${pantalla}?id=${sinOperativos[clave]}`);
        await page.getByTestId('btn-volver-a-mis-comercios').click();
        await expect(page.getByTestId('panel-comercios')).toBeVisible();
        await expect(page.getByTestId(`fila-comercio-${sinOperativos.r}`)).toBeVisible();
        await expect(page.getByTestId('grupo-comercios-operativos')).toHaveCount(0);
        await page.waitForTimeout(500);
        await expect(page.getByTestId('btn-agregar-comercio')).toBeHidden();
      });
    }

    test('abrir una pantalla de estado marca como leídas las notificaciones de ese comercio', async ({ page, request }) => {
      const dueno = await prepararRechazado(request, adminToken, localidadId, MOTIVO);
      insertarNotificaciones(dueno.duenoId, dueno.comercioId, 2, 'Aviso estado');
      const antes = await apiGet(request, '/comercios/mis-comercios', (await sesionFresca(request, dueno)).token);
      expect(antes.body.data[0].cantidadNotificacionesNoLeidas).toBeGreaterThanOrEqual(2);
      const sesion = await sesionFresca(request, dueno);
      await abrirComoUsuarioConComercio(page, sesion);
      await page.goto(`/comercio-rechazado.html?id=${dueno.comercioId}`);
      await expect(page.getByTestId('texto-correccion')).toBeVisible();
      const despues = await apiGet(request, '/comercios/mis-comercios', sesion.token);
      expect(despues.body.data[0].cantidadNotificacionesNoLeidas).toBe(0);
    });
  });

  test.describe('notificaciones, polling y storage', () => {
    test('la campana y la lista muestran solo las notificaciones del comercio activo', async ({ page, request }) => {
      await abrirDashboardDe(page, request, grande.dueno);
      await expect(page.getByTestId('contador-notificaciones')).toHaveText('1');
      await page.getByTestId('btn-notificaciones').click();
      await page.waitForURL('**/notificaciones.html');
      await expect(page.locator('[data-testid^="notificacion-item-"]')).toHaveCount(1);
      await expect(page.locator('#notif-content')).not.toContainText('Aviso B');
      await page.goto('/comercio-dashboard.html');
      await seleccionarComercioEnPanel(page, grande.b);
      await page.waitForURL('**/comercio-dashboard.html');
      await expect(page.getByTestId('contador-notificaciones')).toHaveText('2');
      await page.getByTestId('btn-notificaciones').click();
      await page.waitForURL('**/notificaciones.html');
      await expect(page.locator('[data-testid^="notificacion-item-"]')).toHaveCount(2);
      await expect(page.locator('#notif-content')).not.toContainText('Aviso A');
    });

    test('dos pestañas del mismo navegador comparten el último usado pero no la selección', async ({ browser, request }) => {
      const contexto = await browser.newContext({ viewport: VIEWPORT });
      const sesion = await sesionFresca(request, grande.dueno);
      const primera = await contexto.newPage();
      await abrirComoUsuarioConComercio(primera, sesion);
      await primera.goto('/comercio-dashboard.html');
      await expect(primera.getByTestId('franja-comercio-nombre')).toHaveText(grande.nombres[grande.a]);
      await seleccionarComercioEnPanel(primera, grande.b);
      await primera.waitForURL('**/comercio-dashboard.html');
      await expect(primera.getByTestId('franja-comercio-nombre')).toHaveText(grande.nombres[grande.b]);

      const segunda = await contexto.newPage();
      await segunda.goto('/comercio-dashboard.html');
      await expect(segunda.getByTestId('franja-comercio-nombre')).toHaveText(grande.nombres[grande.b]);
      await seleccionarComercioEnPanel(segunda, grande.a);
      await segunda.waitForURL('**/comercio-dashboard.html');
      await expect(segunda.getByTestId('franja-comercio-nombre')).toHaveText(grande.nombres[grande.a]);

      await primera.reload();
      await expect(primera.getByTestId('franja-comercio-nombre')).toHaveText(grande.nombres[grande.b]);
      expect((await comercioActivoEnSesion(primera))?.comercioId).toBe(grande.b);
      expect((await comercioActivoEnSesion(segunda))?.comercioId).toBe(grande.a);
      await contexto.close();
    });

    test('una sola consulta de polling por ciclo, sin header, y sin el contador viejo', async ({ browser, request }) => {
      const contexto = await browser.newContext({ viewport: VIEWPORT });
      const pagina = await contexto.newPage();
      const sesion = await sesionFresca(request, grande.dueno);
      await abrirComoUsuarioConComercio(pagina, sesion);
      await pagina.clock.install();
      const consultas: Array<string | undefined> = [];
      const contadoresViejos: string[] = [];
      pagina.on('request', (peticion) => {
        if (peticion.url().endsWith('/comercios/mis-comercios')) {
          consultas.push(peticion.headers()[HEADER]);
        }
        if (peticion.url().includes('/notificaciones/no-leidas/contador')) {
          contadoresViejos.push(peticion.url());
        }
      });
      await pagina.goto('/comercio-dashboard.html');
      await expect(pagina.getByTestId('franja-comercio')).toBeVisible();
      const alCargar = consultas.length;
      expect(alCargar).toBe(1);
      await pagina.clock.fastForward(15_000);
      await expect.poll(() => consultas.length).toBe(alCargar + 1);
      await pagina.clock.fastForward(15_000);
      await expect.poll(() => consultas.length).toBe(alCargar + 2);
      expect(consultas.every((valor) => valor === undefined)).toBe(true);
      expect(contadoresViejos).toHaveLength(0);
      await contexto.close();
    });

    test('si el polling revela que el comercio activo ya no es operativo, vuelve a resolver y redirige', async ({ browser, request }) => {
      const dueno = await prepararAprobado(request, adminToken, localidadId);
      const segundo = await clonarComercioTest(request, dueno.comercioId, aTitleCase(`Segundo Vivo ${sufijoUnico().slice(-6)}`), 'APROBADO');
      const contexto = await browser.newContext({ viewport: VIEWPORT });
      const pagina = await contexto.newPage();
      const sesion = await sesionFresca(request, dueno);
      await abrirComoUsuarioConComercio(pagina, sesion, { comercioActivoId: dueno.comercioId });
      await pagina.clock.install();
      await pagina.goto('/comercio-dashboard.html');
      await expect(pagina.getByTestId('franja-comercio')).toBeVisible();
      await suspenderComercio(request, adminToken, dueno.comercioId, MOTIVO);
      await pagina.clock.fastForward(15_000);
      await expect.poll(async () => (await comercioActivoEnSesion(pagina))?.comercioId).toBe(segundo);
      await expect(pagina.getByTestId('franja-comercio-nombre')).not.toHaveText('');
      await contexto.close();
    });

    test('si ya no queda ningún comercio operativo ni pantalla de estado, vuelve al login', async ({ browser, request }) => {
      const dueno = await prepararAprobado(request, adminToken, localidadId);
      const contexto = await browser.newContext({ viewport: VIEWPORT });
      const pagina = await contexto.newPage();
      const sesion = await sesionFresca(request, dueno);
      await abrirComoUsuarioConComercio(pagina, sesion, { comercioActivoId: dueno.comercioId });
      await pagina.clock.install();
      await pagina.goto('/comercio-dashboard.html');
      await expect(pagina.getByTestId('franja-comercio')).toBeVisible();
      await suspenderComercio(request, adminToken, dueno.comercioId, MOTIVO);
      await pagina.clock.fastForward(15_000);
      await pagina.waitForURL('**/login.html');
      await contexto.close();
    });

    test('un Dueño sin ningún comercio en mis-comercios vuelve al login', async ({ page, request }) => {
      const sesion = await sesionFresca(request, grande.dueno);
      await abrirComoUsuarioConComercio(page, sesion);
      await page.route('**/comercios/mis-comercios', (ruta) => ruta.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ mensaje: 'ok', data: [] }) }));
      await page.goto('/comercio-dashboard.html');
      await page.waitForURL('**/login.html');
    });

    test('el Cliente queda igual: no manda X-Comercio-Id, no consulta mis-comercios y conserva su contador', async ({ page, request }) => {
      const cliente = await registrarYVerificarCliente(request, localidadId);
      const encabezados: Array<string | undefined> = [];
      const consultas: string[] = [];
      page.on('request', (peticion) => {
        if (peticion.url().includes('/api/v1/')) {
          encabezados.push(peticion.headers()[HEADER]);
        }
        if (peticion.url().includes('/comercios/mis-comercios')) {
          consultas.push(peticion.url());
        }
      });
      await loginUi(page, cliente.nombreUsuario, cliente.password);
      await page.waitForURL('**/index.html');
      const contador = page.waitForRequest('**/notificaciones/no-leidas/contador');
      await page.goto('/index.html');
      await contador;
      expect(encabezados.length).toBeGreaterThan(0);
      expect(encabezados.every((valor) => valor === undefined)).toBe(true);
      expect(consultas).toHaveLength(0);
    });
  });

  test.describe('avatar del footer y mantener apretado', () => {
    test('el avatar del footer muestra la foto del comercio activo', async ({ page, request }) => {
      await abrirDashboardDe(page, request, grande.dueno);
      await expect(page.locator('.bottom-nav__avatar img')).toBeVisible();
    });

    test('mantener apretado el avatar con el dedo abre el panel y no navega', async ({ page, request }) => {
      await abrirDashboardDe(page, request, grande.dueno);
      await mantenerApretado(page, 'btn-nav-perfil', 700);
      await expect(page.getByTestId('panel-comercios')).toBeVisible();
      await page.waitForTimeout(400);
      expect(page.url()).toContain('/comercio-dashboard.html');
    });

    test('un toque corto sobre el avatar sigue navegando al perfil', async ({ page, request }) => {
      await abrirDashboardDe(page, request, grande.dueno);
      await mantenerApretado(page, 'btn-nav-perfil', 80);
      await page.waitForURL('**/comercio-perfil.html');
      await expect(page.getByTestId('panel-comercios')).toHaveCount(0);
    });

    test('con el mouse no hay gesto de mantener apretado', async ({ page, request }) => {
      await abrirDashboardDe(page, request, grande.dueno);
      await mantenerApretado(page, 'btn-nav-perfil', 700, 'mouse');
      await page.waitForURL('**/comercio-perfil.html');
      await expect(page.getByTestId('panel-comercios')).toHaveCount(0);
    });

    test('si el dedo se mueve más de unos píxeles el gesto se cancela', async ({ page, request }) => {
      await abrirDashboardDe(page, request, grande.dueno);
      await page.getByTestId('btn-nav-perfil').evaluate(async (elemento) => {
        const caja = elemento.getBoundingClientRect();
        const x = caja.left + caja.width / 2;
        const y = caja.top + caja.height / 2;
        const base = { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 9, isPrimary: true };
        elemento.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: x, clientY: y }));
        await new Promise((resolver) => setTimeout(resolver, 150));
        elemento.dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: x + 20, clientY: y }));
        await new Promise((resolver) => setTimeout(resolver, 600));
        elemento.dispatchEvent(new PointerEvent('pointerup', { ...base, clientX: x + 20, clientY: y }));
      });
      await expect(page.getByTestId('panel-comercios')).toHaveCount(0);
    });
  });

  test.describe('header X-Comercio-Id', () => {
    test('las rutas de operación llevan el comercio activo y las del Dueño en general no lo llevan', async ({ page, request }) => {
      const operacion = registrarHeaders(page, '/pedidos/comercio');
      const misComercios = registrarHeaders(page, '/comercios/mis-comercios');
      const elegibilidad = registrarHeaders(page, '/alta-adicional/elegibilidad');
      await abrirDashboardDe(page, request, grande.dueno);
      await abrirPanel(page);
      await expect(page.getByTestId('btn-agregar-comercio')).toBeVisible();
      expect(operacion.length).toBeGreaterThan(0);
      expect(operacion.every((valor) => valor === String(grande.a))).toBe(true);
      expect(misComercios.every((valor) => valor === undefined)).toBe(true);
      expect(elegibilidad.every((valor) => valor === undefined)).toBe(true);
    });

    test('la subida a Cloudinary nunca recibe el header y la firma del backend sí', async ({ page, request }) => {
      const sesion = await sesionFresca(request, grande.dueno);
      await abrirComoUsuarioConComercio(page, sesion, { comercioActivoId: grande.a });
      const haciaCloudinary: Array<string | undefined> = [];
      const haciaFirma: Array<string | undefined> = [];
      page.on('request', (peticion) => {
        if (peticion.url().includes('api.cloudinary.com')) {
          haciaCloudinary.push(peticion.headers()[HEADER]);
        }
        if (peticion.url().includes('/comercios/perfil/foto/firma')) {
          haciaFirma.push(peticion.headers()[HEADER]);
        }
      });
      await page.route('**/comercios/perfil/foto/firma', (ruta) =>
        ruta.fulfill({
          status: 200,
          headers: CORS,
          contentType: 'application/json',
          body: JSON.stringify({ mensaje: 'ok', data: { cloudName: 'demo', apiKey: 'k', timestamp: 1, signature: 's', folder: 'f', publicId: 'p', uploadPreset: null } }),
        }),
      );
      await page.route('**/api.cloudinary.com/**', (ruta) =>
        ruta.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/f/p.jpg', public_id: 'f/p' }) }),
      );
      await page.route('**/comercios/perfil/foto', (ruta) =>
        ruta.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ mensaje: 'ok', data: { fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/v1/f/p.jpg' } }) }),
      );
      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('franja-comercio')).toBeVisible();
      await page.evaluate(async () => {
        const modulo = await import('/js/cloudinary.js');
        const archivo = new File([new Uint8Array([1, 2, 3])], 'foto.jpg', { type: 'image/jpeg' });
        await modulo.subirFotoPerfilComercio(archivo).catch(() => undefined);
      });
      expect(haciaFirma).toEqual([String(grande.a)]);
      expect(haciaCloudinary.length).toBeGreaterThan(0);
      expect(haciaCloudinary.every((valor) => valor === undefined)).toBe(true);
    });
  });
});
