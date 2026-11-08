import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Locator } from '@playwright/test';
import {
  agregarItemCarrito,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  crearProducto,
  fijarPasswordAdminYLoguear,
  login,
  marcarAptoVenta,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sufijoUnico,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import type { Dueno } from './helpers/multicomercio';
import { abrirComoUsuario, prepararAprobado } from './helpers/multicomercio';

test.use({ viewport: { width: 375, height: 812 } });

async function describedBy(campo: Locator): Promise<string[]> {
  const valor = await campo.getAttribute('aria-describedby');
  return (valor || '').split(/\s+/).filter(Boolean);
}

async function estaEnfocado(campo: Locator): Promise<boolean> {
  return campo.evaluate((el) => el === document.activeElement);
}

async function esperarEnlazadoConError(campo: Locator, error: Locator) {
  await expect(campo).toHaveAttribute('aria-invalid', 'true');
  const idError = await error.getAttribute('id');
  expect(idError).toBeTruthy();
  expect(await describedBy(campo)).toContain(idError);
}

async function esperarLimpio(campo: Locator, error: Locator) {
  await expect(campo).not.toHaveAttribute('aria-invalid', 'true');
  const idError = await error.getAttribute('id');
  expect(await describedBy(campo)).not.toContain(idError);
}

test.describe('Pulido P1b: errores de campo accesibles (T12)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  let dueno: Dueno;
  let productoId: number;
  let adminSesion: SesionApi;
  let clienteSesion: SesionApi;
  let clienteCredenciales: { nombreUsuario: string; password: string };

  test.beforeAll(async ({ request }) => {
    adminSesion = await fijarPasswordAdminYLoguear(request);
    const localidadId = await obtenerLocalidadRioGrande(request);
    const categoriaId = await crearCategoria(request, adminSesion.token, `Cat Errores ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminSesion.token, localidadId, false);
    await marcarAptoVenta(request, dueno.comercioId);
    productoId = await crearProducto(request, dueno.token, { nombre: `Producto Errores ${sufijoUnico()}`, precio: 10000, categoriaId });
    const cliente = await registrarYVerificarCliente(request, localidadId);
    clienteCredenciales = { nombreUsuario: cliente.nombreUsuario, password: cliente.password };
    clienteSesion = await login(request, cliente.nombreUsuario, cliente.password);
  });

  test('login con los dos campos vacíos: marca ambos, los enlaza con el mensaje y enfoca el usuario', async ({ page }) => {
    await page.goto('/login.html');
    await page.getByTestId('btn-ingresar').click();
    const usuario = page.getByTestId('input-nombre-usuario');
    const password = page.getByTestId('input-password');
    const error = page.getByTestId('mensaje-error-login');
    await expect(error).toBeVisible();
    await esperarEnlazadoConError(usuario, error);
    await esperarEnlazadoConError(password, error);
    expect(await estaEnfocado(usuario)).toBe(true);
  });

  test('login con solo la contraseña vacía: el foco va a la contraseña y el usuario no queda marcado', async ({ page }) => {
    await page.goto('/login.html');
    await page.getByTestId('input-nombre-usuario').fill('unusuario1');
    await page.getByTestId('btn-ingresar').click();
    const usuario = page.getByTestId('input-nombre-usuario');
    const password = page.getByTestId('input-password');
    const error = page.getByTestId('mensaje-error-login');
    await expect(error).toBeVisible();
    await esperarEnlazadoConError(password, error);
    await expect(usuario).not.toHaveAttribute('aria-invalid', 'true');
    expect(await estaEnfocado(password)).toBe(true);
  });

  test('login: al volver a enviar con los datos completos se limpian las marcas del error', async ({ page }) => {
    await page.goto('/login.html');
    await page.getByTestId('btn-ingresar').click();
    const usuario = page.getByTestId('input-nombre-usuario');
    const password = page.getByTestId('input-password');
    const error = page.getByTestId('mensaje-error-login');
    await expect(error).toBeVisible();
    await usuario.fill('unusuario1');
    await password.fill('ClaveIncorrecta1');
    await page.getByTestId('btn-ingresar').click();
    await expect(error).toContainText('incorrectos');
    await esperarEnlazadoConError(usuario, error);
    await esperarEnlazadoConError(password, error);
    await page.getByTestId('btn-ingresar').click();
    await page.getByTestId('input-password').fill('');
    await page.getByTestId('btn-ingresar').click();
    await expect(error).toContainText('contraseña');
    await expect(usuario).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('registro de Cliente: al enviar el primer paso vacío el foco va al primer campo con error y al corregirlo se limpia', async ({ page }) => {
    await page.goto('/registro-cliente.html');
    await page.getByTestId('btn-continuar').click();
    const nombre = page.getByTestId('input-nombre');
    const error = page.getByTestId('mensaje-error-nombre');
    await expect(error).toBeVisible();
    await esperarEnlazadoConError(nombre, error);
    expect(await estaEnfocado(nombre)).toBe(true);
    await nombre.fill('Lucía');
    await page.getByTestId('input-apellido').focus();
    await esperarLimpio(nombre, error);
    await expect(error).toBeHidden();
  });

  test('perfil del Cliente: el error de un campo de la edición queda enlazado y enfocado', async ({ page }) => {
    await abrirComoUsuario(page, clienteSesion);
    await page.goto('/perfil.html');
    await expect(page.getByTestId('btn-editar-datos')).toBeEnabled();
    await page.getByTestId('btn-editar-datos').click();
    const nombre = page.getByTestId('input-nombre');
    await nombre.fill('');
    await page.getByTestId('btn-guardar-datos').click();
    const error = page.getByTestId('mensaje-error-nombre');
    await expect(error).toBeVisible();
    await esperarEnlazadoConError(nombre, error);
    expect(await estaEnfocado(nombre)).toBe(true);
    await nombre.fill('Marina');
    await page.getByTestId('btn-guardar-datos').click();
    await esperarLimpio(nombre, error);
  });

  test('hoja de rechazo de un pedido: el campo sin completar queda enlazado a su mensaje y enfocado', async ({ page, request }) => {
    const sesion = await login(request, clienteCredenciales.nombreUsuario, clienteCredenciales.password);
    const pedidoId = await pedidoPagado(request, sesion, productoId);
    await abrirComoUsuario(page, dueno.sesion);
    await page.goto(`/comercio-pedido-detalle.html?id=${pedidoId}`);
    await page.getByTestId('btn-rechazar-pedido').click();
    await expect(page.getByTestId('modal-rechazar-pedido')).toBeVisible();
    await page.getByTestId('btn-confirmar-rechazo').click();
    const motivo = page.getByTestId('select-motivo-rechazo');
    const error = page.getByTestId('mensaje-error-motivo-rechazo');
    await expect(error).toBeVisible();
    await esperarEnlazadoConError(motivo, error);
    expect(await estaEnfocado(motivo)).toBe(true);
    await motivo.selectOption('SIN_STOCK');
    await esperarLimpio(motivo, error);
  });
});

async function pedidoPagado(request: APIRequestContext, sesion: SesionApi, productoId: number): Promise<number> {
  await agregarItemCarrito(request, sesion.token, productoId, 1);
  const pedidoId = await crearPedido(request, sesion.token, 'RETIRO');
  await confirmarPagoTest(request, pedidoId, true);
  return pedidoId;
}
