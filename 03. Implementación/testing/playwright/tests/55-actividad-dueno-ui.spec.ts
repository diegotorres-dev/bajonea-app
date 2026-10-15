import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page, Route } from '@playwright/test';
import {
  apiConHeaders,
  clonarComercioTest,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  login,
  invitarEmpleado,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { ClienteRegistrado, SesionApi } from './helpers/backend';
import { abrirComoUsuarioConContexto, sumarAlEquipo } from './helpers/empleado';
import { abrirComoUsuarioConComercio } from './helpers/selector';
import { prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';
import { fechaHoraSqlEnZona } from './helpers/zona';

const HEADER = 'X-Comercio-Id';
const RUTA_ACTIVIDAD = '**/comercios/equipo/actividad*';
const MS_DIA = 24 * 60 * 60 * 1000;
const NOMBRE_LARGO = `Producto-${'x'.repeat(110)}`;

interface ItemApi {
  id: string;
  fuente: string;
  fechaHora: string;
  actorNombre: string | null;
  actorRol: string;
  actorRolTexto: string;
  accionTexto: string;
  entidadNombre: string | null;
  detalle: string | null;
}

interface Persona {
  sesion: SesionApi;
  usuarioId: number;
  registro: ClienteRegistrado;
}

test.use({ viewport: { width: 375, height: 812 } });

test.describe('Pestaña Actividad del Dueño en pantalla, E3 entrega B etapa 4', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminToken: string;
  let localidadId: string;
  let dueno: Dueno;
  let comprador: Persona;
  let empleado: Persona;

  const hace = (ms: number): string => fechaHoraSqlEnZona(Date.now() - ms);

  async function nuevaPersona(request: APIRequestContext): Promise<Persona> {
    const registro = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, registro.nombreUsuario, registro.password);
    return { sesion, usuarioId: sesion.usuario.id, registro };
  }

  async function comercioNuevo(request: APIRequestContext): Promise<number> {
    return clonarComercioTest(request, dueno.comercioId, `Actividad UI ${sufijoUnico()}`, 'APROBADO');
  }

  function edicion(comercioId: number, usuarioId: number, rol: string, fecha: string, accion: string, nombre: string, detalle: string | null = null): void {
    sql(
      `INSERT INTO historial_edicion_comercio (comercio_id, usuario_id, actor_rol, entidad_tipo, entidad_id, entidad_nombre, accion, detalle, fecha_hora) ` +
        `VALUES (${comercioId}, ${usuarioId}, '${rol}', 'PRODUCTO', 1, '${nombre}', '${accion}', ${detalle === null ? 'NULL' : `'${detalle}'`}, '${fecha}');`,
    );
  }

  function cierre(comercioId: number, accion: string, rol: string, usuarioId: number | null, fecha: string): void {
    sql(
      `INSERT INTO historial_cierre_comercio (comercio_id, accion, actor_usuario_id, actor_rol, fecha_hora) ` +
        `VALUES (${comercioId}, '${accion}', ${usuarioId === null ? 'NULL' : usuarioId}, '${rol}', '${fecha}');`,
    );
  }

  function pedidoConHistorial(comercioId: number, estado: string, rol: string, usuarioId: number | null, fecha: string): void {
    sql(
      `INSERT INTO pedido (cliente_id, comercio_id, modalidad_entrega, estado, pago_estado, subtotal, cargo_servicio_cliente, cargo_servicio_comercio, total, fecha_creacion) ` +
        `VALUES (${comprador.usuarioId}, ${comercioId}, 'RETIRO', '${estado}', 'PAGADO', 10000, 200, 100, 10200, '${fecha}');` +
        ` INSERT INTO historial_estado_pedido (pedido_id, estado, actor_rol, actor_usuario_id, motivo_timeout, fecha_hora) ` +
        `VALUES (LAST_INSERT_ID(), '${estado}', '${rol}', ${usuarioId === null ? 'NULL' : usuarioId}, NULL, '${fecha}');`,
    );
  }

  function sembrarMezcla(comercioId: number): void {
    edicion(comercioId, dueno.sesion.usuario.id, 'DUENO', hace(10 * 60_000), 'CREAR', 'Producto Alfa');
    edicion(comercioId, empleado.usuarioId, 'EMPLEADO', hace(9 * 60_000), 'EDITAR', 'Producto Alfa', 'Cambio de precio');
    cierre(comercioId, 'CERRADO', 'DUENO', dueno.sesion.usuario.id, hace(8 * 60_000));
    cierre(comercioId, 'REABIERTO', 'SISTEMA', null, hace(7 * 60_000));
    pedidoConHistorial(comercioId, 'PENDIENTE_CONFIRMACION_COMERCIO', 'SISTEMA', null, hace(6 * 60_000));
    pedidoConHistorial(comercioId, 'EN_PREPARACION', 'EMPLEADO', empleado.usuarioId, hace(5 * 60_000));
    pedidoConHistorial(comercioId, 'CANCELADO', 'CLIENTE', comprador.usuarioId, hace(4 * 60_000));
  }

  function sembrarEdiciones(comercioId: number, cantidad: number, nombreDe: (i: number) => string): void {
    const base = Date.now() - 2 * 60 * 60_000;
    const valores: string[] = [];
    for (let i = 1; i <= cantidad; i += 1) {
      valores.push(`(${comercioId}, ${dueno.sesion.usuario.id}, 'DUENO', 'PRODUCTO', 1, '${nombreDe(i)}', 'CREAR', '${fechaHoraSqlEnZona(base + i * 1000)}')`);
    }
    sql(
      `INSERT INTO historial_edicion_comercio (comercio_id, usuario_id, actor_rol, entidad_tipo, entidad_id, entidad_nombre, accion, fecha_hora) VALUES ${valores.join(', ')};`,
    );
  }

  async function actividadApi(request: APIRequestContext, comercioId: number, consulta = 'limite=100'): Promise<{ items: ItemApi[]; siguienteCursor: string | null; hayMas: boolean }> {
    const respuesta = await apiConHeaders(request, 'GET', `/comercios/equipo/actividad?${consulta}`, dueno.token, { [HEADER]: String(comercioId) });
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    return respuesta.body.data;
  }

  async function abrirEquipo(page: Page, comercioId: number) {
    await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: comercioId, ultimoComercioId: comercioId });
    await page.goto('/comercio-perfil.html');
    const entrada = page.getByTestId('btn-ver-equipo');
    await expect(entrada).toBeEnabled();
    await entrada.click();
    await expect(page.getByTestId('titulo-equipo')).toBeVisible();
  }

  async function abrirActividad(page: Page, comercioId: number) {
    await abrirEquipo(page, comercioId);
    await irAActividad(page);
  }

  async function irAActividad(page: Page) {
    const pestana = page.getByTestId('tab-equipo-actividad');
    await pestana.click();
    await expect(pestana).toHaveAttribute('aria-selected', 'true');
  }

  const filas = (page: Page) => page.getByTestId('actividad-fila');
  const esperarFilas = async (page: Page, cantidad: number) => expect(filas(page)).toHaveCount(cantidad);
  const pedirActividad = (page: Page, condicion: (url: URL) => boolean = () => true) =>
    page.waitForRequest((peticion) => {
      const url = new URL(peticion.url());
      return url.pathname.endsWith('/comercios/equipo/actividad') && condicion(url);
    });

  async function sinDesborde(page: Page) {
    await sinScrollHorizontal(page);
  }

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    const horarios = [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
    dueno = await prepararAprobado(request, adminToken, localidadId, true, horarios);
    comprador = await nuevaPersona(request);
    empleado = await nuevaPersona(request);
    await sumarAlEquipo(request, dueno.comercioId, empleado.registro, dueno.token);
  });

  test.describe('Pestañas y pie', () => {
    test('el Dueño ve tres pestañas, la de Actividad esconde el botón Invitar y las otras dos lo devuelven', async ({ page, request }) => {
      const comercioId = await comercioNuevo(request);
      await abrirEquipo(page, comercioId);

      const pestanas = page.getByTestId('equipo-tabs').getByRole('tab');
      await expect(pestanas).toHaveCount(3);
      await expect(pestanas.nth(0)).toHaveText('Mi equipo · 0');
      await expect(pestanas.nth(1)).toHaveText('Solicitudes · 0');
      await expect(pestanas.nth(2)).toHaveText('Actividad');
      await expect(page.getByTestId('tab-equipo-equipo')).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId('btn-invitar-equipo')).toBeVisible();

      await irAActividad(page);
      await expect(page.getByTestId('actividad-filtros')).toBeVisible();
      await expect(page.getByTestId('btn-invitar-equipo')).toBeHidden();
      await expect(page.getByTestId('equipo-footer')).toBeHidden();

      await page.getByTestId('tab-equipo-solicitudes').click();
      await expect(page.getByTestId('tab-equipo-solicitudes')).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId('btn-invitar-equipo')).toBeVisible();
      await expect(page.getByTestId('actividad-filtros')).toHaveCount(0);

      await irAActividad(page);
      await page.getByTestId('tab-equipo-equipo').click();
      await expect(page.getByTestId('btn-invitar-equipo')).toBeVisible();
      await sinDesborde(page);
    });

    test('con contadores de dos cifras las tres pestañas entran enteras en 375 px, sin puntos suspensivos ni desborde', async ({ page, request }) => {
      const comercioId = await comercioNuevo(request);
      await abrirEquipo(page, comercioId);
      await expect(page.getByTestId('tab-equipo-equipo')).toHaveText('Mi equipo · 0');

      await page.getByTestId('equipo-tabs').evaluate((barra) => {
        const textos = ['Mi equipo · 12', 'Solicitudes · 12', 'Actividad'];
        barra.querySelectorAll('button').forEach((boton, i) => {
          boton.textContent = textos[i];
        });
      });

      const medidas = await page.getByTestId('equipo-tabs').evaluate((barra) =>
        Array.from(barra.querySelectorAll('button')).map((boton) => ({
          texto: boton.textContent,
          recortado: boton.scrollWidth > boton.clientWidth,
          dentro: boton.getBoundingClientRect().right <= barra.getBoundingClientRect().right + 0.5,
        })),
      );
      for (const medida of medidas) {
        expect(medida.recortado, `${medida.texto} recortado`).toBe(false);
        expect(medida.dentro, `${medida.texto} fuera de la barra`).toBe(true);
      }
      await sinDesborde(page);
    });

    test('un Empleado no ve la pantalla de equipo ni sus pestañas', async ({ page, request }) => {
      await abrirComoUsuarioConContexto(page, empleado.sesion, {
        contexto: { tipo: 'EMPLEADO', comercioId: dueno.comercioId },
        ultimoContexto: `EMPLEADO:${dueno.comercioId}`,
      });
      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('btn-ver-datos-comercio')).toBeVisible();
      await expect(page.getByTestId('btn-ver-equipo')).toHaveCount(0);
      await expect(page.getByTestId('equipo-tabs')).toHaveCount(0);
      await expect(page.getByTestId('tab-equipo-actividad')).toHaveCount(0);

      const respuesta = await apiConHeaders(request, 'GET', '/comercios/equipo/actividad', empleado.sesion.token, { [HEADER]: String(dueno.comercioId) });
      expect(respuesta.status).toBe(403);
    });
  });

  test.describe('Contenido de las filas', () => {
    test('cada fila muestra avatar, nombre, rol, acción y hora iguales a los del servidor, y el Sistema va con engranaje y sin nombre', async ({ page, request }) => {
      const comercioId = await comercioNuevo(request);
      sembrarMezcla(comercioId);
      const servidor = await actividadApi(request, comercioId);
      expect(servidor.items).toHaveLength(7);

      await abrirActividad(page, comercioId);
      await esperarFilas(page, 7);

      for (let i = 0; i < servidor.items.length; i += 1) {
        const item = servidor.items[i];
        const fila = filas(page).nth(i);
        await expect(fila.getByTestId('actividad-accion')).toHaveText(item.accionTexto);
        await expect(fila.getByTestId('actividad-rol')).toHaveText(item.actorRolTexto);
        await expect(fila.getByTestId('actividad-hora')).toHaveText(item.fechaHora.slice(11, 16));
        await expect(fila).toHaveAttribute('data-fuente', item.fuente);
        if (item.actorRol === 'SISTEMA') {
          expect(item.actorNombre).toBeNull();
          await expect(fila.getByTestId('actividad-avatar-sistema').locator('svg')).toBeVisible();
          await expect(fila.getByTestId('actividad-nombre')).toHaveCount(0);
          await expect(fila.getByTestId('actividad-rol')).toHaveText('Sistema');
        } else {
          expect(item.actorNombre).toBeTruthy();
          await expect(fila.getByTestId('actividad-nombre')).toHaveText(item.actorNombre as string);
          await expect(fila.getByTestId('actividad-avatar')).toHaveText(
            (item.actorNombre as string).split(/\s+/).slice(0, 2).map((palabra) => palabra[0].toUpperCase()).join(''),
          );
          await expect(fila.getByTestId('actividad-avatar-sistema')).toHaveCount(0);
        }
      }
      const roles = await filas(page).getByTestId('actividad-rol').allTextContents();
      expect([...new Set(roles)].sort()).toEqual(['Cliente', 'Dueño', 'Empleado', 'Sistema']);
      expect(servidor.items.filter((item) => item.actorRol === 'SISTEMA')).toHaveLength(2);

      const conReferencia = filas(page).filter({ hasText: 'Producto Alfa' });
      await expect(conReferencia).toHaveCount(2);
      await expect(conReferencia.filter({ hasText: 'Cambio de precio' })).toHaveCount(1);
      await sinDesborde(page);
    });

    test('las filas se agrupan por día con Hoy, Ayer y la fecha completa para los más viejos', async ({ page, request }) => {
      const comercioId = await comercioNuevo(request);
      edicion(comercioId, dueno.sesion.usuario.id, 'DUENO', hace(60_000), 'CREAR', 'De hoy uno');
      edicion(comercioId, dueno.sesion.usuario.id, 'DUENO', hace(2 * 60_000), 'CREAR', 'De hoy dos');
      edicion(comercioId, dueno.sesion.usuario.id, 'DUENO', hace(MS_DIA), 'CREAR', 'De ayer');
      const viejo = hace(5 * MS_DIA);
      edicion(comercioId, dueno.sesion.usuario.id, 'DUENO', viejo, 'CREAR', 'De hace cinco dias');
      const [anio, mes, dia] = viejo.slice(0, 10).split('-');

      await abrirActividad(page, comercioId);
      await esperarFilas(page, 4);

      const separadores = page.getByTestId('actividad-dia');
      await expect(separadores).toHaveText(['Hoy', 'Ayer', `${dia}/${mes}/${anio}`]);
      const secuencia = await page.getByTestId('actividad-filas').evaluate((contenedor) =>
        Array.from(contenedor.children).map((hijo) => (hijo.getAttribute('data-testid') === 'actividad-dia' ? `DIA:${hijo.textContent}` : (hijo.querySelector('[data-testid="actividad-referencia"]')?.textContent ?? ''))),
      );
      expect(secuencia).toEqual(['DIA:Hoy', 'De hoy uno', 'De hoy dos', 'DIA:Ayer', 'De ayer', `DIA:${dia}/${mes}/${anio}`, 'De hace cinco dias']);
      await sinDesborde(page);
    });
  });

  test.describe('Filtros', () => {
    test('cada chip le pide al servidor su fuente, "Todo" no manda ninguna y la lista muestra solo esa fuente', async ({ page, request }) => {
      const comercioId = await comercioNuevo(request);
      sembrarMezcla(comercioId);
      await abrirActividad(page, comercioId);
      await esperarFilas(page, 7);

      await expect(page.getByTestId('chip-actividad-todo')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('actividad-filtros').getByRole('button')).toHaveText(['Todo', 'Pedidos', 'Ediciones', 'Cierres']);

      const esperadas: Array<[string, string, number]> = [
        ['pedidos', 'PEDIDO', 3],
        ['ediciones', 'EDICION', 2],
        ['cierres', 'CIERRE', 2],
      ];
      for (const [chip, fuente, cantidad] of esperadas) {
        const peticion = pedirActividad(page, (url) => url.searchParams.get('fuente') === fuente);
        await page.getByTestId(`chip-actividad-${chip}`).click();
        await peticion;
        await esperarFilas(page, cantidad);
        await expect(page.getByTestId(`chip-actividad-${chip}`)).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByTestId('chip-actividad-todo')).toHaveAttribute('aria-pressed', 'false');
        const fuentes = await filas(page).evaluateAll((nodos) => nodos.map((nodo) => nodo.getAttribute('data-fuente')));
        expect(new Set(fuentes)).toEqual(new Set([fuente]));
      }

      const sinFiltro = pedirActividad(page, (url) => !url.searchParams.has('fuente'));
      await page.getByTestId('chip-actividad-todo').click();
      await sinFiltro;
      await esperarFilas(page, 7);
      await expect(page.getByTestId('chip-actividad-todo')).toHaveAttribute('aria-pressed', 'true');
      await sinDesborde(page);
    });

    test('un filtro sin resultados muestra su propio texto de vacío', async ({ page, request }) => {
      const comercioId = await comercioNuevo(request);
      expect((await actividadApi(request, comercioId)).items).toHaveLength(0);
      edicion(comercioId, dueno.sesion.usuario.id, 'DUENO', hace(60_000), 'CREAR', 'Solo una edición');

      await abrirActividad(page, comercioId);
      await esperarFilas(page, 1);

      await page.getByTestId('chip-actividad-pedidos').click();
      await expect(page.getByTestId('estado-vacio')).toContainText('No hay actividad de pedidos');
      await page.getByTestId('chip-actividad-cierres').click();
      await expect(page.getByTestId('estado-vacio')).toContainText('No hay cierres ni reaperturas');
      await expect(page.getByTestId('actividad-filtros')).toBeVisible();
      await page.getByTestId('chip-actividad-ediciones').click();
      await esperarFilas(page, 1);
      await sinDesborde(page);
    });

    test('un comercio sin actividad muestra el vacío general con los chips a la vista', async ({ page, request }) => {
      const comercioId = await comercioNuevo(request);
      expect((await actividadApi(request, comercioId)).items).toHaveLength(0);
      await abrirActividad(page, comercioId);
      await expect(page.getByTestId('estado-vacio')).toContainText('Todavía no hay actividad');
      await expect(page.getByTestId('actividad-filtros')).toBeVisible();
      await expect(page.getByTestId('btn-actividad-ver-mas')).toHaveCount(0);
      await sinDesborde(page);
    });
  });

  test.describe('Ver más', () => {
    test('la primera página trae 30, "Ver más" pide el cursor, suma las que faltan sin repetir y desaparece al llegar al final', async ({ page, request }) => {
      const comercioId = await comercioNuevo(request);
      sembrarEdiciones(comercioId, 35, (i) => `Producto ${String(i).padStart(2, '0')}`);
      sembrarEdiciones(comercioId, 1, () => NOMBRE_LARGO);

      await abrirActividad(page, comercioId);
      await esperarFilas(page, 30);
      const verMas = page.getByTestId('btn-actividad-ver-mas');
      await expect(verMas).toBeVisible();

      const peticion = pedirActividad(page, (url) => url.searchParams.has('cursor'));
      await verMas.click();
      const pedida = await peticion;
      expect(new URL(pedida.url()).searchParams.get('cursor')).toBeTruthy();
      await esperarFilas(page, 36);
      await expect(page.getByTestId('btn-actividad-ver-mas')).toHaveCount(0);

      const referencias = await page.getByTestId('actividad-referencia').allTextContents();
      expect(new Set(referencias).size).toBe(36);
      await expect(filas(page).filter({ hasText: NOMBRE_LARGO })).toHaveCount(1);
      await sinDesborde(page);
    });

    test('cambiar de filtro o de pestaña reinicia la lista y el cursor', async ({ page, request }) => {
      const comercioId = await comercioNuevo(request);
      sembrarEdiciones(comercioId, 35, (i) => `Producto ${String(i).padStart(2, '0')}`);
      cierre(comercioId, 'CERRADO', 'DUENO', dueno.sesion.usuario.id, hace(60_000));

      await abrirActividad(page, comercioId);
      await esperarFilas(page, 30);
      await page.getByTestId('btn-actividad-ver-mas').click();
      await esperarFilas(page, 36);

      const sinCursor = pedirActividad(page, (url) => url.searchParams.get('fuente') === 'EDICION' && !url.searchParams.has('cursor'));
      await page.getByTestId('chip-actividad-ediciones').click();
      await sinCursor;
      await esperarFilas(page, 30);
      await expect(page.getByTestId('btn-actividad-ver-mas')).toBeVisible();

      await page.getByTestId('btn-actividad-ver-mas').click();
      await esperarFilas(page, 35);

      await page.getByTestId('tab-equipo-equipo').click();
      await expect(page.getByTestId('actividad-filtros')).toHaveCount(0);
      const alVolver = pedirActividad(page, (url) => !url.searchParams.has('cursor') && !url.searchParams.has('fuente'));
      await irAActividad(page);
      await alVolver;
      await esperarFilas(page, 30);
      await expect(page.getByTestId('chip-actividad-todo')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('btn-actividad-ver-mas')).toBeVisible();
    });
  });

  test.describe('Cargando, error y reintento', () => {
    test('mientras llega la respuesta se ve el esqueleto y después las filas', async ({ page, request }) => {
      const comercioId = await comercioNuevo(request);
      sembrarMezcla(comercioId);
      await abrirEquipo(page, comercioId);

      let liberar: () => void = () => undefined;
      const espera = new Promise<void>((resolver) => {
        liberar = resolver;
      });
      await page.route(RUTA_ACTIVIDAD, async (ruta: Route) => {
        await espera;
        await ruta.continue();
      });
      await irAActividad(page);
      await expect(page.getByTestId('actividad-cargando')).toBeVisible();
      await expect(page.getByTestId('actividad-contenido')).toHaveAttribute('aria-busy', 'true');
      await expect(filas(page)).toHaveCount(0);
      liberar();
      await esperarFilas(page, 7);
      await expect(page.getByTestId('actividad-cargando')).toHaveCount(0);
    });

    test('si el servidor falla se ve el error con Reintentar, los chips siguen y al reintentar aparece la lista', async ({ page, request }) => {
      const comercioId = await comercioNuevo(request);
      sembrarMezcla(comercioId);
      await abrirEquipo(page, comercioId);

      await page.route(RUTA_ACTIVIDAD, (ruta) => ruta.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Error interno' }) }));
      await irAActividad(page);
      const error = page.getByTestId('actividad-error');
      await expect(error).toBeVisible();
      await expect(error).toContainText('No pudimos cargar la actividad.');
      await expect(page.getByTestId('actividad-filtros')).toBeVisible();
      await expect(page.getByTestId('btn-invitar-equipo')).toBeHidden();

      await page.unroute(RUTA_ACTIVIDAD);
      await page.getByTestId('btn-reintentar-actividad').click();
      await esperarFilas(page, 7);
      await expect(page.getByTestId('actividad-error')).toHaveCount(0);
      await sinDesborde(page);
    });

    test('si "Ver más" falla avisa con un toast, conserva lo ya cargado y deja volver a intentar', async ({ page, request }) => {
      const comercioId = await comercioNuevo(request);
      sembrarEdiciones(comercioId, 35, (i) => `Producto ${String(i).padStart(2, '0')}`);
      await abrirActividad(page, comercioId);
      await esperarFilas(page, 30);

      await page.route(RUTA_ACTIVIDAD, (ruta) => ruta.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Error interno' }) }));
      await page.getByTestId('btn-actividad-ver-mas').click();
      await expect(page.locator('.toast')).toContainText('No pudimos cargar más actividad');
      await esperarFilas(page, 30);
      await expect(page.getByTestId('btn-actividad-ver-mas')).toBeEnabled();

      await page.unroute(RUTA_ACTIVIDAD);
      await page.getByTestId('btn-actividad-ver-mas').click();
      await esperarFilas(page, 35);
    });

    test('una respuesta que llega tarde no pisa la pestaña a la que el Dueño ya se fue', async ({ page, request }) => {
      const comercioId = await comercioNuevo(request);
      sembrarMezcla(comercioId);
      await abrirEquipo(page, comercioId);

      let liberar: () => void = () => undefined;
      const espera = new Promise<void>((resolver) => {
        liberar = resolver;
      });
      await page.route(RUTA_ACTIVIDAD, async (ruta: Route) => {
        await espera;
        await ruta.continue();
      });
      await irAActividad(page);
      await expect(page.getByTestId('actividad-cargando')).toBeVisible();
      await page.getByTestId('tab-equipo-solicitudes').click();
      await expect(page.getByTestId('estado-vacio')).toContainText('No hay solicitudes');

      const llegada = page.waitForResponse((respuesta) => respuesta.url().includes('/comercios/equipo/actividad'));
      liberar();
      await llegada;
      await expect(page.getByTestId('estado-vacio')).toContainText('No hay solicitudes');
      await expect(filas(page)).toHaveCount(0);
      await expect(page.getByTestId('actividad-filtros')).toHaveCount(0);
      await expect(page.getByTestId('btn-invitar-equipo')).toBeVisible();
    });
  });

  test.describe('Actualización del equipo mientras se mira la Actividad', () => {
    test('el sondeo de 15 s actualiza los contadores pero no toca la lista de Actividad ni el "Ver más"', async ({ page, request }) => {
      const comercioId = await comercioNuevo(request);
      sembrarEdiciones(comercioId, 35, (i) => `Producto ${String(i).padStart(2, '0')}`);
      await page.clock.install();
      await abrirActividad(page, comercioId);
      await esperarFilas(page, 30);
      await page.getByTestId('btn-actividad-ver-mas').click();
      await esperarFilas(page, 35);

      const invitacion = await invitarEmpleado(request, dueno.token, comercioId, `act.ui.${sufijoUnico()}@bajonea.test`);
      expect(invitacion.status, JSON.stringify(invitacion.body)).toBe(201);

      let pedidosActividad = 0;
      page.on('request', (peticion) => {
        if (new URL(peticion.url()).pathname.endsWith('/comercios/equipo/actividad')) {
          pedidosActividad += 1;
        }
      });
      const sondeo = page.waitForResponse((respuesta) => new URL(respuesta.url()).pathname.endsWith('/comercios/equipo') && respuesta.request().method() === 'GET');
      await page.clock.runFor(15_000);
      await sondeo;

      await expect(page.getByTestId('tab-equipo-solicitudes')).toHaveText('Solicitudes · 1');
      await expect(page.getByTestId('tab-equipo-actividad')).toHaveAttribute('aria-selected', 'true');
      await esperarFilas(page, 35);
      await expect(page.getByTestId('btn-actividad-ver-mas')).toHaveCount(0);
      await expect(page.getByTestId('chip-actividad-todo')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('btn-invitar-equipo')).toBeHidden();
      expect(pedidosActividad).toBe(0);
    });

    test('volver a la vista de equipo desde cero empieza otra vez en "Mi equipo" con la Actividad reiniciada', async ({ page, request }) => {
      const comercioId = await comercioNuevo(request);
      sembrarMezcla(comercioId);
      await abrirActividad(page, comercioId);
      await esperarFilas(page, 7);
      await page.getByTestId('chip-actividad-pedidos').click();
      await esperarFilas(page, 3);

      await page.getByTestId('btn-volver-perfil-equipo').click();
      await expect(page.getByTestId('nombre-comercio-perfil')).toBeVisible();
      await page.getByTestId('btn-ver-equipo').click();
      await expect(page.getByTestId('tab-equipo-equipo')).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId('btn-invitar-equipo')).toBeVisible();

      await irAActividad(page);
      await esperarFilas(page, 7);
      await expect(page.getByTestId('chip-actividad-todo')).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
