import path from 'node:path';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  ADMIN_PASSWORD_CONOCIDA,
  ADMIN_USUARIO,
  aTitleCase,
  apiConHeaders,
  buscarComercioPendientePorEmail,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  nombreArchivoFixture,
  obtenerLocalidadRioGrande,
  registrarComercioAdicional,
  registrarYVerificarCliente,
  registrarYVerificarComercio,
  resolverComercio,
  sqlTest as sql,
  subirFotoNuevoComercio,
  sufijoUnico,
  suspenderComercio,
  vincularMercadoPagoSimuladoTest,
  esperarImagenCargadaEnRecorte,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';

const FIXTURE_BUFFER = readFileSync(path.resolve(__dirname, '../fixtures/bajonea-e2e-producto.png'));

const TEXTO_AVISO_SIN_MP = 'Usamos los datos fiscales de tu cuenta. No hace falta cargarlos de nuevo.';
const TEXTO_AVISO_CON_MP = 'Usamos los datos fiscales y la cuenta de MercadoPago de tu cuenta. No hace falta cargarlos de nuevo.';
const TEXTO_NO_ELEGIBLE = 'Para agregar un nuevo comercio, necesitás tener al menos uno aprobado previamente';
const TEXTO_DUPLICADO =
  'Ya tenés un comercio con ese nombre en esa dirección. Si es otro local del mismo edificio, agregá el piso o número de local.';

interface DuenoPreparado {
  sesion: SesionApi;
  email: string;
  comercioId: number;
  nombre: string;
}

type EstadoInicial = 'PENDIENTE' | 'APROBADO' | 'SUSPENDIDO';

async function prepararDueno(
  request: APIRequestContext,
  localidadId: string,
  opciones: { estado: EstadoInicial; mercadoPago?: boolean },
): Promise<DuenoPreparado> {
  const nombre = `Dueno UI Adic ${sufijoUnico()}`;
  const comercio = await registrarYVerificarComercio(request, localidadId, {
    nombre,
    horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
    aceptaDelivery: false,
    aceptaRetiro: true,
  });
  const adminToken = (await fijarPasswordAdminYLoguear(request)).token;
  const pendiente = await buscarComercioPendientePorEmail(request, adminToken, comercio.email);
  if (opciones.estado !== 'PENDIENTE') {
    await resolverComercio(request, adminToken, pendiente.id, true);
  }
  const sesion = await login(request, comercio.nombreUsuario, comercio.password);
  if (opciones.estado === 'SUSPENDIDO') {
    await suspenderComercio(request, adminToken, pendiente.id, 'Suspensión de fixture E2E');
  }
  if (opciones.mercadoPago) {
    await vincularMercadoPagoSimuladoTest(request, sesion.usuario.id);
  }
  return { sesion, email: comercio.email, comercioId: pendiente.id, nombre: comercio.nombre };
}

async function abrirComoUsuario(page: Page, sesion: SesionApi) {
  await page.addInitScript(
    ([token, usuario]) => {
      localStorage.setItem('bajonea_token', token);
      localStorage.setItem('bajonea_usuario', usuario);
    },
    [sesion.token, JSON.stringify(sesion.usuario)],
  );
}

async function loginAdminUi(page: Page) {
  await page.goto('/login.html');
  await page.getByTestId('input-nombre-usuario').fill(ADMIN_USUARIO);
  await page.getByTestId('input-password').fill(ADMIN_PASSWORD_CONOCIDA);
  await page.getByTestId('btn-ingresar').click();
  await page.waitForURL('**/admin-dashboard.html');
}

async function subirFotoUi(page: Page) {
  await page.getByTestId('input-foto-comercio').setInputFiles({
    name: nombreArchivoFixture(),
    mimeType: 'image/png',
    buffer: FIXTURE_BUFFER,
  });
  await expect(page.getByTestId('modal-recorte-imagen')).toBeVisible();
  await expect(page.getByTestId('canvas-recorte')).toBeVisible();
  await expect(page.getByTestId('input-zoom-recorte')).toBeVisible();
  await esperarImagenCargadaEnRecorte(page);
  await page.getByTestId('btn-confirmar-recorte').click();
  await expect(page.getByTestId('modal-recorte-imagen')).toHaveCount(0);
}

