import path from 'node:path';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  aTitleCase,
  apiConHeaders,
  diaDistintoDeHoy,
  esperarImagenCargadaEnRecorte,
  fijarPasswordAdminYLoguear,
  generarCuit,
  nombreArchivoFixture,
  obtenerLocalidadRioGrande,
  registrarComercioAdicional,
  registrarYVerificarCliente,
  login,
  resolverComercio,
  sqlTest as sql,
  subirFotoNuevoComercio,
  sufijoUnico,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import {
  MOTIVO_RECHAZO,
  abrirComoUsuario,
  camposDeLosCambios,
  cantidadResolicitudesDe,
  capturar,
  clonarConRedes,
  estadoDe,
  loginAdminUi,
  loginUi,
  metricasDelAdmin,
  prepararAprobado,
  prepararRechazado,
  registrarPendiente,
  reenviarConCambioSimple,
} from './helpers/multicomercio';

const FIXTURE_BUFFER = readFileSync(path.resolve(__dirname, '../fixtures/bajonea-e2e-producto.png'));

const VIEWPORT = { width: Number(process.env.E2E_ANCHO || 390), height: Number(process.env.E2E_ALTO || 844) };

const MENSAJE_SIN_CAMBIOS = 'Modificá al menos un dato antes de volver a solicitar';
const DESCRIPCION_ORIGINAL = 'Comercio de prueba generado por Playwright (Fase 17)';
const TEXTO_DEFINITIVO =
  'Este comercio fue rechazado de forma definitiva, así que ya no se puede volver a solicitar. Si creés que se trata de un error, contactá a soporte.';
const AVISO_LEGALES =
  'Como todavía no tenés ningún comercio aprobado, podés corregir también tus datos fiscales y los del representante. Tu usuario, email y contraseña no se modifican.';

let adminSesion: SesionApi;
let adminToken: string;
let localidadId: string;

async function abrirComoAdmin(page: Page) {
  await abrirComoUsuario(page, adminSesion);
}

async function irAlPaso(page: Page, boton: string, siguienteVisible: string) {
  await page.getByTestId(boton).click();
  await expect(page.getByTestId(siguienteVisible)).toBeVisible();
}

async function recorrerHastaEnviar(page: Page, { conLegales }: { conLegales: boolean }) {
  await page.getByTestId('btn-continuar').click();
  if (conLegales) {
    await expect(page.getByTestId('btn-continuar-legales')).toBeVisible();
    await page.getByTestId('btn-continuar-legales').click();
  }
  await expect(page.getByTestId('btn-continuar-horarios')).toBeVisible();
  await page.getByTestId('btn-continuar-horarios').click();
  await expect(page.getByTestId('btn-enviar-solicitud')).toBeVisible();
  await page.getByTestId('btn-enviar-solicitud').click();
}

async function esperarFormularioCargado(page: Page) {
  await expect(page.getByTestId('input-nombre')).toBeVisible();
  await expect(page.getByTestId('select-localidad')).toBeEnabled();
}

async function rechazarComoAdminDesdeLista(page: Page, comercioId: number, motivo: string, opciones: { definitivo?: boolean } = {}) {
  await page.goto('/admin-resolicitudes.html');
  await page.getByTestId(`btn-ver-resolicitud-${comercioId}`).click();
  await expect(page.getByTestId('detalle-resolicitud')).toBeVisible();
  await page.getByTestId('btn-rechazar-comercio').click();
  await expect(page.getByTestId('modal-rechazar-comercio')).toBeVisible();
  await page.getByTestId('input-motivo-rechazo-comercio').fill(motivo);
  if (opciones.definitivo) {
    await page.getByTestId('switch-rechazo-definitivo').click();
  }
  await page.getByTestId('btn-confirmar-rechazo-comercio').click();
  await page.waitForURL('**/admin-resolicitudes.html?comercioResuelto=1');
}

