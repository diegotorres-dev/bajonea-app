import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Browser, Page } from '@playwright/test';
import {
  apiConHeaders,
  clonarComercioTest,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { ClienteRegistrado, SesionApi } from './helpers/backend';
import { abrirComoUsuarioConContexto, atajoEstadoRelacion, contextoEnSesion, ponerEstadoComercio, sumarAlEquipo, ultimoContextoGuardado } from './helpers/empleado';
import { prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';

const HEADER = 'X-Comercio-Id';
const ROJO = 'rgb(217, 48, 37)';
const TEXTO_ELEGIR = 'Elegí con qué cuenta seguir.';
const TEXTO_RENUNCIA =
  'Vas a salir del equipo y no vas a poder volver a operar en este comercio. Se le notificará al dueño. Tu cuenta y tus datos personales continuarán intactos.';
const TEXTO_CASILLA = 'Entiendo que para volver el dueño me tiene que invitar de nuevo.';

interface Miembro {
  cuenta: ClienteRegistrado;
  id: number;
  sesion: SesionApi;
}

interface Comercio {
  id: number;
  nombre: string;
}

async function capturar(page: Page, nombre: string) {
  if (process.env.CAPTURAS) {
    await page.screenshot({ path: `tmp-capturas/e4b2-${process.env.CAPTURAS}-${nombre}.png` });
  }
}

test.use({ viewport: { width: 375, height: 812 } });

test.describe('Empleado: renuncia, pérdida de acceso según la causa y avisos, E4 entrega B2', () => {
  test.describe.configure({ timeout: 240_000 });

  let adminToken: string;
  let localidadId: string;
  let dueno: Dueno;

  const cabecera = (comercioId: number) => ({ [HEADER]: String(comercioId) });
  const putEquipo = (request: APIRequestContext, comercioId: number, miembroId: number, accion: 'desactivar' | 'reactivar') =>
    apiConHeaders(request, 'PUT', `/comercios/equipo/miembros/${miembroId}/${accion}`, dueno.token, cabecera(comercioId));
  const renunciarPorApi = (request: APIRequestContext, comercioId: number, miembro: Miembro) =>
    apiConHeaders(request, 'PUT', `/empleados/comercios/${comercioId}/renunciar`, miembro.sesion.token, {});
  const estadoRelacion = (miembroId: number, comercioId: number): string =>
    sql(`SELECT estado FROM empleado_comercio WHERE empleado_id = ${miembroId} AND comercio_id = ${comercioId};`);
  const motivos = (miembroId: number, comercioId: number): string[] =>
    sql(
      `SELECT h.motivo FROM historial_empleado_comercio h JOIN empleado_comercio r ON r.id = h.empleado_comercio_id ` +
        `WHERE r.empleado_id = ${miembroId} AND r.comercio_id = ${comercioId} ORDER BY h.id;`,
    )
      .split(/\r?\n/)
      .filter(Boolean);
  const toast = (page: Page) => page.locator('.toast');

  async function comercioNuevo(request: APIRequestContext): Promise<Comercio> {
    const nombre = `Equipo B2 ${sufijoUnico()}`;
    const id = await clonarComercioTest(request, dueno.comercioId, nombre, 'APROBADO');
    return { id, nombre };
  }

  async function nuevoMiembro(request: APIRequestContext, comercios: Comercio[]): Promise<Miembro> {
    const cuenta = await registrarYVerificarCliente(request, localidadId);
    for (const comercio of comercios) {
      sql(
        `UPDATE invitacion_empleado SET fecha_creacion = DATE_SUB(fecha_creacion, INTERVAL 2 HOUR) ` +
          `WHERE comercio_id = ${comercio.id} AND fecha_creacion > DATE_SUB(NOW(), INTERVAL 1 HOUR);`,
      );
      await sumarAlEquipo(request, comercio.id, cuenta, dueno.token);
    }
    const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
    return { cuenta, id: sesion.usuario.id, sesion };
  }

  async function abrirComoEmpleado(page: Page, miembro: Miembro, comercio: Comercio) {
    await abrirComoUsuarioConContexto(page, miembro.sesion, {
      contexto: { tipo: 'EMPLEADO', comercioId: comercio.id },
      ultimoContexto: `EMPLEADO:${comercio.id}`,
    });
  }

  async function abrirPagina(page: Page, miembro: Miembro, comercio: Comercio, pagina: string) {
    await abrirComoEmpleado(page, miembro, comercio);
    await page.goto(`/${pagina}`);
    await expect(page.getByTestId('franja-comercio-insignia-empleado')).toBeVisible();
  }

  async function abrirPerfil(page: Page, miembro: Miembro, comercio: Comercio) {
    await abrirPagina(page, miembro, comercio, 'comercio-perfil.html');
    await expect(page.getByTestId('btn-renunciar-equipo')).toBeEnabled();
  }

  async function provocar404(page: Page, rutas: string[] = ['/productos']) {
    const respuesta404 = page.waitForResponse((r) => r.status() === 404 && r.url().includes(rutas[0]), { timeout: 10_000 }).catch(() => null);
    await page.evaluate(async (paths) => {
      const { apiFetch } = await import('./js/api.js');
      paths.forEach((path) => apiFetch(path).catch(() => {}));
    }, rutas);
    await respuesta404;
  }

  async function abrirHoja(page: Page) {
    await page.getByTestId('btn-renunciar-equipo').click();
    await expect(page.getByTestId('hoja-renuncia-empleado')).toBeVisible();
  }

  async function renunciarDesdeLaHoja(page: Page) {
    await abrirHoja(page);
    await page.getByTestId('check-renuncia-entiendo').check();
    await page.getByTestId('btn-confirmar-renuncia').click();
  }

  const colorDe = (locator: ReturnType<Page['getByTestId']>, propiedad: 'backgroundColor' | 'color') =>
    locator.evaluate((nodo, p) => getComputedStyle(nodo)[p as 'backgroundColor' | 'color'], propiedad);

  async function contextoNuevo(browser: Browser) {
    return browser.newContext({ viewport: { width: 375, height: 812 }, baseURL: process.env.E2E_FRONTEND_URL || 'http://localhost:5501' });
  }

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    dueno = await prepararAprobado(request, adminToken, localidadId);
  });

  test.describe('Sección "Mi lugar en el equipo"', () => {
    test('el Empleado la ve con el botón rojo de 44 px, el texto de ayuda con el comercio y debajo de la lista del perfil', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [comercio]);
      await abrirPerfil(page, miembro, comercio);

      const seccion = page.getByTestId('seccion-mi-lugar-equipo');
      await expect(seccion).toBeVisible();
      await expect(seccion.locator('.profile-section__title')).toHaveText('Mi lugar en el equipo');
      const boton = page.getByTestId('btn-renunciar-equipo');
      await expect(boton).toHaveText('Dejar de trabajar en este comercio');
      expect(await colorDe(boton, 'color')).toBe(ROJO);
      expect(await colorDe(boton, 'backgroundColor')).toBe('rgba(0, 0, 0, 0)');
      const caja = await boton.boundingBox();
      expect(caja!.height).toBeGreaterThanOrEqual(44);
      await expect(page.getByTestId('texto-ayuda-renuncia')).toHaveText(
        `Dejás de formar parte del equipo de ${comercio.nombre}. Tu cuenta sigue funcionando.`,
      );
      const lista = await page.getByTestId('lista-perfil').boundingBox();
      expect(caja!.y).toBeGreaterThan(lista!.y + lista!.height);
      await sinScrollHorizontal(page);
      await capturar(page, 'perfil-empleado');
    });

    test('no existe para el Dueño ni para un Cliente en su propia cuenta', async ({ page, request, browser }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [comercio]);

      await abrirComoUsuarioConContexto(page, dueno.sesion, {});
      await page.addInitScript(([usuarioId, comercioId]) => {
        sessionStorage.setItem('bajonea_comercio_activo', JSON.stringify({ usuarioId, comercioId }));
      }, [dueno.sesion.usuario.id, comercio.id] as const);
      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('btn-ver-equipo')).toBeEnabled();
      await expect(page.getByTestId('seccion-mi-lugar-equipo')).toHaveCount(0);
      await expect(page.getByTestId('btn-renunciar-equipo')).toHaveCount(0);

      const contextoCliente = await contextoNuevo(browser);
      const paginaCliente = await contextoCliente.newPage();
      await abrirComoUsuarioConContexto(paginaCliente, miembro.sesion, { contexto: { tipo: 'CLIENTE' } });
      await paginaCliente.goto('/perfil.html');
      await expect(paginaCliente.getByTestId('btn-editar-datos')).toBeEnabled();
      await expect(paginaCliente.getByTestId('seccion-mi-lugar-equipo')).toHaveCount(0);
      await expect(paginaCliente.getByTestId('btn-renunciar-equipo')).toHaveCount(0);
      await contextoCliente.close();
    });
  });

  test.describe('Hoja de renuncia', () => {
    test('muestra el título con el comercio, el texto, la casilla y los botones; el rojo no se activa hasta tildar', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [comercio]);
      await abrirPerfil(page, miembro, comercio);
      await abrirHoja(page);

      await expect(page.getByTestId('titulo-renuncia')).toHaveText(`¿Dejar de trabajar en ${comercio.nombre}?`);
      await expect(page.getByTestId('texto-renuncia')).toHaveText(TEXTO_RENUNCIA);
      await expect(page.getByTestId('hoja-renuncia-empleado').locator('label')).toHaveText(TEXTO_CASILLA);
      const confirmar = page.getByTestId('btn-confirmar-renuncia');
      await expect(confirmar).toHaveText('Dejar de trabajar');
      await expect(page.getByTestId('btn-volver-renuncia')).toHaveText('Volver');
      expect(await colorDe(confirmar, 'backgroundColor')).toBe(ROJO);
      await expect(confirmar).toBeDisabled();

      await page.getByTestId('check-renuncia-entiendo').check();
      await expect(confirmar).toBeEnabled();
      await page.getByTestId('check-renuncia-entiendo').uncheck();
      await expect(confirmar).toBeDisabled();
      await sinScrollHorizontal(page);
      await capturar(page, 'hoja-renuncia');
    });

    test('"Volver" cierra la hoja sin llamar al servidor y el contexto y la relación quedan como estaban', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [comercio]);
      await abrirPerfil(page, miembro, comercio);
      const llamadas: string[] = [];
      page.on('request', (r) => {
        if (r.url().includes('/renunciar')) {
          llamadas.push(r.url());
        }
      });

      await abrirHoja(page);
      await page.getByTestId('check-renuncia-entiendo').check();
      await page.getByTestId('btn-volver-renuncia').click();

      await expect(page.getByTestId('hoja-renuncia-empleado')).toHaveCount(0);
      expect(llamadas).toEqual([]);
      expect(await contextoEnSesion(page)).toMatchObject({ tipo: 'EMPLEADO', comercioId: comercio.id });
      expect(estadoRelacion(miembro.id, comercio.id)).toBe('ACTIVO');
      await abrirHoja(page);
      await expect(page.getByTestId('check-renuncia-entiendo')).not.toBeChecked();
      await expect(page.getByTestId('btn-confirmar-renuncia')).toBeDisabled();
    });

    test('con otros comercios: renuncia, limpia el contexto, va al selector y muestra el toast; el comercio ya no está en la lista', async ({ page, request }) => {
      const conservado = await comercioNuevo(request);
      const dejado = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [conservado, dejado]);
      await abrirPerfil(page, miembro, dejado);

      const respuesta = page.waitForResponse((r) => r.url().includes(`/empleados/comercios/${dejado.id}/renunciar`) && r.request().method() === 'PUT');
      await renunciarDesdeLaHoja(page);
      expect((await respuesta).status()).toBe(200);

      await page.waitForURL('**/seleccionar-contexto.html');
      await expect(toast(page)).toHaveText(`Dejaste de trabajar en ${dejado.nombre}`);
      await expect(page.getByTestId(`fila-contexto-comercio-${conservado.id}`)).toBeVisible();
      await expect(page.getByTestId(`fila-contexto-comercio-${dejado.id}`)).toHaveCount(0);
      expect(await contextoEnSesion(page)).toBeNull();
      expect(await ultimoContextoGuardado(page, miembro.id)).not.toBe(`EMPLEADO:${dejado.id}`);
      expect(estadoRelacion(miembro.id, dejado.id)).toBe('INACTIVO');
      expect(estadoRelacion(miembro.id, conservado.id)).toBe('ACTIVO');
      expect(motivos(miembro.id, dejado.id)).toEqual(['ACEPTACION', 'RENUNCIA']);

      await page.waitForTimeout(1500);
      await expect(page.getByTestId('aviso-acceso-perdido')).toHaveCount(0);
      await sinScrollHorizontal(page);
      await capturar(page, 'selector-tras-renuncia');

      await page.reload();
      await expect(page.getByTestId(`fila-contexto-comercio-${conservado.id}`)).toBeVisible();
      await expect(toast(page)).toHaveCount(0);
    });

    test('sin otros comercios: el selector deriva al inicio de Cliente y el toast se ve allí', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [comercio]);
      await abrirPerfil(page, miembro, comercio);

      await renunciarDesdeLaHoja(page);

      await page.waitForURL('**/index.html');
      await expect(toast(page)).toHaveText(`Dejaste de trabajar en ${comercio.nombre}`);
      expect(await contextoEnSesion(page)).toMatchObject({ tipo: 'CLIENTE' });
      expect(await ultimoContextoGuardado(page, miembro.id)).not.toBe(`EMPLEADO:${comercio.id}`);
      expect(estadoRelacion(miembro.id, comercio.id)).toBe('INACTIVO');
      await page.waitForTimeout(1500);
      await expect(page.getByTestId('aviso-acceso-perdido')).toHaveCount(0);
    });

    test('el Dueño recibe el aviso de la renuncia con el comercio abierto', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [comercio]);
      await abrirPerfil(page, miembro, comercio);
      await renunciarDesdeLaHoja(page);
      await page.waitForURL('**/index.html');

      const avisos = await apiConHeaders(request, 'GET', '/notificaciones', dueno.token, cabecera(comercio.id));
      const mensajes = (avisos.body.data as Array<{ mensaje: string }>).map((a) => a.mensaje);
      expect(mensajes.some((m) => m.endsWith(`dejó de trabajar en ${comercio.nombre}.`))).toBe(true);
    });

    test('un doble clic en el botón rojo envía una sola renuncia', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [comercio]);
      await abrirPerfil(page, miembro, comercio);
      const llamadas: string[] = [];
      page.on('request', (r) => {
        if (r.url().includes('/renunciar')) {
          llamadas.push(r.url());
        }
      });

      await abrirHoja(page);
      await page.getByTestId('check-renuncia-entiendo').check();
      await page.getByTestId('btn-confirmar-renuncia').dblclick();

      await page.waitForURL('**/index.html');
      expect(llamadas).toHaveLength(1);
      expect(motivos(miembro.id, comercio.id)).toEqual(['ACEPTACION', 'RENUNCIA']);
    });

    test('si ya había renunciado en otro dispositivo, el servidor responde 200 y el flujo termina igual', async ({ page, request }) => {
      const conservado = await comercioNuevo(request);
      const dejado = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [conservado, dejado]);
      await abrirPerfil(page, miembro, dejado);
      await abrirHoja(page);
      await page.getByTestId('check-renuncia-entiendo').check();

      expect((await renunciarPorApi(request, dejado.id, miembro)).status).toBe(200);
      let cuerpo = '';
      let estado = 0;
      await page.route('**/empleados/comercios/*/renunciar', async (ruta) => {
        const respuestaReal = await ruta.fetch();
        estado = respuestaReal.status();
        cuerpo = await respuestaReal.text();
        await ruta.fulfill({ response: respuestaReal });
      });
      await page.getByTestId('btn-confirmar-renuncia').click();
      await page.waitForURL('**/seleccionar-contexto.html');

      expect(estado).toBe(200);
      expect(JSON.parse(cuerpo).mensaje).toBe('Ya habías dejado de trabajar en este comercio');
      await expect(toast(page)).toHaveText(`Dejaste de trabajar en ${dejado.nombre}`);
      expect(motivos(miembro.id, dejado.id)).toEqual(['ACEPTACION', 'RENUNCIA']);
    });
  });

  test.describe('Errores de la renuncia', () => {
    const casos = [
      {
        nombre: '404 COMERCIO_NO_DISPONIBLE',
        respuesta: { status: 404, body: { mensaje: 'Comercio no encontrado', data: { codigo: 'COMERCIO_NO_DISPONIBLE' } } },
        mensaje: 'No encontramos este comercio entre los tuyos. Es posible que ya no formes parte del equipo.',
      },
      {
        nombre: '409',
        respuesta: { status: 409, body: { mensaje: 'No se puede completar la salida en este momento', data: null } },
        mensaje: 'No se puede completar la salida en este momento',
      },
      {
        nombre: '500',
        respuesta: { status: 500, body: { mensaje: 'Error', data: null } },
        mensaje: 'No pudimos procesar tu salida del equipo. Intentá de nuevo.',
      },
    ];

    for (const caso of casos) {
      test(`ante un ${caso.nombre} muestra el mensaje dentro de la hoja, no cambia nada y permite reintentar`, async ({ page, request }) => {
        const comercio = await comercioNuevo(request);
        const miembro = await nuevoMiembro(request, [comercio]);
        await abrirPerfil(page, miembro, comercio);
        await page.route('**/empleados/comercios/*/renunciar', (ruta) =>
          ruta.fulfill({ status: caso.respuesta.status, contentType: 'application/json', body: JSON.stringify(caso.respuesta.body) }),
        );

        await renunciarDesdeLaHoja(page);

        await expect(page.getByTestId('error-renuncia')).toHaveText(caso.mensaje);
        await expect(page.getByTestId('hoja-renuncia-empleado')).toBeVisible();
        await expect(page.getByTestId('btn-confirmar-renuncia')).toBeEnabled();
        await expect(page.getByTestId('btn-confirmar-renuncia')).toHaveText('Dejar de trabajar');
        await expect(page.getByTestId('btn-volver-renuncia')).toBeEnabled();
        await expect(page.getByTestId('check-renuncia-entiendo')).toBeChecked();
        expect(page.url()).toContain('comercio-perfil.html');
        expect(await contextoEnSesion(page)).toMatchObject({ tipo: 'EMPLEADO', comercioId: comercio.id });
        expect(estadoRelacion(miembro.id, comercio.id)).toBe('ACTIVO');
        await expect(page.getByTestId('aviso-acceso-perdido')).toHaveCount(0);
        await sinScrollHorizontal(page);

        await page.unroute('**/empleados/comercios/*/renunciar');
        await page.getByTestId('btn-confirmar-renuncia').click();
        await page.waitForURL('**/index.html');
        expect(estadoRelacion(miembro.id, comercio.id)).toBe('INACTIVO');
      });
    }

    test('ante un fallo de red muestra el mensaje de conexión sin perder la hoja', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [comercio]);
      await abrirPerfil(page, miembro, comercio);
      await page.route('**/empleados/comercios/*/renunciar', (ruta) => ruta.abort('connectionrefused'));

      await renunciarDesdeLaHoja(page);

      await expect(page.getByTestId('error-renuncia')).toHaveText('No pudimos conectar. Revisá tu conexión e intentá de nuevo.');
      await expect(page.getByTestId('hoja-renuncia-empleado')).toBeVisible();
      await expect(page.getByTestId('btn-confirmar-renuncia')).toBeEnabled();
      expect(page.url()).toContain('comercio-perfil.html');
      expect(estadoRelacion(miembro.id, comercio.id)).toBe('ACTIVO');
    });

    test('destildar la casilla después de un error oculta el mensaje y vuelve a bloquear el botón', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [comercio]);
      await abrirPerfil(page, miembro, comercio);
      await page.route('**/empleados/comercios/*/renunciar', (ruta) =>
        ruta.fulfill({ status: 500, contentType: 'application/json', body: '{"mensaje":"Error","data":null}' }),
      );
      await renunciarDesdeLaHoja(page);
      await expect(page.getByTestId('error-renuncia')).toBeVisible();

      await page.getByTestId('check-renuncia-entiendo').uncheck();

      await expect(page.getByTestId('error-renuncia')).toBeHidden();
      await expect(page.getByTestId('btn-confirmar-renuncia')).toBeDisabled();
    });
  });

  test.describe('Pérdida de acceso según la causa', () => {
    async function esperarHoja(page: Page, causa: string) {
      const hoja = page.getByTestId('aviso-acceso-perdido');
      await expect(hoja).toBeVisible();
      await expect(hoja).toHaveAttribute('data-causa', causa);
      await expect(page.getByTestId('texto-acceso-perdido-2')).toHaveText(TEXTO_ELEGIR);
      await expect(page.getByTestId('btn-entendido-acceso-perdido')).toHaveText('Entendido');
    }

    async function entendido(page: Page, miembro: Miembro, conservado: Comercio, perdido: Comercio) {
      await page.getByTestId('btn-entendido-acceso-perdido').click();
      await page.waitForURL('**/seleccionar-contexto.html');
      await expect(page.getByTestId(`fila-contexto-comercio-${conservado.id}`)).toBeVisible();
      await expect(page.getByTestId(`fila-contexto-comercio-${perdido.id}`)).toHaveCount(0);
      await expect(page.getByTestId('aviso-acceso-perdido')).toHaveCount(0);
      expect(await contextoEnSesion(page)).toBeNull();
      expect(await ultimoContextoGuardado(page, miembro.id)).not.toBe(`EMPLEADO:${perdido.id}`);
    }

    test('1) baja del dueño: ícono rojo claro de persona, título, texto con el comercio y "Entendido" lleva al selector', async ({ page, request }) => {
      const conservado = await comercioNuevo(request);
      const perdido = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [conservado, perdido]);
      await abrirPagina(page, miembro, perdido, 'comercio-dashboard.html');

      expect((await putEquipo(request, perdido.id, miembro.id, 'desactivar')).status).toBe(200);
      await provocar404(page);

      await esperarHoja(page, 'BAJA_DUENO');
      await expect(page.getByTestId('titulo-acceso-perdido')).toHaveText('Ya no tenés acceso a este comercio');
      await expect(page.getByTestId('texto-acceso-perdido-1')).toHaveText(
        `${perdido.nombre} te dio de baja del equipo. Si creés que fue un error, comunicate con el dueño.`,
      );
      const icono = page.getByTestId('icono-acceso-perdido');
      await expect(icono).toHaveClass(/modal-sheet__icon--danger/);
      await expect(icono.locator('svg')).toHaveCount(1);
      expect(await colorDe(icono, 'color')).toBe(ROJO);
      expect(await colorDe(icono, 'backgroundColor')).not.toBe(await colorDe(page.getByTestId('btn-entendido-acceso-perdido'), 'backgroundColor'));
      expect(page.url()).toContain('comercio-dashboard.html');
      await sinScrollHorizontal(page);
      await capturar(page, 'hoja-baja');
      await entendido(page, miembro, conservado, perdido);
    });

    test('2) renunció en otro dispositivo: título y texto de renuncia, sin ícono de peligro', async ({ page, request, browser }) => {
      const conservado = await comercioNuevo(request);
      const perdido = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [conservado, perdido]);
      await abrirPagina(page, miembro, perdido, 'comercio-dashboard.html');

      const otroDispositivo = await contextoNuevo(browser);
      const paginaOtra = await otroDispositivo.newPage();
      await abrirPerfil(paginaOtra, miembro, perdido);
      await renunciarDesdeLaHoja(paginaOtra);
      await paginaOtra.waitForURL('**/seleccionar-contexto.html');
      await otroDispositivo.close();

      await provocar404(page);

      await esperarHoja(page, 'RENUNCIA');
      await expect(page.getByTestId('titulo-acceso-perdido')).toHaveText('Dejaste de trabajar en este comercio');
      await expect(page.getByTestId('texto-acceso-perdido-1')).toHaveText(
        `Ya no sos parte del equipo de ${perdido.nombre}. Si querés volver, el dueño te tiene que invitar de nuevo.`,
      );
      await expect(page.getByTestId('icono-acceso-perdido')).not.toHaveClass(/modal-sheet__icon--danger/);
      await sinScrollHorizontal(page);
      await capturar(page, 'hoja-renuncia-otro-dispositivo');
      await entendido(page, miembro, conservado, perdido);
    });

    test('3) comercio no disponible con la relación activa: título y texto propios', async ({ page, request }) => {
      const conservado = await comercioNuevo(request);
      const perdido = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [conservado, perdido]);
      await abrirPagina(page, miembro, perdido, 'comercio-dashboard.html');

      ponerEstadoComercio(perdido.id, 'INACTIVO');
      await provocar404(page);

      await esperarHoja(page, 'COMERCIO_NO_DISPONIBLE');
      await expect(page.getByTestId('titulo-acceso-perdido')).toHaveText('Este comercio no está disponible');
      await expect(page.getByTestId('texto-acceso-perdido-1')).toHaveText(
        `${perdido.nombre} no está disponible en este momento. Intentá más tarde o comunicate con el dueño.`,
      );
      expect(estadoRelacion(miembro.id, perdido.id)).toBe('ACTIVO');
      await sinScrollHorizontal(page);
      await capturar(page, 'hoja-comercio-no-disponible');
      await page.getByTestId('btn-entendido-acceso-perdido').click();
      await page.waitForURL('**/seleccionar-contexto.html');
      expect(await contextoEnSesion(page)).toBeNull();
    });

    test('4) cualquier otro caso: título y texto neutros, sin atribuir una causa', async ({ page, request }) => {
      const conservado = await comercioNuevo(request);
      const perdido = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [conservado, perdido]);
      await abrirPagina(page, miembro, perdido, 'comercio-dashboard.html');

      expect((await atajoEstadoRelacion(request, perdido.id, miembro.id, 'INACTIVO')).status).toBe(200);
      await provocar404(page);

      await esperarHoja(page, 'SIN_CAUSA');
      await expect(page.getByTestId('titulo-acceso-perdido')).toHaveText('Ya no tenés acceso a este comercio');
      await expect(page.getByTestId('texto-acceso-perdido-1')).toHaveText('Ya no tenés acceso a este comercio.');
      await expect(page.getByTestId('icono-acceso-perdido')).not.toHaveClass(/modal-sheet__icon--danger/);
      await sinScrollHorizontal(page);
      await entendido(page, miembro, conservado, perdido);
    });

    test('4) si la consulta de acceso falla (500 o 404) se muestra la hoja neutra', async ({ page, request }) => {
      const conservado = await comercioNuevo(request);
      const perdido = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [conservado, perdido]);
      await abrirPagina(page, miembro, perdido, 'comercio-dashboard.html');
      await page.route('**/acceso', (ruta) => ruta.fulfill({ status: 500, contentType: 'application/json', body: '{"mensaje":"Error","data":null}' }));

      expect((await putEquipo(request, perdido.id, miembro.id, 'desactivar')).status).toBe(200);
      await provocar404(page);

      await esperarHoja(page, 'SIN_CAUSA');
      await expect(page.getByTestId('texto-acceso-perdido-1')).toHaveText('Ya no tenés acceso a este comercio.');
      await entendido(page, miembro, conservado, perdido);
    });

    test('4) si no se conoce el nombre del comercio usa un nombre genérico en la baja del dueño', async ({ page, request }) => {
      const conservado = await comercioNuevo(request);
      const perdido = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [conservado, perdido]);
      await abrirPagina(page, miembro, perdido, 'comercio-dashboard.html');
      await page.evaluate(() => {
        const contexto = JSON.parse(sessionStorage.getItem('bajonea_contexto') as string);
        delete contexto.comercioNombre;
        sessionStorage.setItem('bajonea_contexto', JSON.stringify(contexto));
      });

      expect((await putEquipo(request, perdido.id, miembro.id, 'desactivar')).status).toBe(200);
      await provocar404(page);

      await esperarHoja(page, 'BAJA_DUENO');
      await expect(page.getByTestId('texto-acceso-perdido-1')).toHaveText(
        'El comercio te dio de baja del equipo. Si creés que fue un error, comunicate con el dueño.',
      );
    });

    test('sin otros comercios, "Entendido" pasa por el selector y termina en el inicio de Cliente', async ({ page, request }) => {
      const perdido = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [perdido]);
      await abrirPagina(page, miembro, perdido, 'comercio-pedidos.html');

      expect((await putEquipo(request, perdido.id, miembro.id, 'desactivar')).status).toBe(200);
      await provocar404(page);

      await esperarHoja(page, 'BAJA_DUENO');
      await page.getByTestId('btn-entendido-acceso-perdido').click();
      await page.waitForURL('**/index.html');
      expect(await contextoEnSesion(page)).toMatchObject({ tipo: 'CLIENTE' });
    });

    test('varios 404 a la vez muestran una sola hoja y una sola consulta de acceso', async ({ page, request }) => {
      const conservado = await comercioNuevo(request);
      const perdido = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [conservado, perdido]);
      await abrirPagina(page, miembro, perdido, 'comercio-dashboard.html');
      const consultasDeAcceso: string[] = [];
      page.on('request', (r) => {
        if (r.url().includes(`/empleados/comercios/${perdido.id}/acceso`)) {
          consultasDeAcceso.push(r.url());
        }
      });

      expect((await putEquipo(request, perdido.id, miembro.id, 'desactivar')).status).toBe(200);
      await provocar404(page, ['/productos', '/pedidos/comercio', '/comercios/perfil', '/pedidos/comercio/resumen-hoy']);

      await esperarHoja(page, 'BAJA_DUENO');
      await page.waitForTimeout(1000);
      await expect(page.getByTestId('aviso-acceso-perdido')).toHaveCount(1);
      expect(consultasDeAcceso).toHaveLength(1);
    });

    test('la pantalla de fondo queda oscurecida y sin interacción mientras está la hoja', async ({ page, request }) => {
      const conservado = await comercioNuevo(request);
      const perdido = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [conservado, perdido]);
      await abrirPagina(page, miembro, perdido, 'comercio-dashboard.html');

      expect((await putEquipo(request, perdido.id, miembro.id, 'desactivar')).status).toBe(200);
      await provocar404(page);
      await esperarHoja(page, 'BAJA_DUENO');

      const fondo = await colorDe(page.getByTestId('aviso-acceso-perdido'), 'backgroundColor');
      expect(fondo).toMatch(/^rgba\(\d+, \d+, \d+, 0\.\d+\)$/);
      await expect(page.getByTestId('btn-nav-pedidos').click({ trial: true, timeout: 1500 })).rejects.toThrow();
      await expect(page.locator('.toast')).toHaveCount(0);
    });

    test('por el sondeo de 15 segundos tras una baja real también aparece la hoja con la causa', async ({ page, request }) => {
      test.setTimeout(120_000);
      const conservado = await comercioNuevo(request);
      const perdido = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [conservado, perdido]);
      await abrirPagina(page, miembro, perdido, 'comercio-dashboard.html');

      expect((await putEquipo(request, perdido.id, miembro.id, 'desactivar')).status).toBe(200);

      await expect(page.getByTestId('aviso-acceso-perdido')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('aviso-acceso-perdido')).toHaveAttribute('data-causa', 'BAJA_DUENO');
      await entendido(page, miembro, conservado, perdido);
    });
  });

  test.describe('Avisos del Empleado', () => {
    test('T32 y T37 se ven completos en la campana personal, sin enlace, y tocarlos solo los marca como leídos', async ({ page, request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [comercio]);
      expect((await putEquipo(request, comercio.id, miembro.id, 'desactivar')).status).toBe(200);
      expect((await putEquipo(request, comercio.id, miembro.id, 'reactivar')).status).toBe(200);

      await abrirComoUsuarioConContexto(page, miembro.sesion, { contexto: { tipo: 'CLIENTE' } });
      await page.goto('/notificaciones.html');
      const baja = page.locator('.notification-item', { hasText: `${comercio.nombre} te dio de baja del equipo. Ya no tenés acceso a ese comercio.` });
      const reactivacion = page.locator('.notification-item', { hasText: `${comercio.nombre} te reactivó en el equipo. Ya podés volver a trabajar ahí.` });
      await expect(baja).toHaveCount(1);
      await expect(reactivacion).toHaveCount(1);
      for (const aviso of [baja, reactivacion]) {
        await expect(aviso.locator('.notification-item__texto')).toBeVisible();
        await expect(aviso.locator('.notification-item__fecha')).toBeVisible();
        await expect(aviso.locator('.notification-item__dot')).toHaveCount(1);
        await expect(aviso.locator('a')).toHaveCount(0);
      }
      await expect(baja).not.toHaveClass(/notification-item--leida/);
      await sinScrollHorizontal(page);
      await capturar(page, 'avisos-t32-t37');

      const comerciosPedidos: string[] = [];
      page.on('request', (r) => {
        if (r.url().includes('/comercios') || r.url().includes('/pedidos/comercio')) {
          comerciosPedidos.push(r.url());
        }
      });
      const urlAntes = page.url();
      await baja.click();
      await reactivacion.click();

      await expect(baja).toHaveClass(/notification-item--leida/);
      await expect(reactivacion).toHaveClass(/notification-item--leida/);
      await page.waitForTimeout(600);
      expect(page.url()).toBe(urlAntes);
      expect(comerciosPedidos).toEqual([]);
      await expect(page.getByTestId('aviso-acceso-perdido')).toHaveCount(0);
    });

    test('T37 coincide con el texto que arma el servidor para la reactivación', async ({ request }) => {
      const comercio = await comercioNuevo(request);
      const miembro = await nuevoMiembro(request, [comercio]);
      expect((await putEquipo(request, comercio.id, miembro.id, 'desactivar')).status).toBe(200);
      expect((await putEquipo(request, comercio.id, miembro.id, 'reactivar')).status).toBe(200);

      const avisos = await apiConHeaders(request, 'GET', '/notificaciones', miembro.sesion.token, {});
      const mensajes = (avisos.body.data as Array<{ mensaje: string; entidadTipo: string | null }>).map((a) => a.mensaje);
      expect(mensajes).toContain(`${comercio.nombre} te dio de baja del equipo. Ya no tenés acceso a ese comercio.`);
      expect(mensajes).toContain(`${comercio.nombre} te reactivó en el equipo. Ya podés volver a trabajar ahí.`);
    });
  });
});