interface DatosPaso1 {
  nombre: string;
  calle: string;
  numero: string;
  pisoDepto?: string;
  telefono?: string;
  emailContacto?: string;
}

async function completarPaso1(page: Page, localidadId: string, datos: DatosPaso1) {
  await page.getByTestId('input-nombre').fill(datos.nombre);
  await page.getByTestId('select-tipo-comercio').selectOption('RESTAURANTE');
  await page.getByTestId('input-telefono').fill(datos.telefono ?? '2964123456');
  await page.getByTestId('input-email-contacto').fill(datos.emailContacto ?? `adic.ui.${sufijoUnico()}@bajonea.test`);
  await expect(page.getByTestId('select-localidad')).toBeEnabled();
  await page.getByTestId('select-localidad').selectOption(localidadId);
  await page.getByTestId('input-calle').fill(datos.calle);
  await page.getByTestId('input-numero').fill(datos.numero);
  if (datos.pisoDepto) {
    await page.getByTestId('input-piso-depto').fill(datos.pisoDepto);
  }
  await page.getByTestId('input-codigo-postal').fill('9420');
  await subirFotoUi(page);
}

async function completarPaso2(page: Page) {
  await page.getByTestId('tab-horario-personalizado').click();
  await page.getByTestId('btn-agregar-horario').click();
  const fila = page.getByTestId('fila-horario').nth(0);
  await fila.getByTestId('select-dia-horario').selectOption(diaDeHoy());
  await fila.getByTestId('input-apertura-horario').fill('09:00');
  await fila.getByTestId('input-cierre-horario').fill('18:00');
}

async function completarPaso3(page: Page, suf: string) {
  await page.getByTestId('select-tipo-red-social').selectOption('INSTAGRAM');
  await page.getByTestId('input-url-red-social').fill(`instagram.com/adic.ui.${suf}`);
}

async function recorrerWizardCompleto(page: Page, localidadId: string, datos: DatosPaso1) {
  await completarPaso1(page, localidadId, datos);
  await page.getByTestId('btn-continuar').click();
  await expect(page.getByTestId('btn-continuar-2')).toBeVisible();
  await completarPaso2(page);
  await page.getByTestId('btn-continuar-2').click();
  await expect(page.getByTestId('lista-redes-sociales')).toBeVisible();
  await completarPaso3(page, sufijoUnico());
}

async function notificacionesDelDueno(request: APIRequestContext, token: string, comercioId: number) {
  const { status, body } = await apiConHeaders(request, 'GET', '/notificaciones', token, { 'X-Comercio-Id': String(comercioId) });
  expect(status).toBe(200);
  return (body.data as any[]).filter((n) => n.entidadTipo === 'COMERCIO' && n.entidadId === comercioId);
}