test.describe('Multi-comercio, tramo 3B: corrección de comercios rechazados (UI del Dueño y del Administrador)', () => {
  test.describe.configure({ timeout: 300_000 });
  test.use({ viewport: VIEWPORT });

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
    adminSesion = await fijarPasswordAdminYLoguear(request);
    adminToken = adminSesion.token;
  });

  test.describe('acceso', () => {
    test('un visitante, un Cliente y un Dueño son redirigidos al login en las pantallas que no son suyas', async ({ page, request }) => {
      await page.goto('/comercio-corregir.html?id=1');
      await page.waitForURL('**/login.html');
      await page.goto('/comercio-rechazo-definitivo.html');
      await page.waitForURL('**/login.html');
      await page.goto('/admin-resolicitudes.html');
      await page.waitForURL('**/login.html');

      const cliente = await registrarYVerificarCliente(request, localidadId);
      const sesionCliente = await login(request, cliente.nombreUsuario, cliente.password);
      await abrirComoUsuario(page, sesionCliente);
      await page.goto('/comercio-corregir.html?id=1');
      await page.waitForURL('**/login.html');
      await page.goto('/comercio-rechazado.html');
      await page.waitForURL('**/login.html');

      const dueno = await prepararRechazado(request, adminToken, localidadId);
      await page.evaluate(() => localStorage.clear());
      await abrirComoUsuario(page, dueno.sesion);
      await page.goto('/admin-resolicitudes.html');
      await page.waitForURL('**/login.html');
      await page.goto('/admin-resolicitud-detalle.html?id=1');
      await page.waitForURL('**/login.html');
    });

    test('un comercio ajeno o con id inválido en la corrección devuelve al Dueño a su pantalla de estado', async ({ page, request }) => {
      const propio = await prepararRechazado(request, adminToken, localidadId);
      const ajeno = await prepararRechazado(request, adminToken, localidadId);
      await abrirComoUsuario(page, propio.sesion);

      await page.goto(`/comercio-corregir.html?id=${ajeno.comercioId}`);
      await page.waitForURL('**/comercio-rechazado.html?id=*');
      await page.goto('/comercio-corregir.html?id=abc');
      await page.waitForURL('**/comercio-rechazado.html?id=*');
    });
  });

  test.describe('pantalla de rechazo y flujo completo de corrección', () => {
    test('el Dueño con único comercio rechazado ve los intentos, corrige, reenvía y queda pendiente; el Administrador compara y aprueba', async ({
      page,
      browser,
      request,
    }) => {
      const dueno = await prepararRechazado(request, adminToken, localidadId);

      await loginUi(page, dueno.nombreUsuario, dueno.password);
      await page.waitForURL('**/comercio-rechazado.html?id=*');
      await expect(page.getByRole('heading', { name: 'Tu solicitud fue rechazada' })).toBeVisible();
      await expect(page.getByTestId('motivo-rechazo-comercio')).toContainText(MOTIVO_RECHAZO);
      await expect(page.getByTestId('texto-correccion')).toHaveText('Podés corregir los datos y volver a solicitarla. Te quedan 3 intentos.');
      await expect(page.getByTestId('btn-cerrar-sesion')).toBeVisible();
      await capturar(page, 'rechazado');
      await page.getByTestId('btn-corregir-solicitud').click();
      await page.waitForURL(`**/comercio-corregir.html?id=${dueno.comercioId}`);

      await esperarFormularioCargado(page);
      await expect(page.locator('.app-header__title')).toHaveText('Corregir solicitud');
      await expect(page.getByTestId('badge-intento')).toHaveText('Intento 1 de 3');
      await expect(page.getByTestId('motivo-rechazo-correccion')).toContainText(MOTIVO_RECHAZO);
      await expect(page.locator('#step-progress-labels span')).toHaveText(['1. Negocio', '2. Legales', '3. Horarios', '4. Redes']);
      await expect(page.getByTestId('input-nombre')).toHaveValue(dueno.nombre);
      await expect(page.getByTestId('select-tipo-comercio')).toHaveValue('RESTAURANTE');
      await expect(page.getByTestId('input-descripcion')).toHaveValue(DESCRIPCION_ORIGINAL);
      await expect(page.getByTestId('input-telefono')).toHaveValue(/^2964\d{6}$/);
      await expect(page.getByTestId('select-localidad')).toHaveValue(localidadId);
      await expect(page.getByTestId('select-provincia')).not.toHaveValue('');
      await expect(page.getByTestId('input-calle')).toHaveValue('Av. San Martín');
      await expect(page.getByTestId('input-numero')).toHaveValue('100');
      await expect(page.getByTestId('input-codigo-postal')).toHaveValue('9420');
      await expect(page.locator('#foto-comercio-avatar img')).toBeVisible();
      await expect
        .poll(() => page.locator('#foto-comercio-avatar img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
        .toBe(true);
      await expect(page.getByTestId('texto-foto-cambiar')).toHaveText('Tocá para cambiarla');
      await expect(page.getByTestId('btn-switch-delivery')).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByTestId('btn-switch-retiro')).toHaveAttribute('aria-pressed', 'true');
      await capturar(page, 'corregir-paso1');

      const descripcionNueva = `Descripción corregida ${sufijoUnico()}`;
      await page.getByTestId('input-descripcion').fill(descripcionNueva);
      await page.getByTestId('btn-continuar').click();

      await expect(page.getByTestId('aviso-datos-legales')).toContainText(AVISO_LEGALES);
      await expect(page.getByTestId('input-cuit')).toHaveValue(/^\d{11}$/);
      await expect(page.getByTestId('input-razon-social')).toHaveValue(/Razon Social E2e/);
      await expect(page.getByTestId('select-tipo-sociedad')).toHaveValue('SRL');
      await expect(page.getByTestId('select-condicion-iva')).toHaveValue('RESPONSABLE_INSCRIPTO');
      await expect(page.getByTestId('input-fecha-inicio-actividades')).toHaveValue('2020-01-01');
      await expect(page.getByTestId('input-nombre-representante')).toHaveValue('Representante');
      await expect(page.getByTestId('input-apellido-representante')).toHaveValue('Playwright');
      await expect(page.getByTestId('input-fecha-nacimiento-representante')).toHaveValue('1985-03-15');
      await expect(page.getByTestId('input-telefono-representante')).toHaveValue(/^2964\d{6}$/);
      await capturar(page, 'corregir-legales');
      await page.getByTestId('btn-continuar-legales').click();

      await expect(page.getByTestId('fila-resumen-horario')).toHaveCount(1);
      await page.getByTestId('btn-continuar-horarios').click();

      await expect(page.getByTestId('fila-red-social')).toHaveCount(1);
      await expect(page.getByTestId('input-url-red-social')).toHaveValue(/instagram\.com\/comercio\.e2e\./);
      await capturar(page, 'corregir-redes');
      await page.getByTestId('btn-enviar-solicitud').click();

      await expect(page.getByTestId('pantalla-solicitud-recibida')).toBeVisible();
      await expect(page.getByTestId('pantalla-solicitud-recibida')).toContainText('Recibimos tu solicitud');
      await expect(page.getByTestId('pantalla-solicitud-recibida')).toContainText(
        `${dueno.nombre} está en revisión. El equipo de Bajoneá revisará tu solicitud y te notificaremos cuando tengamos una respuesta`,
      );
      await capturar(page, 'corregir-exito');
      await page.getByTestId('btn-volver-inicio-exito').click();
      await page.waitForURL('**/comercio-pendiente.html?id=*');
      expect(estadoDe(dueno.comercioId)).toBe('PENDIENTE');
      expect(cantidadResolicitudesDe(dueno.comercioId)).toBe(1);
      expect(camposDeLosCambios(dueno.comercioId)).toEqual(['DESCRIPCION']);

      const contextoAdmin = await browser.newContext({ viewport: VIEWPORT });
      const paginaAdmin = await contextoAdmin.newPage();
      await abrirComoAdmin(paginaAdmin);
      const metricas = await metricasDelAdmin(request, adminToken);
      await paginaAdmin.goto('/admin-dashboard.html');
      await expect(paginaAdmin.getByTestId('contador-resolicitudes-pendientes')).toHaveText(String(metricas.resolicitudesPendientes));
      await expect(paginaAdmin.getByTestId('btn-resolicitudes')).toContainText('Re-solicitudes');
      await expect(paginaAdmin.getByTestId('btn-resolicitudes')).toContainText('Comercios corregidos por su Dueño');
      await capturar(paginaAdmin, 'admin-dashboard');
      await paginaAdmin.getByTestId('btn-resolicitudes').click();
      await paginaAdmin.waitForURL('**/admin-resolicitudes.html');

      const item = paginaAdmin.getByTestId(`resolicitud-item-${dueno.comercioId}`);
      await expect(item).toBeVisible();
      await expect(item).toContainText(dueno.nombre);
      await expect(item).toContainText('Río Grande');
      await expect(item).toContainText('Re-solicitado');
      await expect(paginaAdmin.getByTestId(`badge-intento-${dueno.comercioId}`)).toHaveText('Intento 1 de 3');
      await capturar(paginaAdmin, 'admin-lista');
      await paginaAdmin.getByTestId(`btn-ver-resolicitud-${dueno.comercioId}`).click();
      await paginaAdmin.waitForURL(`**/admin-resolicitud-detalle.html?id=${dueno.comercioId}`);

      await expect(paginaAdmin.getByTestId('badge-intento')).toHaveText('Intento 1 de 3');
      await expect(paginaAdmin.getByTestId('motivo-rechazo-anterior')).toContainText('Motivo del rechazo anterior');
      await expect(paginaAdmin.getByTestId('motivo-rechazo-anterior')).toContainText(MOTIVO_RECHAZO);
      await expect(paginaAdmin.getByTestId('resumen-cambios')).toHaveText('1 campo cambió');
      await expect(paginaAdmin.getByTestId('cambio-DESCRIPCION')).toContainText('Descripción');
      await expect(paginaAdmin.getByTestId('cambio-antes-DESCRIPCION')).toHaveText(DESCRIPCION_ORIGINAL);
      await expect(paginaAdmin.getByTestId('cambio-ahora-DESCRIPCION')).toHaveText(descripcionNueva);
      await expect(paginaAdmin.locator('[data-testid^="cambio-"][data-testid$="NOMBRE"]')).toHaveCount(0);
      await expect(paginaAdmin.getByTestId('resumen-sin-cambios')).toHaveText('Sin cambios (20 campos)');
      await expect(paginaAdmin.getByTestId('sin-cambio-NOMBRE')).toBeHidden();
      await paginaAdmin.getByTestId('resumen-sin-cambios').click();
      await expect(paginaAdmin.getByTestId('sin-cambio-NOMBRE')).toContainText(dueno.nombre);
      await expect(paginaAdmin.getByTestId('sin-cambio-CUIT')).toBeVisible();
      await expect(paginaAdmin.getByTestId('sin-cambio-MODALIDADES')).toContainText('Solo retiro');
      await expect(paginaAdmin.getByTestId('sin-cambio-FECHA_INICIO_ACTIVIDADES')).toContainText('01/01/2020');
      await expect(paginaAdmin.getByTestId('sin-cambio-REPRESENTANTE_FECHA_NACIMIENTO')).toContainText('15/03/1985');
      await expect(paginaAdmin.getByTestId('sin-cambio-TIPO_SOCIEDAD')).toContainText('Sociedad de Responsabilidad Limitada (SRL)');
      await expect(paginaAdmin.getByTestId('sin-cambio-CONDICION_IVA')).toContainText('Responsable Inscripto');
      await expect(paginaAdmin.getByTestId('sin-cambio-HORARIOS')).toContainText('00:00-23:59');
      await expect(paginaAdmin.getByTestId('sin-cambio-REDES_SOCIALES')).toContainText('Instagram: https://instagram.com/comercio.e2e.');
      await expect(paginaAdmin.locator('[data-testid^="sin-cambio-"]')).toHaveCount(20);
      await expect(paginaAdmin.locator('[data-testid^="sin-cambio-"]', { hasText: 'undefined' })).toHaveCount(0);
      await capturar(paginaAdmin, 'admin-detalle');

      await paginaAdmin.getByTestId('btn-aprobar-comercio').click();
      await paginaAdmin.getByTestId('btn-confirmar-aprobacion').click();
      await paginaAdmin.waitForURL('**/admin-resolicitudes.html?comercioResuelto=1');
      await expect(paginaAdmin.getByText('El comercio fue notificado de tu decisión')).toBeVisible();
      await expect(paginaAdmin.getByTestId(`resolicitud-item-${dueno.comercioId}`)).toHaveCount(0);
      expect(estadoDe(dueno.comercioId)).toBe('APROBADO');
      await contextoAdmin.close();
    });

    test('cambios en todos los pasos: foto, nombre, legales, horarios y redes; el Administrador ve cada comparación', async ({ page, browser, request }) => {
      const dueno = await prepararRechazado(request, adminToken, localidadId);
      const nombreNuevo = `Nombre Corregido ${sufijoUnico()}`;
      const razonSocialNueva = `Razon Corregida ${sufijoUnico()}`;
      const cuitNuevo = generarCuit();
      const diaNuevo = diaDistintoDeHoy();
      const etiquetaDia: Record<string, string> = {
        LUNES: 'Lunes',
        MARTES: 'Martes',
        MIERCOLES: 'Miércoles',
        JUEVES: 'Jueves',
        VIERNES: 'Viernes',
        SABADO: 'Sábado',
        DOMINGO: 'Domingo',
      };
      const fotoAntes = sql(`SELECT foto_perfil_url FROM comercio WHERE id = ${dueno.comercioId};`);

      await abrirComoUsuario(page, dueno.sesion);
      await page.goto(`/comercio-corregir.html?id=${dueno.comercioId}`);
      await esperarFormularioCargado(page);

      await page.getByTestId('input-foto-comercio').setInputFiles({ name: nombreArchivoFixture(), mimeType: 'image/png', buffer: FIXTURE_BUFFER });
      await expect(page.getByTestId('modal-recorte-imagen')).toBeVisible();
      await esperarImagenCargadaEnRecorte(page);
      await page.getByTestId('btn-confirmar-recorte').click();
      await expect(page.getByTestId('modal-recorte-imagen')).toHaveCount(0);
      await page.getByTestId('input-nombre').fill(nombreNuevo);
      await page.getByTestId('btn-continuar').click();

      await page.getByTestId('input-razon-social').fill(razonSocialNueva);
      await page.getByTestId('input-cuit').fill(cuitNuevo);
      await page.getByTestId('btn-continuar-legales').click();

      await page.getByTestId('tab-horario-personalizado').click();
      await page.getByTestId('btn-agregar-horario').click();
      const filaNueva = page.getByTestId('fila-horario').last();
      await filaNueva.getByTestId('select-dia-horario').selectOption(diaNuevo);
      await filaNueva.getByTestId('input-apertura-horario').fill('10:00');
      await filaNueva.getByTestId('input-cierre-horario').fill('15:00');
      await page.getByTestId('btn-continuar-horarios').click();

      await page.getByTestId('btn-agregar-red-social').click();
      const filaRed = page.getByTestId('fila-red-social').last();
      await filaRed.getByTestId('select-tipo-red-social').selectOption('FACEBOOK');
      await filaRed.getByTestId('input-url-red-social').fill(`facebook.com/corregido.${sufijoUnico()}`);
      await page.getByTestId('btn-enviar-solicitud').click();

      await expect(page.getByTestId('pantalla-solicitud-recibida')).toBeVisible({ timeout: 45_000 });
      expect(estadoDe(dueno.comercioId)).toBe('PENDIENTE');
      const fotoDespues = sql(`SELECT foto_perfil_url FROM comercio WHERE id = ${dueno.comercioId};`);
      expect(fotoDespues).not.toBe(fotoAntes);
      expect(fotoDespues).toContain(`comercios/${dueno.comercioId}/perfil/`);
      expect(camposDeLosCambios(dueno.comercioId)).toEqual(['CUIT', 'FOTO_PERFIL', 'HORARIOS', 'NOMBRE', 'RAZON_SOCIAL', 'REDES_SOCIALES']);

      const contextoAdmin = await browser.newContext({ viewport: VIEWPORT });
      const paginaAdmin = await contextoAdmin.newPage();
      await abrirComoAdmin(paginaAdmin);
      await paginaAdmin.goto(`/admin-resolicitud-detalle.html?id=${dueno.comercioId}`);
      await expect(paginaAdmin.getByTestId('resumen-cambios')).toHaveText('6 campos cambiaron');
      await expect(paginaAdmin.getByTestId('cambio-FOTO_PERFIL')).toContainText('Foto del comercio');
      await expect(paginaAdmin.getByTestId('cambio-foto-antes')).toContainText('Antes');
      await expect(paginaAdmin.getByTestId('cambio-foto-ahora')).toContainText('Ahora');
      await expect(paginaAdmin.locator('[data-testid="cambio-foto-antes"] img')).toHaveAttribute('src', fotoAntes);
      await expect(paginaAdmin.locator('[data-testid="cambio-foto-ahora"] img')).toHaveAttribute('src', fotoDespues);
      await expect(paginaAdmin.getByTestId('cambio-ahora-NOMBRE')).toHaveText(aTitleCase(nombreNuevo));
      await expect(paginaAdmin.getByTestId('cambio-RAZON_SOCIAL')).toContainText('Razón social');
      await expect(paginaAdmin.getByTestId('cambio-ahora-CUIT')).toHaveText(cuitNuevo);
      await expect(paginaAdmin.getByTestId('cambio-CUIT')).toContainText('CUIT');
      await expect(paginaAdmin.getByTestId('cambio-ahora-HORARIOS')).toContainText(`${etiquetaDia[diaNuevo]} 10:00-15:00`);
      await expect(paginaAdmin.getByTestId('cambio-antes-HORARIOS')).not.toContainText(`${etiquetaDia[diaNuevo]} 10:00-15:00`);
      await expect(paginaAdmin.getByTestId('cambio-ahora-REDES_SOCIALES')).toContainText('Facebook: ');
      await expect(paginaAdmin.getByTestId('cambio-ahora-REDES_SOCIALES')).toContainText('Instagram: ');
      await expect(paginaAdmin.getByTestId('cambio-antes-REDES_SOCIALES')).not.toContainText('Facebook: ');
      await expect(paginaAdmin.getByTestId('resumen-sin-cambios')).toHaveText('Sin cambios (15 campos)');
      await capturar(paginaAdmin, 'admin-detalle-varios');
      await contextoAdmin.close();
    });

    test('el paso de datos legales no aparece para un comercio adicional; la corrección y el detalle omiten los datos fiscales', async ({ page, browser, request }) => {
      const base = await prepararAprobado(request, adminToken, localidadId);
      const clonId = await clonarConRedes(request, base.comercioId, `Adicional Rechazado ${sufijoUnico()}`, 'RECHAZADO');

      await abrirComoUsuario(page, base.sesion);
      await page.goto(`/comercio-corregir.html?id=${clonId}`);
      await esperarFormularioCargado(page);
      await expect(page.locator('#step-progress-labels span')).toHaveText(['1. Negocio', '2. Horarios', '3. Redes']);
      await expect(page.getByTestId('badge-intento')).toHaveText('Intento 1 de 3');
      await expect(page.getByTestId('motivo-rechazo-correccion')).toHaveCount(0);
      await expect(page.getByTestId('aviso-datos-legales')).toHaveCount(0);
      await expect(page.getByTestId('input-cuit')).toHaveCount(0);
      await capturar(page, 'corregir-adicional');

      await page.getByTestId('input-descripcion').fill(`Adicional corregido ${sufijoUnico()}`);
      await page.getByTestId('btn-continuar').click();
      await expect(page.getByTestId('btn-continuar-horarios')).toBeVisible();
      await page.getByTestId('btn-continuar-horarios').click();
      await page.getByTestId('btn-enviar-solicitud').click();
      await expect(page.getByTestId('pantalla-solicitud-recibida')).toBeVisible();
      expect(estadoDe(clonId)).toBe('PENDIENTE');
      expect(camposDeLosCambios(clonId)).toEqual(['DESCRIPCION']);

      const contextoAdmin = await browser.newContext({ viewport: VIEWPORT });
      const paginaAdmin = await contextoAdmin.newPage();
      await abrirComoAdmin(paginaAdmin);
      await paginaAdmin.goto(`/admin-resolicitud-detalle.html?id=${clonId}`);
      await expect(paginaAdmin.getByTestId('resumen-cambios')).toHaveText('1 campo cambió');
      await expect(paginaAdmin.getByTestId('motivo-rechazo-anterior')).toHaveCount(0);
      await expect(paginaAdmin.getByTestId('resumen-sin-cambios')).toHaveText('Sin cambios (9 campos)');
      await paginaAdmin.getByTestId('resumen-sin-cambios').click();
      await expect(paginaAdmin.getByTestId('sin-cambio-CUIT')).toHaveCount(0);
      await expect(paginaAdmin.getByTestId('sin-cambio-REPRESENTANTE_DNI')).toHaveCount(0);
      await expect(paginaAdmin.getByTestId('sin-cambio-NOMBRE')).toBeVisible();
      await contextoAdmin.close();
    });
  });

  test.describe('errores y salidas de la corrección', () => {
    test('un reenvío sin ningún cambio muestra el banner del backend y no gasta un intento', async ({ page, request }) => {
      const dueno = await prepararRechazado(request, adminToken, localidadId);
      await abrirComoUsuario(page, dueno.sesion);
      await page.goto(`/comercio-corregir.html?id=${dueno.comercioId}`);
      await esperarFormularioCargado(page);

      await recorrerHastaEnviar(page, { conLegales: true });

      await expect(page.getByTestId('mensaje-banner')).toContainText(MENSAJE_SIN_CAMBIOS);
      await expect(page.getByTestId('btn-enviar-solicitud')).toBeEnabled();
      await expect(page.getByTestId('pantalla-solicitud-recibida')).toBeHidden();
      expect(estadoDe(dueno.comercioId)).toBe('RECHAZADO');
      expect(cantidadResolicitudesDe(dueno.comercioId)).toBe(0);
      await capturar(page, 'corregir-sin-cambios');
    });

    test('una pestaña vieja con la versión desactualizada recibe el 409 y "Recargar los datos" vuelve a pedir la corrección', async ({ page, request }) => {
      const dueno = await prepararRechazado(request, adminToken, localidadId, 'Primer rechazo');
      await abrirComoUsuario(page, dueno.sesion);
      await page.goto(`/comercio-corregir.html?id=${dueno.comercioId}`);
      await esperarFormularioCargado(page);
      await expect(page.getByTestId('badge-intento')).toHaveText('Intento 1 de 3');

      await reenviarConCambioSimple(request, dueno, 'Reenvío hecho desde otra pestaña');
      await resolverComercio(request, adminToken, dueno.comercioId, false, 'Segundo rechazo');

      await page.getByTestId('input-descripcion').fill(`Descripción de la pestaña vieja ${sufijoUnico()}`);
      await recorrerHastaEnviar(page, { conLegales: true });

      await expect(page.getByTestId('mensaje-banner')).toContainText('La solicitud cambió desde que abriste la corrección');
      await expect(page.getByTestId('btn-recargar-datos')).toBeVisible();
      expect(cantidadResolicitudesDe(dueno.comercioId)).toBe(1);
      await capturar(page, 'corregir-409-version');

      await page.getByTestId('btn-recargar-datos').click();
      await esperarFormularioCargado(page);
      await expect(page.getByTestId('badge-intento')).toHaveText('Intento 2 de 3');
      await expect(page.getByTestId('motivo-rechazo-correccion')).toContainText('Segundo rechazo');
      await expect(page.getByTestId('input-descripcion')).toHaveValue('Reenvío hecho desde otra pestaña');
    });

    test('una pestaña vieja cuyo comercio ya fue reenviado recibe el aviso de que ya está en revisión y no gasta otro intento', async ({ page, request }) => {
      const dueno = await prepararRechazado(request, adminToken, localidadId);
      await abrirComoUsuario(page, dueno.sesion);
      await page.goto(`/comercio-corregir.html?id=${dueno.comercioId}`);
      await esperarFormularioCargado(page);

      await reenviarConCambioSimple(request, dueno, 'Reenviado desde otra pestaña');

      await page.getByTestId('input-descripcion').fill(`Otro cambio ${sufijoUnico()}`);
      await recorrerHastaEnviar(page, { conLegales: true });

      await expect(page.getByTestId('mensaje-banner')).toContainText('Este comercio ya fue enviado nuevamente a revisión');
      await expect(page.getByTestId('btn-recargar-datos')).toHaveCount(0);
      expect(cantidadResolicitudesDe(dueno.comercioId)).toBe(1);
      expect(estadoDe(dueno.comercioId)).toBe('PENDIENTE');
    });

    test('un error de validación del backend se marca en el campo y vuelve al paso que corresponde', async ({ page, request }) => {
      const dueno = await prepararRechazado(request, adminToken, localidadId);
      await abrirComoUsuario(page, dueno.sesion);
      await page.goto(`/comercio-corregir.html?id=${dueno.comercioId}`);
      await esperarFormularioCargado(page);

      await page.route('**/api/v1/comercios/*/resolicitud', async (route) => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ mensaje: 'Datos inválidos', data: { 'legales.razonSocial': 'La razón social es obligatoria' } }),
        });
      });
      await page.getByTestId('input-descripcion').fill(`Validación ${sufijoUnico()}`);
      await recorrerHastaEnviar(page, { conLegales: true });

      await expect(page.getByTestId('mensaje-error-razon-social')).toContainText('La razón social es obligatoria');
      await expect(page.getByTestId('input-razon-social')).toBeVisible();
      await expect(page.getByTestId('mensaje-banner')).toContainText('Revisá los campos marcados.');
    });

    test('la flecha atrás vuelve de un paso al anterior; con cambios pide confirmar la salida y sin cambios sale directo', async ({ page, request }) => {
      const dueno = await prepararRechazado(request, adminToken, localidadId);
      await abrirComoUsuario(page, dueno.sesion);
      await page.goto(`/comercio-corregir.html?id=${dueno.comercioId}`);
      await esperarFormularioCargado(page);

      await page.getByTestId('btn-continuar').click();
      await expect(page.getByTestId('btn-continuar-legales')).toBeVisible();
      await page.getByTestId('btn-volver').click();
      await expect(page.getByTestId('btn-continuar')).toBeVisible();
      await expect(page.getByTestId('modal-confirmar-salida')).toHaveCount(0);

      await page.getByTestId('btn-volver').click();
      await page.waitForURL('**/comercio-rechazado.html?id=*');

      await page.goto(`/comercio-corregir.html?id=${dueno.comercioId}`);
      await esperarFormularioCargado(page);
      const textoEditado = `Texto sin enviar ${sufijoUnico()}`;
      await page.getByTestId('input-descripcion').fill(textoEditado);
      await page.getByTestId('btn-volver').click();
      await expect(page.getByTestId('modal-confirmar-salida')).toBeVisible();
      await expect(page.getByTestId('modal-confirmar-salida')).toContainText('¿Salir?');
      await expect(page.getByTestId('modal-confirmar-salida')).toContainText('Vas a perder lo que cambiaste');
      await expect(page.getByTestId('btn-seguir-editando')).toHaveText('Seguir editando');
      await capturar(page, 'corregir-confirmar-salida');
      await page.getByTestId('btn-seguir-editando').click();
      await expect(page.getByTestId('modal-confirmar-salida')).toHaveCount(0);
      await expect(page.getByTestId('input-descripcion')).toHaveValue(textoEditado);
      expect(page.url()).toContain('comercio-corregir.html');

      await page.getByTestId('btn-volver').click();
      await page.getByTestId('btn-confirmar-salida').click();
      await page.waitForURL('**/comercio-rechazado.html?id=*');
      expect(estadoDe(dueno.comercioId)).toBe('RECHAZADO');
    });
  });

  test.describe('rechazo repetido y rechazo definitivo', () => {
    test('rechazos comunes hasta el último intento: el modal avisa y bloquea el interruptor, y el resultado es la pantalla de rechazo definitivo', async ({
      page,
      browser,
      request,
    }) => {
      const dueno = await prepararRechazado(request, adminToken, localidadId, 'Rechazo inicial');
      const contextoAdmin = await browser.newContext({ viewport: VIEWPORT });
      const paginaAdmin = await contextoAdmin.newPage();
      await abrirComoAdmin(paginaAdmin);
      await abrirComoUsuario(page, dueno.sesion);

      await reenviarConCambioSimple(request, dueno, 'Corrección número 1');
      await paginaAdmin.goto(`/admin-resolicitud-detalle.html?id=${dueno.comercioId}`);
      await paginaAdmin.getByTestId('btn-rechazar-comercio').click();
      await expect(paginaAdmin.getByTestId('modal-rechazar-comercio')).toBeVisible();
      await expect(paginaAdmin.getByTestId('modal-rechazar-comercio')).toContainText('Rechazar solicitud');
      await expect(paginaAdmin.getByTestId('nombre-comercio-rechazo')).toHaveText(dueno.nombre);
      await expect(paginaAdmin.getByTestId('aviso-ultimo-intento')).toBeHidden();
      await expect(paginaAdmin.getByTestId('switch-rechazo-definitivo')).toBeEnabled();
      await expect(paginaAdmin.getByTestId('switch-rechazo-definitivo')).toHaveAttribute('aria-pressed', 'false');
      await expect(paginaAdmin.getByTestId('ayuda-rechazo-definitivo')).toHaveText('El Dueño no podrá volver a solicitar este comercio.');
      await expect(paginaAdmin.getByTestId('btn-confirmar-rechazo-comercio')).toHaveText('Confirmar Rechazo');
      await paginaAdmin.getByTestId('input-motivo-rechazo-comercio').fill('Rechazo número 1');
      await paginaAdmin.getByTestId('btn-confirmar-rechazo-comercio').click();
      await paginaAdmin.waitForURL('**/admin-resolicitudes.html?comercioResuelto=1');
      expect(estadoDe(dueno.comercioId)).toBe('RECHAZADO');

      await page.goto('/comercio-rechazado.html');
      await expect(page.getByTestId('motivo-rechazo-comercio')).toContainText('Rechazo número 1');
      await expect(page.getByTestId('texto-correccion')).toHaveText('Podés corregir los datos y volver a solicitarla. Te quedan 2 intentos.');

      await reenviarConCambioSimple(request, dueno, 'Corrección número 2');
      await rechazarComoAdminDesdeLista(paginaAdmin, dueno.comercioId, 'Rechazo número 2');
      expect(estadoDe(dueno.comercioId)).toBe('RECHAZADO');
      await page.goto('/comercio-rechazado.html');
      await expect(page.getByTestId('texto-correccion')).toHaveText('Podés corregir los datos y volver a solicitarla. Te queda 1 intento.');
      await capturar(page, 'rechazado-ultimo-intento');

      await reenviarConCambioSimple(request, dueno, 'Corrección número 3');
      await paginaAdmin.goto('/admin-resolicitudes.html');
      await expect(paginaAdmin.getByTestId(`badge-intento-${dueno.comercioId}`)).toHaveText('Intento 3 de 3');
      await expect(paginaAdmin.getByTestId(`badge-ultimo-intento-${dueno.comercioId}`)).toBeVisible();
      await paginaAdmin.getByTestId(`btn-ver-resolicitud-${dueno.comercioId}`).click();
      await paginaAdmin.getByTestId('btn-rechazar-comercio').click();
      await expect(paginaAdmin.getByTestId('aviso-ultimo-intento')).toContainText('Esta es la última re-solicitud: el rechazo será definitivo.');
      await expect(paginaAdmin.getByTestId('switch-rechazo-definitivo')).toBeDisabled();
      await expect(paginaAdmin.getByTestId('switch-rechazo-definitivo')).toHaveAttribute('aria-pressed', 'true');
      await expect(paginaAdmin.getByTestId('ayuda-rechazo-definitivo')).toHaveText('Bloqueado: este intento ya es el último.');
      await expect(paginaAdmin.getByTestId('btn-confirmar-rechazo-comercio')).toHaveText('Rechazar definitivamente');
      await capturar(paginaAdmin, 'admin-modal-ultimo-intento');
      await paginaAdmin.getByTestId('input-motivo-rechazo-comercio').fill('Rechazo número 3');
      await paginaAdmin.getByTestId('btn-confirmar-rechazo-comercio').click();
      await paginaAdmin.waitForURL('**/admin-resolicitudes.html?comercioResuelto=1');
      expect(estadoDe(dueno.comercioId)).toBe('RECHAZO_DEFINITIVO');
      await contextoAdmin.close();

      const contextoDueno = await browser.newContext({ viewport: VIEWPORT });
      const paginaDueno = await contextoDueno.newPage();
      await loginUi(paginaDueno, dueno.nombreUsuario, dueno.password);
      await paginaDueno.waitForURL('**/comercio-rechazo-definitivo.html?id=*');
      await expect(paginaDueno.getByRole('heading', { name: 'Rechazo definitivo' })).toBeVisible();
      await expect(paginaDueno.getByTestId('motivo-rechazo-comercio')).toContainText('Rechazo número 3');
      await expect(paginaDueno.getByTestId('texto-rechazo-definitivo')).toHaveText(TEXTO_DEFINITIVO);
      await expect(paginaDueno.getByTestId('btn-agregar-comercio-nuevo')).toBeVisible();
      await expect(paginaDueno.getByTestId('btn-contactar-soporte')).toBeHidden();
      await expect(paginaDueno.getByTestId('btn-cerrar-sesion')).toBeVisible();
      await capturar(paginaDueno, 'rechazo-definitivo');
      await paginaDueno.getByTestId('btn-agregar-comercio-nuevo').click();
      await paginaDueno.waitForURL('**/agregar-comercio.html');
      await expect(paginaDueno.getByTestId('input-nombre')).toBeVisible();

      await paginaDueno.goto('/comercio-dashboard.html');
      await paginaDueno.waitForURL('**/comercio-rechazo-definitivo.html?id=*');
      await paginaDueno.goto('/comercio-rechazado.html');
      await paginaDueno.waitForURL('**/comercio-rechazo-definitivo.html?id=*');
      await paginaDueno.goto(`/comercio-corregir.html?id=${dueno.comercioId}`);
      await paginaDueno.waitForURL('**/comercio-rechazo-definitivo.html?id=*');
      await contextoDueno.close();
    });

    test('rechazo definitivo marcado con el interruptor en una solicitud nueva: modal con el nombre y botón de peligro', async ({ page, browser, request }) => {
      const dueno = await registrarPendiente(request, adminToken, localidadId);
      const contextoAdmin = await browser.newContext({ viewport: VIEWPORT });
      const paginaAdmin = await contextoAdmin.newPage();
      await abrirComoAdmin(paginaAdmin);

      await paginaAdmin.goto(`/admin-comercio-detalle.html?id=${dueno.comercioId}`);
      await paginaAdmin.getByTestId('btn-rechazar-comercio').click();
      await expect(paginaAdmin.getByTestId('nombre-comercio-rechazo')).toHaveText(dueno.nombre);
      await expect(paginaAdmin.getByTestId('aviso-ultimo-intento')).toBeHidden();
      await expect(paginaAdmin.getByTestId('btn-confirmar-rechazo-comercio')).toHaveText('Confirmar Rechazo');
      await paginaAdmin.getByTestId('input-motivo-rechazo-comercio').fill('Documentación inválida');
      await paginaAdmin.getByTestId('switch-rechazo-definitivo').click();
      await expect(paginaAdmin.getByTestId('switch-rechazo-definitivo')).toHaveAttribute('aria-pressed', 'true');
      await expect(paginaAdmin.getByTestId('btn-confirmar-rechazo-comercio')).toHaveText('Rechazar definitivamente');
      await expect(paginaAdmin.getByTestId('btn-confirmar-rechazo-comercio')).toHaveClass(/btn-peligro/);
      await capturar(paginaAdmin, 'admin-modal-definitivo');

      await paginaAdmin.getByTestId('switch-rechazo-definitivo').click();
      await expect(paginaAdmin.getByTestId('btn-confirmar-rechazo-comercio')).toHaveText('Confirmar Rechazo');
      await paginaAdmin.getByTestId('switch-rechazo-definitivo').click();

      await paginaAdmin.getByTestId('btn-confirmar-rechazo-comercio').click();
      await paginaAdmin.waitForURL('**/admin-comercios-pendientes.html?comercioResuelto=1');
      expect(estadoDe(dueno.comercioId)).toBe('RECHAZO_DEFINITIVO');
      expect(sql(`SELECT motivo FROM historial_estado_comercio WHERE comercio_id = ${dueno.comercioId} AND estado_destino = 'RECHAZO_DEFINITIVO';`)).toBe(
        'Documentación inválida',
      );
      await contextoAdmin.close();

      await loginUi(page, dueno.nombreUsuario, dueno.password);
      await page.waitForURL('**/comercio-rechazo-definitivo.html?id=*');
      await expect(page.getByTestId('motivo-rechazo-comercio')).toContainText('Documentación inválida');
    });

    test('un rechazo común de una solicitud nueva deja el comercio corregible', async ({ page, browser, request }) => {
      const dueno = await registrarPendiente(request, adminToken, localidadId);
      const contextoAdmin = await browser.newContext({ viewport: VIEWPORT });
      const paginaAdmin = await contextoAdmin.newPage();
      await abrirComoAdmin(paginaAdmin);

      await paginaAdmin.goto(`/admin-comercio-detalle.html?id=${dueno.comercioId}`);
      await paginaAdmin.getByTestId('btn-rechazar-comercio').click();
      await paginaAdmin.getByTestId('input-motivo-rechazo-comercio').fill('Foto borrosa');
      await paginaAdmin.getByTestId('btn-confirmar-rechazo-comercio').click();
      await paginaAdmin.waitForURL('**/admin-comercios-pendientes.html?comercioResuelto=1');
      expect(estadoDe(dueno.comercioId)).toBe('RECHAZADO');
      await contextoAdmin.close();

      await loginUi(page, dueno.nombreUsuario, dueno.password);
      await page.waitForURL('**/comercio-rechazado.html?id=*');
      await expect(page.getByTestId('texto-correccion')).toHaveText('Podés corregir los datos y volver a solicitarla. Te quedan 3 intentos.');
    });

    test('si el Dueño no es elegible para agregar otro comercio, la pantalla de rechazo definitivo no ofrece el botón', async ({ page, request }) => {
      const dueno = await prepararRechazado(request, adminToken, localidadId);
      sql(`UPDATE comercio SET estado = 'RECHAZO_DEFINITIVO', cantidad_resolicitudes = 3 WHERE id = ${dueno.comercioId};`);
      await page.route('**/api/v1/comercios/alta-adicional/elegibilidad', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mensaje: 'OK', data: { elegible: false } }) });
      });
      await abrirComoUsuario(page, dueno.sesion);
      await page.goto('/comercio-rechazo-definitivo.html');
      await expect(page.getByRole('heading', { name: 'Rechazo definitivo' })).toBeVisible();
      await expect(page.getByTestId('btn-agregar-comercio-nuevo')).toBeHidden();
      await expect(page.getByTestId('btn-cerrar-sesion')).toBeVisible();
    });

    test('el Administrador ve la etiqueta "Rechazo definitivo" de un comercio hermano de una solicitud adicional', async ({ browser, request }) => {
      const aprobado = await prepararAprobado(request, adminToken, localidadId);
      const clonDefinitivo = await clonarConRedes(request, aprobado.comercioId, `Definitivo Otro ${sufijoUnico()}`, 'RECHAZO_DEFINITIVO');
      const fotoNueva = await subirFotoNuevoComercio(request, aprobado.token);
      const adicional = await registrarComercioAdicional(request, aprobado.token, localidadId, { fotoPerfilUrl: fotoNueva });
      expect(adicional.status).toBe(201);

      const contextoAdmin = await browser.newContext({ viewport: VIEWPORT });
      const paginaAdmin = await contextoAdmin.newPage();
      await abrirComoAdmin(paginaAdmin);
      await paginaAdmin.goto(`/admin-comercio-detalle.html?id=${adicional.body.data.id}`);
      await expect(paginaAdmin.getByTestId(`estado-otro-comercio-${clonDefinitivo}`)).toHaveText('Rechazo definitivo');
      await contextoAdmin.close();
    });
  });

  test.describe('bandejas del Administrador', () => {
    test('la tarjeta de Re-solicitudes cuenta solo re-solicitudes y la de pendientes solo solicitudes nuevas; cada lista muestra lo suyo', async ({
      browser,
      request,
    }) => {
      const nuevo = await registrarPendiente(request, adminToken, localidadId);
      const corregido = await prepararRechazado(request, adminToken, localidadId);
      await reenviarConCambioSimple(request, corregido, `Corregido ${sufijoUnico()}`);
      const metricas = await metricasDelAdmin(request, adminToken);

      const contextoAdmin = await browser.newContext({ viewport: VIEWPORT });
      const pagina = await contextoAdmin.newPage();
      await abrirComoAdmin(pagina);
      await pagina.goto('/admin-dashboard.html');
      await expect(pagina.getByTestId('contador-resolicitudes-pendientes')).toHaveText(String(metricas.resolicitudesPendientes));
      await expect(pagina.getByTestId('btn-comercios-pendientes')).toContainText(
        metricas.comerciosPendientes === 1 ? '1 solicitud de aprobación' : `${metricas.comerciosPendientes} solicitudes de aprobación`,
      );
      await expect(pagina.getByTestId('btn-comercios-pendientes')).toContainText('Comercios Pendientes');

      await pagina.goto('/admin-comercios-pendientes.html');
      await expect(pagina.getByTestId(`comercio-pendiente-item-${nuevo.comercioId}`)).toBeVisible();
      await expect(pagina.getByTestId(`comercio-pendiente-item-${corregido.comercioId}`)).toHaveCount(0);
      await expect(pagina.getByTestId('contador-pendientes')).toHaveText(String(metricas.comerciosPendientes));

      await pagina.goto('/admin-resolicitudes.html');
      await expect(pagina.getByTestId(`resolicitud-item-${corregido.comercioId}`)).toBeVisible();
      await expect(pagina.getByTestId(`resolicitud-item-${nuevo.comercioId}`)).toHaveCount(0);
      await expect(pagina.getByTestId('contador-resolicitudes')).toHaveText(String(metricas.resolicitudesPendientes));
      await contextoAdmin.close();
    });

    test('el detalle de una re-solicitud que ya no existe o un id inválido muestra el estado vacío con enlace a la lista', async ({ browser }) => {
      const contextoAdmin = await browser.newContext({ viewport: VIEWPORT });
      const pagina = await contextoAdmin.newPage();
      await abrirComoAdmin(pagina);
      await pagina.goto('/admin-resolicitud-detalle.html?id=999999999');
      await expect(pagina.getByRole('heading', { name: 'No encontramos esta re-solicitud' })).toBeVisible();
      await expect(pagina.getByTestId('btn-ver-resolicitudes')).toBeVisible();
      await pagina.goto('/admin-resolicitud-detalle.html');
      await expect(pagina.getByRole('heading', { name: 'No encontramos esta re-solicitud' })).toBeVisible();
      await contextoAdmin.close();
    });

    test('sin re-solicitudes pendientes la lista muestra un mensaje en lugar de tarjetas', async ({ browser, request }) => {
      const contextoAdmin = await browser.newContext({ viewport: VIEWPORT });
      const pagina = await contextoAdmin.newPage();
      await abrirComoAdmin(pagina);
      const pendientes = await apiConHeaders(request, 'GET', '/administrador/comercios/resolicitudes', adminToken);
      for (const resolicitud of pendientes.body.data as any[]) {
        await resolverComercio(request, adminToken, resolicitud.comercio.id, false, 'Limpieza de la bandeja de la prueba', true);
      }
      await pagina.goto('/admin-resolicitudes.html');
      await expect(pagina.getByRole('heading', { name: 'No hay re-solicitudes pendientes' })).toBeVisible();
      await expect(pagina.getByTestId('contador-resolicitudes')).toBeHidden();
      await contextoAdmin.close();
    });
  });

  test.describe('maquetación', () => {
    async function verificarMaquetacion(page: Page, pantalla: string) {
      const medidas = await page.evaluate(() => ({
        desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        iconosGrandes: Array.from(document.querySelectorAll('svg'))
          .filter((svg) => svg.getBoundingClientRect().width > 72 || svg.getBoundingClientRect().height > 72)
          .map((svg) => `${svg.getBoundingClientRect().width}x${svg.getBoundingClientRect().height}`),
        iconosVacios: Array.from(document.querySelectorAll('svg'))
          .filter((svg) => svg.getBoundingClientRect().width === 0 && svg.getClientRects().length > 0)
          .length,
      }));
      expect(medidas.desborde, `desborde horizontal en ${pantalla}`).toBeLessThanOrEqual(0);
      expect(medidas.iconosGrandes, `íconos sin tamaño en ${pantalla}`).toEqual([]);
      expect(medidas.iconosVacios, `íconos colapsados en ${pantalla}`).toBe(0);
    }

    test('las pantallas nuevas no desbordan horizontalmente ni tienen íconos sin tamaño', async ({ page, browser, request }) => {
      const dueno = await prepararRechazado(request, adminToken, localidadId, 'Motivo largo '.repeat(20));
      await abrirComoUsuario(page, dueno.sesion);
      await page.goto('/comercio-rechazado.html');
      await expect(page.getByTestId('texto-correccion')).toBeVisible();
      await verificarMaquetacion(page, 'comercio-rechazado');

      await page.goto(`/comercio-corregir.html?id=${dueno.comercioId}`);
      await esperarFormularioCargado(page);
      await verificarMaquetacion(page, 'comercio-corregir, paso Negocio');
      await page.getByTestId('btn-continuar').click();
      await expect(page.getByTestId('btn-continuar-legales')).toBeVisible();
      await verificarMaquetacion(page, 'comercio-corregir, paso Legales');
      await page.getByTestId('btn-continuar-legales').click();
      await verificarMaquetacion(page, 'comercio-corregir, paso Horarios');
      await page.getByTestId('btn-continuar-horarios').click();
      await verificarMaquetacion(page, 'comercio-corregir, paso Redes');
      await page.getByTestId('btn-volver').click();
      await page.getByTestId('btn-volver').click();
      await page.getByTestId('btn-volver').click();
      await page.getByTestId('input-descripcion').fill('Descripción que fuerza el modal de salida');
      await page.getByTestId('btn-volver').click();
      await expect(page.getByTestId('modal-confirmar-salida')).toBeVisible();
      await verificarMaquetacion(page, 'comercio-corregir, modal de salida');

      const definitivo = await prepararRechazado(request, adminToken, localidadId, 'Motivo largo '.repeat(20));
      sql(`UPDATE comercio SET estado = 'RECHAZO_DEFINITIVO', cantidad_resolicitudes = 3 WHERE id = ${definitivo.comercioId};`);
      const contextoDueno = await browser.newContext({ viewport: VIEWPORT });
      const paginaDueno = await contextoDueno.newPage();
      await abrirComoUsuario(paginaDueno, definitivo.sesion);
      await paginaDueno.goto('/comercio-rechazo-definitivo.html');
      await expect(paginaDueno.getByTestId('texto-rechazo-definitivo')).toBeVisible();
      await verificarMaquetacion(paginaDueno, 'comercio-rechazo-definitivo');
      await contextoDueno.close();

      await reenviarConCambioSimple(request, dueno, 'Descripción corregida para la maquetación');
      const contextoAdmin = await browser.newContext({ viewport: VIEWPORT });
      const paginaAdmin = await contextoAdmin.newPage();
      await abrirComoAdmin(paginaAdmin);
      await paginaAdmin.goto('/admin-dashboard.html');
      await expect(paginaAdmin.getByTestId('contador-resolicitudes-pendientes')).toBeVisible();
      await verificarMaquetacion(paginaAdmin, 'admin-dashboard');
      await paginaAdmin.goto('/admin-resolicitudes.html');
      await expect(paginaAdmin.getByTestId(`resolicitud-item-${dueno.comercioId}`)).toBeVisible();
      await verificarMaquetacion(paginaAdmin, 'admin-resolicitudes');
      await paginaAdmin.getByTestId(`btn-ver-resolicitud-${dueno.comercioId}`).click();
      await expect(paginaAdmin.getByTestId('resumen-cambios')).toBeVisible();
      await paginaAdmin.getByTestId('resumen-sin-cambios').click();
      await verificarMaquetacion(paginaAdmin, 'admin-resolicitud-detalle');
      await paginaAdmin.getByTestId('btn-rechazar-comercio').click();
      await paginaAdmin.getByTestId('switch-rechazo-definitivo').click();
      await verificarMaquetacion(paginaAdmin, 'admin-resolicitud-detalle, modal de rechazo');
      await contextoAdmin.close();
    });
  });

  test.describe('recorte de imagen', () => {
    test('el botón Confirmar queda deshabilitado hasta que la imagen carga', async ({ page }) => {
      await page.route('**/assets/imagen-lenta-e2e.png', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.fulfill({ status: 200, contentType: 'image/png', body: FIXTURE_BUFFER });
      });
      await page.goto('/login.html');
      await page.evaluate(async () => {
        const { abrirEditorRecorte } = await import('/js/crop.js');
        abrirEditorRecorte({ origen: { url: '/assets/imagen-lenta-e2e.png' }, aspectRatio: 1, onConfirmar: () => {} });
      });
      await expect(page.getByTestId('modal-recorte-imagen')).toBeVisible();
      await expect(page.getByTestId('btn-confirmar-recorte')).toBeDisabled();
      await expect(page.getByTestId('btn-confirmar-recorte')).toBeEnabled({ timeout: 10_000 });
    });
  });
});
