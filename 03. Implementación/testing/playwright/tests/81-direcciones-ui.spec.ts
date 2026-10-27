import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  agregarItemCarrito,
  apiConHeaders,
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  confirmarPagoTest,
  crearCategoria,
  crearProducto,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { ClienteRegistrado, HorarioInput, SesionApi } from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { prepararAprobado } from './helpers/multicomercio';
import { abrirComoUsuarioConContexto, sumarAlEquipo } from './helpers/empleado';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const BASE = '/clientes/direcciones';
const LAGUNA_ESCONDIDA = '94015010';
const CARPETA_CAPTURAS = path.resolve(__dirname, '../../../docs/capturas-direcciones');
const MENSAJE_CUPO = 'Llegaste al máximo de 5 direcciones. Podés eliminar alguna para agregar otra.';
const todoElDia = (): HorarioInput[] => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];

interface Cuenta {
  registro: ClienteRegistrado;
  id: number;
  sesion: SesionApi;
}

async function captura(page: Page, nombre: string, paginaCompleta = false) {
  fs.mkdirSync(CARPETA_CAPTURAS, { recursive: true });
  await page.screenshot({ path: path.join(CARPETA_CAPTURAS, `${nombre}.png`), fullPage: paginaCompleta });
}

test.describe('Fase 3 (UI): direcciones múltiples del Cliente, entrega B', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;
  let productoId: number;

  async function nuevaCuenta(request: APIRequestContext): Promise<Cuenta> {
    const registro = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, registro.nombreUsuario, registro.password);
    return { registro, id: sesion.usuario.id, sesion };
  }

  const direccionesDe = async (request: APIRequestContext, cuenta: Cuenta) => {
    const respuesta = await apiGet(request, BASE, cuenta.sesion.token);
    expect(respuesta.status).toBe(200);
    return respuesta.body.data as any[];
  };

  const agregarPorApi = async (request: APIRequestContext, cuenta: Cuenta, calle: string, extra: Record<string, unknown> = {}) => {
    const respuesta = await apiPost(
      request,
      BASE,
      { calle, numero: '100', codigoPostal: '9420', localidadId, ...extra },
      cuenta.sesion.token,
    );
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
    return respuesta.body.data.id as number;
  };

  const predeterminadaDe = (cuenta: Cuenta): number =>
    Number(sql(`SELECT id FROM direccion WHERE cliente_id = ${cuenta.id} AND eliminada = 0 AND principal = 1;`));

  async function abrirComoCliente(page: Page, cuenta: Cuenta) {
    await abrirComoUsuarioConContexto(page, cuenta.sesion, { contexto: { tipo: 'CLIENTE' } });
  }

  async function abrirMisDirecciones(page: Page, cuenta: Cuenta) {
    await abrirComoCliente(page, cuenta);
    await page.goto('/perfil.html?vista=direcciones');
    await expect(page.getByTestId('lista-direcciones')).toBeVisible();
  }

  async function llenarFormulario(page: Page, datos: { calle: string; numero?: string; piso?: string; cp?: string; nombre?: string; referencia?: string }) {
    await page.getByTestId('input-direccion-calle').fill(datos.calle);
    await page.getByTestId('input-direccion-numero').fill(datos.numero ?? '100');
    if (datos.piso !== undefined) await page.getByTestId('input-direccion-piso-depto').fill(datos.piso);
    await page.getByTestId('input-direccion-codigo-postal').fill(datos.cp ?? '9420');
    await page.getByTestId('select-direccion-localidad').selectOption(localidadId);
    if (datos.nombre !== undefined) await page.getByTestId('input-direccion-nombre').fill(datos.nombre);
    if (datos.referencia !== undefined) await page.getByTestId('input-direccion-referencia').fill(datos.referencia);
  }

  async function abrirCheckoutEnPasoDeEntrega(page: Page, cuenta: Cuenta, request: APIRequestContext) {
    await apiConHeaders(request, 'DELETE', '/carrito', cuenta.sesion.token);
    await agregarItemCarrito(request, cuenta.sesion.token, productoId, 1);
    await abrirComoCliente(page, cuenta);
    await page.goto('/checkout.html');
    await page.getByTestId('btn-modalidad-domicilio').click();
    await page.getByTestId('btn-continuar-modalidad').click();
    await expect(page.getByTestId('radiogroup-direcciones')).toBeVisible();
  }

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat Dir UI ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminToken, localidadId, true, todoElDia());
    sql(`UPDATE comercio SET acepta_delivery = 1, acepta_retiro = 1 WHERE id = ${dueno.comercioId};`);
    productoId = await crearProducto(request, dueno.token, { nombre: `Producto Dir UI ${sufijoUnico()}`, precio: 10000, categoriaId });
  });

  test('perfil: la fila "Mis direcciones (1)" abre la lista con la predeterminada, y con una sola dirección no se puede eliminar', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    const [unica] = await direccionesDe(request, cuenta);
    await abrirComoCliente(page, cuenta);
    await page.goto('/perfil.html');

    const fila = page.getByTestId('btn-mis-direcciones');
    await expect(fila).toBeEnabled();
    await expect(fila).toContainText('Mis direcciones (1)');
    await captura(page, '00-perfil-fila-mis-direcciones', true);
    await fila.click();

    const lista = page.getByTestId('lista-direcciones');
    await expect(lista).toBeVisible();
    await expect(lista.getByRole('radio')).toHaveCount(1);
    await expect(page.getByTestId(`chip-predeterminada-${unica.id}`)).toHaveText('Predeterminada');
    await expect(page.getByTestId(`radio-direccion-${unica.id}`)).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId(`titulo-direccion-${unica.id}`)).toHaveText('Calle Siempre Viva 123');
    await expect(page.getByTestId(`localidad-direccion-${unica.id}`)).toContainText('CP 9420');
    await expect(page.getByTestId('btn-agregar-direccion')).toBeEnabled();
    await expect(page.getByTestId('aviso-cupo-direcciones')).toHaveCount(0);
    await sinScrollHorizontal(page);
    await captura(page, '01-lista-1-direccion', true);

    await page.getByTestId(`btn-menu-direccion-${unica.id}`).click();
    await expect(page.getByTestId('btn-editar-direccion')).toBeEnabled();
    await expect(page.getByTestId('btn-eliminar-direccion')).toBeDisabled();
    await expect(page.getByTestId('texto-unica-direccion')).toHaveText('Es tu única dirección');
    await captura(page, '02-menu-unica-direccion');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('menu-direccion')).toHaveCount(0);
    await expect(page.getByTestId(`btn-menu-direccion-${unica.id}`)).toBeFocused();
  });

  test('alta: valida en pantalla, con errores del servidor por campo, y la nueva dirección no cambia la predeterminada', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    const [inicial] = await direccionesDe(request, cuenta);
    await abrirMisDirecciones(page, cuenta);

    await page.getByTestId('btn-agregar-direccion').click();
    const pantalla = page.getByTestId('pantalla-direccion-form');
    await expect(pantalla).toBeVisible();
    await expect(page.getByTestId('titulo-direccion-form')).toHaveText('Agregar dirección');
    await expect(page.getByTestId('btn-guardar-direccion')).toBeEnabled();
    await expect(page.getByTestId('switch-direccion-predeterminada')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('ayuda-input-direccion-nombre')).toHaveCount(0);
    await expect(page.getByTestId('ayuda-direccion-nombre')).toHaveText('Solo lo ves vos, por ejemplo Casa o Trabajo');
    await expect(page.getByTestId('ayuda-direccion-referencia')).toHaveText('Ayuda al repartidor: portón negro, timbre de arriba');
    await expect(page.getByTestId('select-direccion-localidad').locator('option')).toHaveCount(4);
    await captura(page, '03-formulario-nueva-direccion');

    await page.getByTestId('btn-guardar-direccion').click();
    await expect(page.getByTestId('mensaje-error-direccion-calle')).toHaveText('La calle es obligatoria');
    await expect(page.getByTestId('mensaje-error-direccion-numero')).toHaveText('El número es obligatorio');
    await expect(page.getByTestId('mensaje-error-direccion-codigo-postal')).toHaveText('El código postal es obligatorio');
    await expect(page.getByTestId('mensaje-error-direccion-localidad')).toHaveText('Seleccioná una localidad');
    await captura(page, '04-formulario-errores');

    await llenarFormulario(page, { calle: 'mitre', numero: '45', piso: '2B', cp: '9420', nombre: 'Trabajo', referencia: 'Timbre de arriba' });
    await page.getByTestId('btn-guardar-direccion').click();

    await expect(pantalla).toHaveCount(0);
    await expect(page.locator('.toast')).toContainText('Dirección agregada');
    const lista = page.getByTestId('lista-direcciones');
    await expect(lista.getByRole('radio')).toHaveCount(2);
    await expect(page.getByTestId('btn-mis-direcciones')).toContainText('Mis direcciones (2)');
    const direcciones = await direccionesDe(request, cuenta);
    const nueva = direcciones.find((d) => d.nombre === 'Trabajo');
    expect(nueva.principal).toBe(false);
    expect(nueva.calle).toBe('Mitre');
    expect(predeterminadaDe(cuenta)).toBe(inicial.id);
    await expect(page.getByTestId(`titulo-direccion-${nueva.id}`)).toHaveText('Trabajo');
    await expect(page.getByTestId(`calle-direccion-${nueva.id}`)).toHaveText('Mitre 45, 2B');
    await expect(page.getByTestId('btn-agregar-direccion')).toBeFocused();
  });

  test('alta: el error de una localidad fuera de las habilitadas llega del servidor y se muestra en el campo', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    await abrirMisDirecciones(page, cuenta);
    await page.getByTestId('btn-agregar-direccion').click();
    await expect(page.getByTestId('btn-guardar-direccion')).toBeEnabled();
    await llenarFormulario(page, { calle: 'Sarmiento' });
    await page.route(`**/api/v1${BASE}`, async (ruta) => {
      if (ruta.request().method() !== 'POST') return ruta.fallback();
      return ruta.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ mensaje: 'Error de validación', data: { localidadId: 'Por ahora solo atendemos Río Grande, Ushuaia y Tolhuin', calle: 'La calle no es válida' } }),
      });
    });
    await page.getByTestId('btn-guardar-direccion').click();
    await expect(page.getByTestId('mensaje-error-direccion-localidad')).toHaveText('Por ahora solo atendemos Río Grande, Ushuaia y Tolhuin');
    await expect(page.getByTestId('mensaje-error-direccion-calle')).toHaveText('La calle no es válida');
    await expect(page.getByTestId('pantalla-direccion-form')).toBeVisible();
    await expect(page.getByTestId('btn-guardar-direccion')).toBeEnabled();
    expect((await direccionesDe(request, cuenta)).length).toBe(1);
  });

  test('edición: la predeterminada tiene el interruptor encendido y bloqueado; otra puede pasar a ser la predeterminada desde el formulario', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    const [inicial] = await direccionesDe(request, cuenta);
    const otraId = await agregarPorApi(request, cuenta, 'Belgrano', { nombre: 'Casa' });
    await abrirMisDirecciones(page, cuenta);

    await page.getByTestId(`btn-menu-direccion-${inicial.id}`).click();
    await page.getByTestId('btn-editar-direccion').click();
    await expect(page.getByTestId('titulo-direccion-form')).toHaveText('Editar dirección');
    const interruptor = page.getByTestId('switch-direccion-predeterminada');
    await expect(interruptor).toHaveAttribute('aria-pressed', 'true');
    await expect(interruptor).toBeDisabled();
    await expect(page.getByTestId('ayuda-direccion-predeterminada')).toHaveText(
      'Es tu dirección predeterminada. Para cambiarla, elegí otra dirección como predeterminada',
    );
    await expect(page.getByTestId('input-direccion-calle')).toHaveValue('Calle Siempre Viva');
    await captura(page, '05-formulario-editando-predeterminada');
    await page.getByTestId('input-direccion-referencia').fill('Casa azul');
    await page.getByTestId('btn-guardar-direccion').click();
    await expect(page.locator('.toast')).toContainText('Dirección actualizada');
    expect((await direccionesDe(request, cuenta)).find((d) => d.id === inicial.id).referencia).toBe('Casa azul');
    expect(predeterminadaDe(cuenta)).toBe(inicial.id);

    await page.getByTestId(`btn-menu-direccion-${otraId}`).click();
    await page.getByTestId('btn-editar-direccion').click();
    await expect(page.getByTestId('switch-direccion-predeterminada')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('switch-direccion-predeterminada')).toBeEnabled();
    await page.getByTestId('switch-direccion-predeterminada').click();
    await page.getByTestId('btn-guardar-direccion').click();
    await expect(page.locator('.toast')).toContainText('Dirección actualizada');
    await expect(page.getByTestId(`chip-predeterminada-${otraId}`)).toBeVisible();
    expect(predeterminadaDe(cuenta)).toBe(otraId);
  });

  test('formulario sin cambios: volver con la flecha o con Esc cierra directo y devuelve el foco', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    const [inicial] = await direccionesDe(request, cuenta);
    await abrirMisDirecciones(page, cuenta);
    await page.getByTestId(`btn-menu-direccion-${inicial.id}`).click();
    await page.getByTestId('btn-editar-direccion').click();
    await expect(page.getByTestId('btn-guardar-direccion')).toBeEnabled();
    await page.getByTestId('btn-volver-direccion').click();
    await expect(page.getByTestId('pantalla-direccion-form')).toHaveCount(0);
    await expect(page.getByTestId('modal-descartar-direccion')).toHaveCount(0);

    await page.getByTestId('btn-agregar-direccion').click();
    await expect(page.getByTestId('pantalla-direccion-form')).toBeVisible();
    await expect(page.getByTestId('btn-guardar-direccion')).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pantalla-direccion-form')).toHaveCount(0);
    await expect(page.getByTestId('modal-descartar-direccion')).toHaveCount(0);
    await expect(page.getByTestId('btn-agregar-direccion')).toBeFocused();
  });

  test('descartar cambios: con cambios, la flecha pide confirmación (alertdialog); Seguir editando conserva lo cargado y Descartar cierra sin guardar', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    const [inicial] = await direccionesDe(request, cuenta);
    await abrirMisDirecciones(page, cuenta);
    await page.getByTestId(`btn-menu-direccion-${inicial.id}`).click();
    await page.getByTestId('btn-editar-direccion').click();
    await expect(page.getByTestId('btn-guardar-direccion')).toBeEnabled();
    await page.getByTestId('input-direccion-calle').fill('Otra calle');
    await page.getByTestId('btn-volver-direccion').click();

    const modal = page.getByTestId('modal-descartar-direccion');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByTestId('titulo-descartar-direccion')).toHaveText('¿Descartar los cambios?');
    await expect(page.getByTestId('btn-seguir-editando-direccion')).toBeFocused();
    await expect(page.getByTestId('btn-seguir-editando-direccion')).toHaveText('Seguir editando');
    await expect(page.getByTestId('btn-descartar-direccion')).toHaveText('Descartar');
    await captura(page, '14-descartar-cambios');

    await page.keyboard.press('Tab');
    await expect(page.getByTestId('btn-descartar-direccion')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('btn-seguir-editando-direccion')).toBeFocused();

    await page.getByTestId('btn-seguir-editando-direccion').click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByTestId('pantalla-direccion-form')).toBeVisible();
    await expect(page.getByTestId('input-direccion-calle')).toHaveValue('Otra calle');
    await expect(page.getByTestId('btn-volver-direccion')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(modal).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(page.getByTestId('pantalla-direccion-form')).toBeVisible();
    await expect(page.getByTestId('input-direccion-calle')).toHaveValue('Otra calle');

    await page.getByTestId('btn-volver-direccion').click();
    await page.getByTestId('btn-descartar-direccion').click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByTestId('pantalla-direccion-form')).toHaveCount(0);
    await expect(page.getByTestId(`btn-menu-direccion-${inicial.id}`)).toBeFocused();
    expect((await direccionesDe(request, cuenta))[0].calle).toBe('Calle Siempre Viva');
  });

  test('descartar cambios: en el alta, Esc con datos cargados pregunta; con Descartar se vuelve a la lista sin crear nada', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    await abrirMisDirecciones(page, cuenta);
    await page.getByTestId('btn-agregar-direccion').click();
    await expect(page.getByTestId('btn-guardar-direccion')).toBeEnabled();
    await page.getByTestId('input-direccion-referencia').fill('Portón negro');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('modal-descartar-direccion')).toBeVisible();
    await expect(page.getByTestId('pantalla-direccion-form')).toBeVisible();
    await page.getByTestId('btn-descartar-direccion').click();
    await expect(page.getByTestId('pantalla-direccion-form')).toHaveCount(0);
    await expect(page.getByTestId('btn-agregar-direccion')).toBeFocused();
    expect((await direccionesDe(request, cuenta)).length).toBe(1);
  });

  test('descartar cambios: tocar el interruptor o cambiar la localidad cuenta como cambio, y volver al valor original deja de contar', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    await agregarPorApi(request, cuenta, 'Belgrano', { nombre: 'Casa' });
    await abrirMisDirecciones(page, cuenta);
    const otra = (await direccionesDe(request, cuenta)).find((d) => d.nombre === 'Casa');
    await page.getByTestId(`btn-menu-direccion-${otra.id}`).click();
    await page.getByTestId('btn-editar-direccion').click();
    await expect(page.getByTestId('btn-guardar-direccion')).toBeEnabled();

    await page.getByTestId('switch-direccion-predeterminada').click();
    await page.getByTestId('btn-volver-direccion').click();
    await expect(page.getByTestId('modal-descartar-direccion')).toBeVisible();
    await page.getByTestId('btn-seguir-editando-direccion').click();

    await page.getByTestId('switch-direccion-predeterminada').click();
    await page.getByTestId('input-direccion-referencia').fill('x');
    await page.getByTestId('input-direccion-referencia').fill('');
    await page.getByTestId('btn-volver-direccion').click();
    await expect(page.getByTestId('modal-descartar-direccion')).toHaveCount(0);
    await expect(page.getByTestId('pantalla-direccion-form')).toHaveCount(0);

    await page.getByTestId(`btn-menu-direccion-${otra.id}`).click();
    await page.getByTestId('btn-editar-direccion').click();
    await expect(page.getByTestId('btn-guardar-direccion')).toBeEnabled();
    const opciones = page.getByTestId('select-direccion-localidad').locator('option');
    const valores = await opciones.evaluateAll((nodos) => nodos.map((n) => (n as HTMLOptionElement).value).filter(Boolean));
    const otraLocalidad = valores.find((v) => v !== localidadId);
    expect(otraLocalidad).toBeTruthy();
    await page.getByTestId('select-direccion-localidad').selectOption(otraLocalidad as string);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('modal-descartar-direccion')).toBeVisible();
    await page.getByTestId('btn-descartar-direccion').click();
    await expect(page.getByTestId('pantalla-direccion-form')).toHaveCount(0);
  });

  test('descartar cambios: guardar con cambios no pregunta nada', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    const [inicial] = await direccionesDe(request, cuenta);
    await abrirMisDirecciones(page, cuenta);
    await page.getByTestId(`btn-menu-direccion-${inicial.id}`).click();
    await page.getByTestId('btn-editar-direccion').click();
    await expect(page.getByTestId('btn-guardar-direccion')).toBeEnabled();
    await page.getByTestId('input-direccion-referencia').fill('Casa azul');
    await page.getByTestId('btn-guardar-direccion').click();
    await expect(page.locator('.toast')).toContainText('Dirección actualizada');
    await expect(page.getByTestId('modal-descartar-direccion')).toHaveCount(0);
    await expect(page.getByTestId('pantalla-direccion-form')).toHaveCount(0);
  });

  test('predeterminada: tocar el radio de otra la cambia al instante, avisa con "Deshacer" y Deshacer vuelve a la anterior', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    const [inicial] = await direccionesDe(request, cuenta);
    const otraId = await agregarPorApi(request, cuenta, 'Belgrano', { nombre: 'Oficina' });
    await abrirMisDirecciones(page, cuenta);

    await page.getByTestId(`radio-direccion-${otraId}`).click();

    await expect(page.getByTestId(`chip-predeterminada-${otraId}`)).toBeVisible();
    await expect(page.getByTestId(`radio-direccion-${otraId}`)).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId(`radio-direccion-${inicial.id}`)).toHaveAttribute('aria-checked', 'false');
    const aviso = page.getByTestId('aviso-predeterminada');
    await expect(aviso).toHaveAttribute('role', 'status');
    await expect(aviso).toContainText('Oficina ahora es tu dirección predeterminada.');
    expect(predeterminadaDe(cuenta)).toBe(otraId);
    await captura(page, '06-aviso-predeterminada-con-deshacer');

    await page.getByTestId('btn-deshacer-predeterminada').click();
    await expect(page.getByTestId(`chip-predeterminada-${inicial.id}`)).toBeVisible();
    await expect(page.getByTestId('aviso-predeterminada')).toHaveCount(0);
    expect(predeterminadaDe(cuenta)).toBe(inicial.id);
  });

  test('predeterminada: mientras se envía la lista queda deshabilitada y el aviso desaparece solo', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    const otraId = await agregarPorApi(request, cuenta, 'Belgrano');
    await abrirMisDirecciones(page, cuenta);
    let liberar: () => void = () => {};
    const bloqueo = new Promise<void>((resolver) => {
      liberar = resolver;
    });
    await page.route(`**/api/v1${BASE}/${otraId}/principal`, async (ruta) => {
      await bloqueo;
      await ruta.continue();
    });

    await page.getByTestId(`radio-direccion-${otraId}`).click();
    await expect(page.getByTestId('lista-direcciones')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByTestId(`radio-direccion-${otraId}`)).toBeDisabled();
    await expect(page.getByTestId('btn-agregar-direccion')).toBeDisabled();
    liberar();
    await expect(page.getByTestId('lista-direcciones')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByTestId('aviso-predeterminada')).toBeVisible();
    await expect(page.getByTestId('aviso-predeterminada')).toHaveCount(0, { timeout: 9_000 });
  });

  test('baja común: pide confirmación (alertdialog), Cancelar no borra y Eliminar quita la dirección sin Deshacer', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    const [inicial] = await direccionesDe(request, cuenta);
    const otraId = await agregarPorApi(request, cuenta, 'Belgrano', { nombre: 'Oficina' });
    await abrirMisDirecciones(page, cuenta);

    await page.getByTestId(`btn-menu-direccion-${otraId}`).click();
    await page.getByTestId('btn-eliminar-direccion').click();
    const modal = page.getByTestId('modal-eliminar-direccion');
    await expect(modal.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByTestId('titulo-eliminar-direccion')).toHaveText('¿Eliminar esta dirección?');
    await expect(page.getByTestId('texto-eliminar-direccion')).toHaveText('Los pedidos que ya hiciste con esta dirección no cambian.');
    await expect(page.getByTestId('btn-cancelar-eliminar-direccion')).toBeFocused();
    await captura(page, '07-baja-comun');

    await page.getByTestId('btn-cancelar-eliminar-direccion').click();
    await expect(modal).toHaveCount(0);
    expect((await direccionesDe(request, cuenta)).length).toBe(2);

    await page.getByTestId(`btn-menu-direccion-${otraId}`).click();
    await page.getByTestId('btn-eliminar-direccion').click();
    await page.getByTestId('btn-confirmar-eliminar-direccion').click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator('.toast')).toContainText('Dirección eliminada correctamente');
    await expect(page.getByTestId('lista-direcciones').getByRole('radio')).toHaveCount(1);
    await expect(page.getByTestId('btn-mis-direcciones')).toContainText('Mis direcciones (1)');
    await expect(page.getByTestId(`direccion-${inicial.id}`)).toBeVisible();
    await expect(page.getByTestId('btn-deshacer-predeterminada')).toHaveCount(0);
    expect((await direccionesDe(request, cuenta)).length).toBe(1);
  });

  test('baja de la predeterminada: el aviso nombra a la más reciente, que pasa a ser la predeterminada', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    const [inicial] = await direccionesDe(request, cuenta);
    await agregarPorApi(request, cuenta, 'Belgrano', { nombre: 'Casa de mamá' });
    const masRecienteId = await agregarPorApi(request, cuenta, 'Perito Moreno', { nombre: 'Oficina' });
    await abrirMisDirecciones(page, cuenta);

    await page.getByTestId(`btn-menu-direccion-${inicial.id}`).click();
    await page.getByTestId('btn-eliminar-direccion').click();
    await expect(page.getByTestId('titulo-eliminar-direccion')).toHaveText('¿Eliminar tu dirección predeterminada?');
    await expect(page.getByTestId('texto-eliminar-direccion')).toHaveText(
      'Los pedidos que ya hiciste con esta dirección no cambian. Tu dirección más reciente, Oficina, pasa a ser la predeterminada.',
    );
    await captura(page, '08-baja-de-la-predeterminada');
    await page.getByTestId('btn-confirmar-eliminar-direccion').click();

    await expect(page.getByTestId(`chip-predeterminada-${masRecienteId}`)).toBeVisible();
    expect(predeterminadaDe(cuenta)).toBe(masRecienteId);
    await expect(page.getByTestId('lista-direcciones').getByRole('radio')).toHaveCount(2);
  });

  test('cupo lleno: con 5 direcciones "Agregar dirección" queda deshabilitado con el aviso, y al eliminar una se vuelve a habilitar', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    for (const [indice, calle] of ['Belgrano', 'Mitre', 'Sarmiento', 'Rivadavia'].entries()) {
      await agregarPorApi(request, cuenta, calle, { nombre: indice === 0 ? 'Casa' : undefined });
    }
    await abrirMisDirecciones(page, cuenta);

    await expect(page.getByTestId('lista-direcciones').getByRole('radio')).toHaveCount(5);
    await expect(page.getByTestId('btn-mis-direcciones')).toContainText('Mis direcciones (5)');
    await expect(page.getByTestId('btn-agregar-direccion')).toBeDisabled();
    await expect(page.getByTestId('aviso-cupo-direcciones')).toHaveText(MENSAJE_CUPO);
    await expect(page.getByTestId('aviso-cupo-direcciones')).toHaveAttribute('role', 'status');
    await sinScrollHorizontal(page);
    await captura(page, '09-lista-5-direcciones-cupo-lleno', true);

    const ultima = (await direccionesDe(request, cuenta)).find((d) => !d.principal);
    await page.getByTestId(`btn-menu-direccion-${ultima.id}`).click();
    await page.getByTestId('btn-eliminar-direccion').click();
    await page.getByTestId('btn-confirmar-eliminar-direccion').click();
    await expect(page.getByTestId('btn-agregar-direccion')).toBeEnabled();
    await expect(page.getByTestId('aviso-cupo-direcciones')).toHaveCount(0);
  });

  test('checkout: aparecen tarjetas con la predeterminada preseleccionada y elegir otra vale solo para ese pedido', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    const [inicial] = await direccionesDe(request, cuenta);
    const segunda = await agregarPorApi(request, cuenta, 'Belgrano', { nombre: 'Trabajo', referencia: 'Portón negro' });
    await agregarPorApi(request, cuenta, 'Mitre');

    await abrirCheckoutEnPasoDeEntrega(page, cuenta, request);

    await expect(page.getByRole('heading', { name: '¿Dónde recibís tu pedido?' })).toBeVisible();
    await expect(page.getByTestId('radiogroup-direcciones').getByRole('radio')).toHaveCount(3);
    await expect(page.getByTestId(`tarjeta-direccion-${inicial.id}`)).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId(`titulo-tarjeta-direccion-${segunda}`)).toHaveText('Trabajo');
    await expect(page.getByTestId(`referencia-tarjeta-direccion-${segunda}`)).toHaveText('Referencia: Portón negro');
    await expect(page.getByTestId('btn-confirmar-direccion')).toBeVisible();
    await expect(page.getByTestId('enlace-administrar-direcciones')).toBeVisible();
    await sinScrollHorizontal(page);
    await captura(page, '10-checkout-3-direcciones', true);

    await page.getByTestId(`tarjeta-direccion-${segunda}`).click();
    await expect(page.getByTestId(`tarjeta-direccion-${segunda}`)).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId(`tarjeta-direccion-${inicial.id}`)).toHaveAttribute('aria-checked', 'false');
    await page.getByTestId('btn-confirmar-direccion').click();
    await expect(page.getByTestId('referencia-resumen')).toHaveText('Referencia: Portón negro');
    await page.getByTestId('btn-confirmar-pedido').click();
    await expect(page.getByTestId('btn-ir-a-pagar')).toBeVisible();

    const pedidos = (await apiGet(request, '/pedidos/cliente', cuenta.sesion.token)).body.data as any[];
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].direccion.calle).toBe('Belgrano');
    expect(pedidos[0].direccion.referencia).toBe('Portón negro');
    expect(predeterminadaDe(cuenta)).toBe(inicial.id);
  });

  test('checkout: con el teclado, las flechas mueven la selección dentro del grupo de tarjetas', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    const [inicial] = await direccionesDe(request, cuenta);
    const segunda = await agregarPorApi(request, cuenta, 'Belgrano');
    await abrirCheckoutEnPasoDeEntrega(page, cuenta, request);

    await page.getByTestId(`tarjeta-direccion-${inicial.id}`).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId(`tarjeta-direccion-${segunda}`)).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId(`tarjeta-direccion-${segunda}`)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByTestId(`tarjeta-direccion-${inicial.id}`)).toHaveAttribute('aria-checked', 'true');
  });

  test('checkout: "Agregar otra dirección" abre el formulario encima, con el interruptor apagado, y vuelve con la nueva seleccionada', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    const [inicial] = await direccionesDe(request, cuenta);
    await abrirCheckoutEnPasoDeEntrega(page, cuenta, request);

    await page.getByTestId('btn-agregar-otra-direccion').click();
    await expect(page.getByTestId('pantalla-direccion-form')).toBeVisible();
    await expect(page.getByTestId('switch-direccion-predeterminada')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('btn-guardar-direccion')).toBeEnabled();
    await llenarFormulario(page, { calle: 'Perito Moreno', numero: '900', nombre: 'Casa de Ana', referencia: 'Reja verde' });
    await captura(page, '11-alta-desde-el-checkout');
    await page.getByTestId('btn-guardar-direccion').click();

    await expect(page.getByTestId('pantalla-direccion-form')).toHaveCount(0);
    const direcciones = await direccionesDe(request, cuenta);
    const nueva = direcciones.find((d) => d.nombre === 'Casa de Ana');
    await expect(page.getByTestId(`tarjeta-direccion-${nueva.id}`)).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId(`tarjeta-direccion-${inicial.id}`)).toHaveAttribute('aria-checked', 'false');
    expect(nueva.principal).toBe(false);
    expect(predeterminadaDe(cuenta)).toBe(inicial.id);
    await page.getByTestId('btn-confirmar-direccion').click();
    await expect(page.getByTestId('btn-confirmar-pedido')).toBeVisible();
    await page.getByTestId('btn-confirmar-pedido').click();
    await expect(page.getByTestId('btn-ir-a-pagar')).toBeVisible();
    const pedidos = (await apiGet(request, '/pedidos/cliente', cuenta.sesion.token)).body.data as any[];
    expect(pedidos[0].direccion.calle).toBe('Perito Moreno');
  });

  test('checkout: con el cupo lleno el botón queda deshabilitado con el aviso y el enlace "Mis direcciones"', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    for (const calle of ['Belgrano', 'Mitre', 'Sarmiento', 'Rivadavia']) {
      await agregarPorApi(request, cuenta, calle);
    }
    await abrirCheckoutEnPasoDeEntrega(page, cuenta, request);

    await expect(page.getByTestId('radiogroup-direcciones').getByRole('radio')).toHaveCount(5);
    await expect(page.getByTestId('btn-agregar-otra-direccion')).toBeDisabled();
    await expect(page.getByTestId('aviso-cupo-checkout')).toContainText(MENSAJE_CUPO);
    await expect(page.getByTestId('enlace-mis-direcciones-cupo')).toBeVisible();
    await sinScrollHorizontal(page);
    await captura(page, '12-checkout-5-direcciones-cupo-lleno', true);

    await page.getByTestId('enlace-mis-direcciones-cupo').click();
    await page.waitForURL('**/perfil.html?vista=direcciones&desde=checkout');
    await expect(page.getByTestId('lista-direcciones')).toBeVisible();
  });

  test('checkout: "Administrar mis direcciones" lleva a la lista y al volver conserva la modalidad y la dirección elegida', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    await agregarPorApi(request, cuenta, 'Belgrano', { nombre: 'Trabajo' });
    const elegida = (await direccionesDe(request, cuenta)).find((d) => d.nombre === 'Trabajo');
    await abrirCheckoutEnPasoDeEntrega(page, cuenta, request);
    await page.getByTestId(`tarjeta-direccion-${elegida.id}`).click();

    await page.getByTestId('enlace-administrar-direcciones').click();
    await page.waitForURL('**/perfil.html?vista=direcciones&desde=checkout');
    await expect(page.getByTestId('lista-direcciones')).toBeVisible();
    await page.getByTestId('btn-volver-direcciones').click();

    await page.waitForURL('**/checkout.html');
    await expect(page.getByTestId('radiogroup-direcciones')).toBeVisible();
    await expect(page.getByTestId(`tarjeta-direccion-${elegida.id}`)).toHaveAttribute('aria-checked', 'true');
  });

  test('checkout: si la dirección elegida se elimina antes de pagar, avisa con claridad y recarga la lista', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    const [inicial] = await direccionesDe(request, cuenta);
    const segunda = await agregarPorApi(request, cuenta, 'Belgrano', { nombre: 'Trabajo' });
    await abrirCheckoutEnPasoDeEntrega(page, cuenta, request);
    await page.getByTestId(`tarjeta-direccion-${segunda}`).click();
    await page.getByTestId('btn-confirmar-direccion').click();
    await expect(page.getByTestId('btn-confirmar-pedido')).toBeVisible();

    const baja = await apiDelete(request, `${BASE}/${segunda}`, cuenta.sesion.token);
    expect(baja.status).toBe(200);
    await page.getByTestId('btn-confirmar-pedido').click();

    await expect(page.getByTestId('mensaje-banner')).toContainText('La dirección que elegiste ya no existe');
    await expect(page.getByTestId('radiogroup-direcciones')).toBeVisible();
    await expect(page.getByTestId(`tarjeta-direccion-${segunda}`)).toHaveCount(0);
    await expect(page.getByTestId(`tarjeta-direccion-${inicial.id}`)).toHaveAttribute('aria-checked', 'true');
    await captura(page, '13-checkout-direccion-eliminada');
  });

  test('checkout: sin direcciones muestra un mensaje claro y deja agregar una, sin botón de confirmar', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    await page.route(`**/api/v1${BASE}`, async (ruta) => {
      if (ruta.request().method() !== 'GET') return ruta.fallback();
      return ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mensaje: 'ok', data: [] }) });
    });
    await apiConHeaders(request, 'DELETE', '/carrito', cuenta.sesion.token);
    await agregarItemCarrito(request, cuenta.sesion.token, productoId, 1);
    await abrirComoCliente(page, cuenta);
    await page.goto('/checkout.html');
    await page.getByTestId('btn-modalidad-domicilio').click();
    await page.getByTestId('btn-continuar-modalidad').click();

    await expect(page.getByText('No tenés una dirección registrada')).toBeVisible();
    await expect(page.getByTestId('btn-agregar-primera-direccion')).toBeVisible();
    await expect(page.getByTestId('btn-confirmar-direccion')).toHaveCount(0);
  });

  test('detalle del pedido: Cliente, Dueño y Empleado ven la referencia de la copia del pedido y nunca el nombre privado', async ({ page, browser, request }) => {
    const cuenta = await nuevaCuenta(request);
    const cuentaEmpleado = await nuevaCuenta(request);
    await sumarAlEquipo(request, dueno.comercioId, cuentaEmpleado.registro, dueno.token);
    const direccionId = await agregarPorApi(request, cuenta, 'Belgrano', { nombre: 'Casa Secreta', referencia: 'Portón negro, timbre de arriba' });
    await apiConHeaders(request, 'DELETE', '/carrito', cuenta.sesion.token);
    await agregarItemCarrito(request, cuenta.sesion.token, productoId, 1);
    const creado = await apiPost(request, '/pedidos/cliente', { tipoEntrega: 'DOMICILIO', direccionId }, cuenta.sesion.token);
    expect(creado.status, JSON.stringify(creado.body)).toBe(201);
    const pedidoId = creado.body.data.id as number;
    await confirmarPagoTest(request, pedidoId);
    const referencia = 'Referencia: Portón negro, timbre de arriba';

    await abrirComoCliente(page, cuenta);
    await page.goto(`/pedido-detalle.html?id=${pedidoId}`);
    await expect(page.getByTestId('referencia-entrega-pedido')).toHaveText(referencia);
    await expect(page.locator('body')).not.toContainText('Casa Secreta');
    await captura(page, '14-detalle-pedido-cliente-referencia', true);

    const paginaDueno = await browser.newPage();
    await abrirComoUsuarioConContexto(paginaDueno, dueno.sesion, {});
    await paginaDueno.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
    await expect(paginaDueno.getByTestId('referencia-entrega-pedido')).toHaveText(referencia);
    await expect(paginaDueno.locator('body')).not.toContainText('Casa Secreta');
    await captura(paginaDueno, '15-detalle-pedido-dueno-referencia', true);
    await paginaDueno.close();

    const paginaEmpleado = await browser.newPage();
    await abrirComoUsuarioConContexto(paginaEmpleado, cuentaEmpleado.sesion, { contexto: { tipo: 'EMPLEADO', comercioId: dueno.comercioId } });
    await paginaEmpleado.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
    await expect(paginaEmpleado.getByTestId('referencia-entrega-pedido')).toHaveText(referencia);
    await expect(paginaEmpleado.locator('body')).not.toContainText('Casa Secreta');
    await captura(paginaEmpleado, '16-detalle-pedido-empleado-referencia', true);
    await paginaEmpleado.close();

    await apiPut(request, `${BASE}/${direccionId}`, { calle: 'Otra Calle', numero: '5', codigoPostal: '9420', localidadId, referencia: 'Cambiada' }, cuenta.sesion.token);
    await page.reload();
    await expect(page.getByTestId('referencia-entrega-pedido')).toHaveText(referencia);
  });

  test('una dirección vieja fuera de las localidades habilitadas se sigue viendo en la lista y se puede elegir en el checkout', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    const [inicial] = await direccionesDe(request, cuenta);
    sql(`UPDATE direccion SET localidad_id = '${LAGUNA_ESCONDIDA}' WHERE id = ${inicial.id};`);
    await abrirMisDirecciones(page, cuenta);
    await expect(page.getByTestId(`localidad-direccion-${inicial.id}`)).toContainText('Laguna Escondida');
    await abrirCheckoutEnPasoDeEntrega(page, cuenta, request);
    await expect(page.getByTestId(`tarjeta-direccion-${inicial.id}`)).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId(`tarjeta-direccion-${inicial.id}`)).toContainText('Laguna Escondida');
    await page.getByTestId('btn-confirmar-direccion').click();
    await page.getByTestId('btn-confirmar-pedido').click();
    await expect(page.getByTestId('btn-ir-a-pagar')).toBeVisible();
  });

  test('detalle del pedido: sin referencia no se muestra ninguna línea de referencia', async ({ page, request }) => {
    const cuenta = await nuevaCuenta(request);
    const [inicial] = await direccionesDe(request, cuenta);
    await apiConHeaders(request, 'DELETE', '/carrito', cuenta.sesion.token);
    await agregarItemCarrito(request, cuenta.sesion.token, productoId, 1);
    const creado = await apiPost(request, '/pedidos/cliente', { tipoEntrega: 'DOMICILIO', direccionId: inicial.id }, cuenta.sesion.token);
    expect(creado.status).toBe(201);
    await abrirComoCliente(page, cuenta);
    await page.goto(`/pedido-detalle.html?id=${creado.body.data.id}`);
    await expect(page.getByText('Envío a domicilio')).toBeVisible();
    await expect(page.getByTestId('referencia-entrega-pedido')).toHaveCount(0);
  });
});