test.describe('Multi-comercio, tramo 2B: alta adicional de comercio (UI del Dueño y bandeja del Administrador)', () => {
  test.describe.configure({ timeout: 240_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  let localidadId: string;
  let base: DuenoPreparado;
  let conMercadoPago: DuenoPreparado;

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
    base = await prepararDueno(request, localidadId, { estado: 'APROBADO' });
    conMercadoPago = await prepararDueno(request, localidadId, { estado: 'APROBADO', mercadoPago: true });
  });

  test.describe('acceso y elegibilidad', () => {
    test('un visitante sin sesión y un Cliente son redirigidos a login.html', async ({ page, request }) => {
      await page.goto('/agregar-comercio.html');
      await page.waitForURL('**/login.html');

      const cliente = await registrarYVerificarCliente(request, localidadId);
      const sesionCliente = await login(request, cliente.nombreUsuario, cliente.password);
      await abrirComoUsuario(page, sesionCliente);
      await page.goto('/agregar-comercio.html');
      await page.waitForURL('**/login.html');
    });

    test('mientras consulta la elegibilidad muestra un skeleton, no datos fijos', async ({ page }) => {
      await abrirComoUsuario(page, base.sesion);
      await page.route('**/comercios/alta-adicional/elegibilidad', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        await route.continue();
      });
      await page.goto('/agregar-comercio.html');
      await expect(page.getByTestId('skeleton-agregar-comercio')).toBeVisible();
      await expect(page.getByTestId('input-nombre')).toBeHidden();
      await expect(page.getByTestId('btn-continuar')).toBeVisible();
      await expect(page.getByTestId('skeleton-agregar-comercio')).toBeHidden();
    });

    test('un Dueño con solo un comercio pendiente ve la pantalla de "no puede agregar" y vuelve al inicio', async ({ page, request }) => {
      const pendiente = await prepararDueno(request, localidadId, { estado: 'PENDIENTE' });
      await abrirComoUsuario(page, pendiente.sesion);
      await page.goto('/agregar-comercio.html');

      const pantalla = page.getByTestId('pantalla-no-elegible');
      await expect(pantalla).toBeVisible();
      await expect(pantalla).toContainText('Todavía no podés agregar otro comercio');
      await expect(pantalla).toContainText(TEXTO_NO_ELEGIBLE);
      await expect(page.getByTestId('input-nombre')).toBeHidden();
      await expect(page.getByTestId('btn-volver-inicio-no-elegible')).toHaveAttribute('href', 'comercio-dashboard.html');
    });

    test('un Dueño cuyo único comercio está suspendido también ve la pantalla de "no puede agregar"', async ({ page, request }) => {
      const suspendido = await prepararDueno(request, localidadId, { estado: 'SUSPENDIDO' });
      await abrirComoUsuario(page, suspendido.sesion);
      await page.goto('/agregar-comercio.html');

      await expect(page.getByTestId('pantalla-no-elegible')).toContainText(TEXTO_NO_ELEGIBLE);
      await expect(page.getByTestId('btn-continuar')).toBeHidden();
    });

    test('el aviso del paso 1 no nombra a MercadoPago si el Dueño no tiene la cuenta vinculada', async ({ page }) => {
      await abrirComoUsuario(page, base.sesion);
      await page.goto('/agregar-comercio.html');
      await expect(page.getByTestId('aviso-datos-reutilizados')).toHaveText(TEXTO_AVISO_SIN_MP);
    });

    test('el aviso del paso 1 nombra la cuenta de MercadoPago si el Dueño la tiene vinculada', async ({ page }) => {
      await abrirComoUsuario(page, conMercadoPago.sesion);
      await page.goto('/agregar-comercio.html');
      await expect(page.getByTestId('aviso-datos-reutilizados')).toHaveText(TEXTO_AVISO_CON_MP);
    });
  });

  test.describe('el formulario de 3 pasos', () => {
    test('completa los 3 pasos, envía la solicitud y llega a la pantalla de confirmación', async ({ page }) => {
      const nombre = `Sucursal UI ${sufijoUnico()}`;
      await abrirComoUsuario(page, base.sesion);
      await page.goto('/agregar-comercio.html');
      await expect(page.getByTestId('btn-continuar')).toBeVisible();

      await expect(page.getByTestId('input-piso-depto')).toBeVisible();
      await expect(page.getByText('Piso / depto (opcional)')).toBeVisible();
      await expect(page.getByTestId('input-piso-depto')).toHaveAttribute('placeholder', 'Local 3');

      await completarPaso1(page, localidadId, { nombre, calle: 'Belgrano', numero: '250', pisoDepto: 'Local 3' });
      await page.getByTestId('btn-continuar').click();
      await expect(page.getByTestId('btn-continuar-2')).toBeVisible();
      await completarPaso2(page);
      await page.getByTestId('btn-continuar-2').click();
      await expect(page.getByTestId('lista-redes-sociales')).toBeVisible();
      await completarPaso3(page, sufijoUnico());

      const respuestaAlta = page.waitForResponse((res) => res.url().endsWith('/comercios') && res.request().method() === 'POST');
      await page.getByTestId('btn-enviar-solicitud').click();
      expect((await respuestaAlta).status()).toBe(201);

      const confirmacion = page.getByTestId('pantalla-solicitud-recibida');
      await expect(confirmacion).toBeVisible();
      await expect(confirmacion).toContainText('Recibimos tu solicitud');
      await expect(confirmacion).toContainText(`${aTitleCase(nombre)} está en revisión.`);
      await expect(confirmacion).toContainText('El equipo de Bajoneá revisará tu solicitud y te notificaremos cuando tengamos una respuesta');
      await expect(page.getByTestId('btn-volver-inicio-exito')).toHaveAttribute('href', 'comercio-dashboard.html');

      const fila = sql(
        `SELECT CONCAT(c.estado, '|', c.dueno_id, '|', IFNULL(d.piso_depto, 'NULL'), '|', d.calle, '|', c.acepta_delivery, '|', c.acepta_retiro) ` +
          `FROM comercio c JOIN direccion d ON d.comercio_id = c.id WHERE c.nombre = '${aTitleCase(nombre)}';`,
      );
      expect(fila).toBe(`PENDIENTE|${base.sesion.usuario.id}|Local 3|Belgrano|1|0`);
      const cantidadHorarios = sql(
        `SELECT COUNT(*) FROM horario h JOIN comercio c ON c.id = h.comercio_id WHERE c.nombre = '${aTitleCase(nombre)}';`,
      );
      expect(cantidadHorarios).toBe('1');
      const foto = sql(`SELECT foto_perfil_url FROM comercio WHERE nombre = '${aTitleCase(nombre)}';`);
      expect(foto).toContain(`/duenos/${base.sesion.usuario.id}/comercios-nuevos/`);
    });

    test('un duplicado exacto muestra el banner de error y vuelve al paso 1 con lo cargado', async ({ page }) => {
      await abrirComoUsuario(page, base.sesion);
      await page.goto('/agregar-comercio.html');
      await expect(page.getByTestId('btn-continuar')).toBeVisible();
      const antes = sql(`SELECT COUNT(*) FROM comercio WHERE dueno_id = ${base.sesion.usuario.id};`);

      await recorrerWizardCompleto(page, localidadId, { nombre: base.nombre, calle: 'Av. San Martín', numero: '100' });

      const respuestaAlta = page.waitForResponse((res) => res.url().endsWith('/comercios') && res.request().method() === 'POST');
      await page.getByTestId('btn-enviar-solicitud').click();
      expect((await respuestaAlta).status()).toBe(409);

      const banner = page.getByTestId('mensaje-banner');
      await expect(banner).toContainText(TEXTO_DUPLICADO);
      await expect(page.getByTestId('btn-continuar')).toBeVisible();
      await expect(page.getByTestId('input-nombre')).toHaveValue(base.nombre);
      await expect(page.getByTestId('btn-enviar-solicitud')).toBeHidden();
      expect(sql(`SELECT COUNT(*) FROM comercio WHERE dueno_id = ${base.sesion.usuario.id};`)).toBe(antes);
    });

    test('un error de validación del backend se marca en el campo y vuelve al paso 1', async ({ page }) => {
      await abrirComoUsuario(page, base.sesion);
      await page.route('**/comercios', async (route) => {
        if (route.request().method() !== 'POST') {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ mensaje: 'validación', data: { emailContacto: 'Ingresá un email de contacto con formato válido' } }),
        });
      });
      await page.goto('/agregar-comercio.html');
      await expect(page.getByTestId('btn-continuar')).toBeVisible();
      await recorrerWizardCompleto(page, localidadId, { nombre: `Validacion UI ${sufijoUnico()}`, calle: 'Belgrano', numero: '251' });
      await page.getByTestId('btn-enviar-solicitud').click();

      await expect(page.getByTestId('mensaje-banner')).toContainText('Revisá los campos marcados.');
      await expect(page.getByTestId('mensaje-error-email-contacto')).toContainText('Ingresá un email de contacto con formato válido');
      await expect(page.getByTestId('btn-continuar')).toBeVisible();
    });

    test('la flecha atrás vuelve de un paso al anterior conservando lo cargado', async ({ page }) => {
      await abrirComoUsuario(page, base.sesion);
      await page.goto('/agregar-comercio.html');
      await expect(page.getByTestId('btn-continuar')).toBeVisible();
      await completarPaso1(page, localidadId, { nombre: `Atras UI ${sufijoUnico()}`, calle: 'Belgrano', numero: '252' });
      await page.getByTestId('btn-continuar').click();
      await expect(page.getByTestId('btn-continuar-2')).toBeVisible();

      await page.getByTestId('btn-volver').click();
      await expect(page.getByTestId('btn-continuar')).toBeVisible();
      await expect(page.getByTestId('input-calle')).toHaveValue('Belgrano');
      await expect(page.getByTestId('modal-confirmar-salida')).toHaveCount(0);
    });

    test('con datos cargados pide confirmar la salida: "Seguir cargando" se queda y "Salir" va al inicio', async ({ page }) => {
      await abrirComoUsuario(page, base.sesion);
      await page.goto('/agregar-comercio.html');
      await expect(page.getByTestId('btn-continuar')).toBeVisible();
      await page.getByTestId('input-nombre').fill('Algo que perder');

      await page.getByTestId('btn-volver').click();
      const modal = page.getByTestId('modal-confirmar-salida');
      await expect(modal).toBeVisible();
      await expect(modal).toContainText('¿Salir?');
      await expect(modal).toContainText('Vas a perder lo que cargaste');

      await page.getByTestId('btn-seguir-cargando').click();
      await expect(modal).toHaveCount(0);
      await expect(page.getByTestId('input-nombre')).toHaveValue('Algo que perder');

      await page.getByTestId('btn-volver').click();
      await page.getByTestId('btn-confirmar-salida').click();
      await page.waitForURL('**/comercio-dashboard.html');
    });

    test('sin datos cargados la flecha atrás sale directo, sin confirmación', async ({ page }) => {
      await abrirComoUsuario(page, base.sesion);
      await page.goto('/agregar-comercio.html');
      await expect(page.getByTestId('btn-continuar')).toBeVisible();

      await page.getByTestId('btn-volver').click();
      await page.waitForURL('**/comercio-dashboard.html');
    });
  });

  test.describe('bandeja y detalle del Administrador', () => {
    test('el Administrador ve la etiqueta "Comercio adicional" y el resumen de los otros comercios, aprueba y el Dueño recibe el aviso', async ({
      page,
      request,
    }) => {
      const dueno = await prepararDueno(request, localidadId, { estado: 'APROBADO' });
      const alta = await registrarComercioAdicional(request, dueno.sesion.token, localidadId, {
        nombre: `Adicional Bandeja ${sufijoUnico()}`,
      });
      expect(alta.status).toBe(201);
      const adicionalId = alta.body.data.id as number;
      const nombreAdicional = alta.body.data.nombre as string;
      const regular = await registrarYVerificarComercio(request, localidadId, {
        nombre: `Primer Comercio ${sufijoUnico()}`,
        horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
      });
      const adminToken = (await fijarPasswordAdminYLoguear(request)).token;
      const regularPendiente = await buscarComercioPendientePorEmail(request, adminToken, regular.email);

      await loginAdminUi(page);
      await page.goto('/admin-comercios-pendientes.html');

      const tarjeta = page.getByTestId(`comercio-pendiente-item-${adicionalId}`);
      await expect(tarjeta).toBeVisible();
      await expect(tarjeta).toContainText('Nueva');
      await expect(page.getByTestId(`badge-comercio-adicional-${adicionalId}`)).toHaveText('Comercio adicional');
      await expect(page.getByTestId(`comercio-pendiente-item-${regularPendiente.id}`)).toBeVisible();
      await expect(page.getByTestId(`badge-comercio-adicional-${regularPendiente.id}`)).toHaveCount(0);

      await page.getByTestId(`btn-ver-solicitud-${regularPendiente.id}`).click();
      await page.waitForURL(new RegExp(`admin-comercio-detalle\\.html\\?id=${regularPendiente.id}$`));
      await expect(page.getByTestId('detalle-comercio-pendiente')).toContainText('Datos Legales / Fiscales');
      await expect(page.getByTestId('resumen-dueno')).toHaveCount(0);
      await expect(page.getByTestId('seccion-otros-comercios')).toHaveCount(0);

      await page.goto(`/admin-comercio-detalle.html?id=${adicionalId}`);
      const resumen = page.getByTestId('resumen-dueno');
      await expect(resumen).toBeVisible();
      await expect(page.getByTestId('nombre-dueno')).toHaveText('Representante Playwright');
      await expect(page.getByTestId('nota-datos-fiscales-revisados')).toHaveText('Datos fiscales ya revisados y aprobados');
      const otros = page.getByTestId('seccion-otros-comercios');
      await expect(otros).toContainText('Otros comercios de este Dueño');
      await expect(page.getByTestId(`otro-comercio-${dueno.comercioId}`)).toContainText(dueno.nombre);
      await expect(page.getByTestId(`estado-otro-comercio-${dueno.comercioId}`)).toHaveText('Aprobado');
      await expect(page.getByTestId(`otro-comercio-${adicionalId}`)).toHaveCount(0);
      await expect(page.getByText('Dueño desde')).toHaveCount(0);

      const resolverResponse = page.waitForResponse(
        (res) => res.url().endsWith(`/administrador/comercios/${adicionalId}/resolver`) && res.request().method() === 'PUT',
      );
      await page.getByTestId('btn-aprobar-comercio').click();
      await page.getByTestId('btn-confirmar-aprobacion').click();
      expect((await resolverResponse).status()).toBe(200);
      await page.waitForURL('**/admin-comercios-pendientes.html?comercioResuelto=1');

      expect(sql(`SELECT estado FROM comercio WHERE id = ${adicionalId};`)).toBe('APROBADO');
      const avisos = await notificacionesDelDueno(request, dueno.sesion.token, adicionalId);
      expect(avisos.map((n) => n.mensaje)).toContain(`Tu comercio ${nombreAdicional} fue aprobado`);
    });

    test('con la cuenta de MercadoPago activa el comercio adicional aprobado nace listo para vender', async ({ page, request }) => {
      const alta = await registrarComercioAdicional(request, conMercadoPago.sesion.token, localidadId, {
        nombre: `Adicional MP ${sufijoUnico()}`,
      });
      expect(alta.status).toBe(201);
      const adicionalId = alta.body.data.id as number;
      const nombreAdicional = alta.body.data.nombre as string;
      await fijarPasswordAdminYLoguear(request);

      await loginAdminUi(page);
      await page.goto(`/admin-comercio-detalle.html?id=${adicionalId}`);
      await expect(page.getByTestId(`estado-otro-comercio-${conMercadoPago.comercioId}`)).toHaveText('Listo para vender');

      const resolverResponse = page.waitForResponse(
        (res) => res.url().endsWith(`/administrador/comercios/${adicionalId}/resolver`) && res.request().method() === 'PUT',
      );
      await page.getByTestId('btn-aprobar-comercio').click();
      await page.getByTestId('btn-confirmar-aprobacion').click();
      expect((await resolverResponse).status()).toBe(200);
      await page.waitForURL('**/admin-comercios-pendientes.html?comercioResuelto=1');

      expect(sql(`SELECT estado FROM comercio WHERE id = ${adicionalId};`)).toBe('APTO_VENTA');
      const avisos = await notificacionesDelDueno(request, conMercadoPago.sesion.token, adicionalId);
      expect(avisos.map((n) => n.mensaje)).toContain(`Tu comercio ${nombreAdicional} fue aprobado y ya podés vender`);
    });
  });
});

test.describe('Multi-comercio, tramo 2B: textos del backend', () => {
  test('el 409 de "no elegible" y el de duplicado usan los textos finales', async ({ request }) => {
    const localidadId = await obtenerLocalidadRioGrande(request);
    const pendiente = await prepararDueno(request, localidadId, { estado: 'PENDIENTE' });
    const sinElegibilidad = await registrarComercioAdicional(request, pendiente.sesion.token, localidadId, {
      fotoPerfilUrl: `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/v1/duenos/${pendiente.sesion.usuario.id}/comercios-nuevos/texto.png`,
    });
    expect(sinElegibilidad.status).toBe(409);
    expect(sinElegibilidad.body.mensaje).toBe(TEXTO_NO_ELEGIBLE);

    const aprobado = await prepararDueno(request, localidadId, { estado: 'APROBADO' });
    const foto = await subirFotoNuevoComercio(request, aprobado.sesion.token);
    const duplicado = await registrarComercioAdicional(request, aprobado.sesion.token, localidadId, {
      fotoPerfilUrl: foto,
      nombre: aprobado.nombre,
      direccion: { calle: 'Av. San Martín', numero: '100', pisoDepto: null, codigoPostal: '9420', localidadId, principal: false },
    });
    expect(duplicado.status).toBe(409);
    expect(duplicado.body.mensaje).toBe(TEXTO_DUPLICADO);
  });
});
