import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  apiPost,
  apiPut,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
} from './helpers/backend';
import type { ClienteRegistrado, SesionApi } from './helpers/backend';
import { abrirComoUsuario } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const CARPETA_CAPTURAS = path.resolve(__dirname, '../../../docs/capturas-suspension');
const MOTIVO = 'Reiteradas quejas de comercios por pedidos falsos';

async function captura(page: Page, nombre: string, paginaCompleta = false) {
  fs.mkdirSync(CARPETA_CAPTURAS, { recursive: true });
  await page.screenshot({ path: path.join(CARPETA_CAPTURAS, `${nombre}.png`), fullPage: paginaCompleta });
}

function letrasAlAzar(longitud: number): string {
  const letras = 'abcdefghijklmnopqrstuvwxyz';
  let resultado = '';
  for (let i = 0; i < longitud; i += 1) resultado += letras[Math.floor(Math.random() * letras.length)];
  return resultado;
}

interface ClientePrueba extends ClienteRegistrado {
  id: number;
  sesion: SesionApi;
  nombreCompleto: string;
}

test.describe('Fase 5, S1 (UI): suspensión de cuentas del Cliente', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  let adminSesion: SesionApi;
  let localidadId: string;

  async function nuevoCliente(request: APIRequestContext, conNombreUnico = false): Promise<ClientePrueba> {
    const registrado = await registrarYVerificarCliente(request, localidadId);
    const sesion = await login(request, registrado.nombreUsuario, registrado.password);
    let nombre = registrado.nombre;
    let apellido = registrado.apellido;
    if (conNombreUnico) {
      nombre = `Zorzal${letrasAlAzar(8)}`;
      apellido = `Quimbaya${letrasAlAzar(6)}`;
      const respuesta = await request.put(`${process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1'}/clientes/perfil`, {
        data: { nombre, apellido, telefono: '+5492964551238' },
        headers: { Authorization: `Bearer ${sesion.token}` },
      });
      expect(respuesta.status()).toBe(200);
      const cuerpo = await respuesta.json();
      nombre = cuerpo.data.nombre;
      apellido = cuerpo.data.apellido;
    }
    return { ...registrado, id: sesion.usuario.id, sesion, nombre, apellido, nombreCompleto: `${nombre} ${apellido}` };
  }

  async function suspenderPorApi(request: APIRequestContext, cliente: ClientePrueba, motivo = MOTIVO) {
    const respuesta = await apiPut(request, `/administrador/clientes/${cliente.id}/suspender`, { motivo }, adminSesion.token);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
  }

  const estadoDe = (cliente: ClientePrueba): string => sql(`SELECT estado FROM usuario WHERE id = ${cliente.id};`);
  const historial = (cliente: ClientePrueba, destino: string): number =>
    Number(sql(`SELECT COUNT(*) FROM historial_estado_usuario WHERE usuario_id = ${cliente.id} AND estado_destino = '${destino}';`));

  async function abrirListado(page: Page) {
    await abrirComoUsuario(page, adminSesion);
    await page.goto('/admin-clientes.html');
    await expect(page.getByTestId('contador-clientes')).toContainText('Mostrando');
  }

  async function buscar(page: Page, texto: string) {
    await page.getByTestId('input-buscar-cliente').fill(texto);
  }

  test.beforeAll(async ({ request }) => {
    adminSesion = await fijarPasswordAdminYLoguear(request);
    localidadId = await obtenerLocalidadRioGrande(request);
  });

  test('login de una cuenta suspendida: aparece la hoja con el motivo y Cerrar la cierra', async ({ page, request }) => {
    const cliente = await nuevoCliente(request);
    await suspenderPorApi(request, cliente);

    await page.goto('/login.html');
    await page.getByTestId('input-nombre-usuario').fill(cliente.nombreUsuario);
    await page.getByTestId('input-password').fill(cliente.password);
    await page.getByTestId('btn-ingresar').click();

    const hoja = page.getByTestId('hoja-cuenta-suspendida');
    await expect(hoja).toBeVisible();
    await expect(hoja.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByTestId('titulo-cuenta-suspendida')).toHaveText('Cuenta suspendida');
    await expect(page.getByTestId('motivo-cuenta-suspendida')).toContainText(MOTIVO);
    await expect(page.getByTestId('btn-cerrar-cuenta-suspendida')).toBeFocused();
    await expect(page.getByTestId('acciones-cuenta-suspendida')).toBeVisible();
    await captura(page, '01-login-hoja-cuenta-suspendida');

    await page.keyboard.press('Tab');
    await expect(page.getByTestId('btn-cerrar-cuenta-suspendida')).toBeFocused();

    await page.getByTestId('btn-cerrar-cuenta-suspendida').click();
    await expect(hoja).toHaveCount(0);
    await expect(page.getByTestId('input-nombre-usuario')).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem('bajonea_token'))).toBeNull();
    expect(estadoDe(cliente)).toBe('SUSPENDIDO');
    await sinScrollHorizontal(page);
  });

  test('login de una cuenta suspendida: Escape cierra la hoja y el texto del motivo no se interpreta como HTML', async ({ page, request }) => {
    const cliente = await nuevoCliente(request);
    await suspenderPorApi(request, cliente, 'Motivo con <b>etiqueta</b> y <img src=x onerror=alert(1)> para probar');

    await page.goto('/login.html');
    await page.getByTestId('input-nombre-usuario').fill(cliente.nombreUsuario);
    await page.getByTestId('input-password').fill(cliente.password);
    await page.getByTestId('btn-ingresar').click();

    await expect(page.getByTestId('motivo-cuenta-suspendida')).toContainText('<b>etiqueta</b>');
    await expect(page.getByTestId('motivo-cuenta-suspendida').locator('b, img')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('hoja-cuenta-suspendida')).toHaveCount(0);
    await expect(page.getByTestId('input-nombre-usuario')).toBeFocused();
  });

  test('contraseña incorrecta en una cuenta suspendida: no aparece la hoja y sale el mensaje de siempre', async ({ page, request }) => {
    const cliente = await nuevoCliente(request);
    await suspenderPorApi(request, cliente);

    await page.goto('/login.html');
    await page.getByTestId('input-nombre-usuario').fill(cliente.nombreUsuario);
    await page.getByTestId('input-password').fill('Incorrecta1x');
    await page.getByTestId('btn-ingresar').click();

    await expect(page.getByTestId('mensaje-error-login')).toContainText('Usuario o contraseña incorrectos');
    await expect(page.getByTestId('hoja-cuenta-suspendida')).toHaveCount(0);
    await expect(page.getByTestId('mensaje-advertencia-bloqueo')).toBeHidden();
    expect(estadoDe(cliente)).toBe('SUSPENDIDO');
  });

  test('sesión abierta: al suspender al Cliente, su siguiente acción muestra la pantalla completa y Cerrar sesión lleva al login', async ({ page, request }) => {
    const cliente = await nuevoCliente(request);
    await abrirComoUsuario(page, cliente.sesion);
    await page.goto('/perfil.html');
    await expect(page.getByTestId('pantalla-sesion-suspendida')).toHaveCount(0);
    await suspenderPorApi(request, cliente);

    await page.goto('/pedidos.html');
    const pantalla = page.getByTestId('pantalla-sesion-suspendida');
    await expect(pantalla).toBeVisible();
    await expect(pantalla).toHaveAttribute('role', 'alertdialog');
    await expect(page.getByTestId('titulo-sesion-suspendida')).toHaveText('Tu cuenta fue suspendida');
    await expect(page.getByTestId('motivo-sesion-suspendida')).toContainText(MOTIVO);
    await expect(page.getByTestId('que-pasa-ahora')).toContainText('Qué pasa ahora');
    await expect(page.getByTestId('que-pasa-pedidos-pagados')).toHaveText('Tus pedidos ya pagados siguen su curso.');
    await expect(page.getByTestId('que-pasa-pedidos-nuevos')).toHaveText('No podés hacer pedidos nuevos.');
    await expect(pantalla).not.toContainText('carrito');
    await expect(page.getByTestId('btn-cerrar-sesion-suspendida')).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem('bajonea_token'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('bajonea_usuario'))).toBeNull();
    await captura(page, '02-sesion-suspendida-pantalla-completa');
    await sinScrollHorizontal(page);

    await page.getByTestId('btn-cerrar-sesion-suspendida').click();
    await page.waitForURL('**/login.html');
  });

  test('sesión abierta: la pantalla aparece desde cualquier página del Cliente', async ({ page, request }) => {
    const cliente = await nuevoCliente(request);
    await suspenderPorApi(request, cliente);
    for (const ruta of ['/index.html', '/carrito.html', '/notificaciones.html', '/pedidos.html']) {
      await abrirComoUsuario(page, cliente.sesion);
      await page.goto(ruta);
      await expect(page.getByTestId('pantalla-sesion-suspendida'), ruta).toBeVisible();
    }
  });

  test('listado de Clientes: buscar por nombre y por email, contador y estado vacío', async ({ page, request }) => {
    const unico = await nuevoCliente(request, true);
    const otro = await nuevoCliente(request, true);

    await abrirListado(page);
    await expect(page.getByTestId(`cliente-item-${unico.id}`)).toBeVisible();
    await expect(page.getByTestId(`cliente-item-${otro.id}`)).toBeVisible();
    const total = Number((await page.getByTestId('contador-clientes').innerText()).match(/\d+/)![0]);
    expect(total).toBeGreaterThanOrEqual(2);
    await captura(page, '03-listado-de-clientes');

    await buscar(page, unico.nombre.toUpperCase());
    await expect(page.getByTestId(`cliente-item-${unico.id}`)).toBeVisible();
    await expect(page.getByTestId(`cliente-item-${otro.id}`)).toHaveCount(0);
    await expect(page.getByTestId('contador-clientes')).toHaveText('Mostrando 1 cliente');

    await buscar(page, otro.email);
    await expect(page.getByTestId(`cliente-item-${otro.id}`)).toBeVisible();
    await expect(page.getByTestId(`cliente-item-${unico.id}`)).toHaveCount(0);
    await expect(page.getByTestId('contador-clientes')).toHaveText('Mostrando 1 cliente');

    await buscar(page, `${otro.apellido.slice(0, 5).toLowerCase()}`);
    await expect(page.getByTestId(`cliente-item-${otro.id}`)).toBeVisible();

    await buscar(page, 'zzzz-no-existe-nadie-asi');
    await expect(page.getByTestId('clientes-vacio')).toHaveText('No hay clientes con esos filtros.');
    await expect(page.getByTestId('contador-clientes')).toHaveText('Mostrando 0 clientes');
    await captura(page, '07-listado-estado-vacio');

    await page.getByTestId('btn-limpiar-busqueda').click();
    await expect(page.getByTestId('input-buscar-cliente')).toHaveValue('');
    await expect(page.getByTestId('input-buscar-cliente')).toBeFocused();
    await expect(page.getByTestId(`cliente-item-${unico.id}`)).toBeVisible();
    await sinScrollHorizontal(page);
  });

  test('listado de Clientes: los filtros por estado marcan el botón activo y filtran', async ({ page, request }) => {
    const suspendido = await nuevoCliente(request, true);
    const bloqueado = await nuevoCliente(request, true);
    const activo = await nuevoCliente(request, true);
    await suspenderPorApi(request, suspendido);
    for (let i = 0; i < 3; i += 1) {
      await apiPost(request, '/auth/login', { nombreUsuario: bloqueado.nombreUsuario, password: 'Incorrecta1x' });
    }
    expect(estadoDe(bloqueado)).toBe('BLOQUEADO');

    await abrirListado(page);
    await expect(page.getByTestId('filtro-clientes-todos')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('filtro-clientes-suspendidos')).toHaveAttribute('aria-pressed', 'false');

    await page.getByTestId('filtro-clientes-suspendidos').click();
    await expect(page.getByTestId('filtro-clientes-suspendidos')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('filtro-clientes-todos')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId(`cliente-item-${suspendido.id}`)).toBeVisible();
    await expect(page.getByTestId(`cliente-item-${bloqueado.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`cliente-item-${activo.id}`)).toHaveCount(0);
    for (const estado of await page.getByTestId('estado-cliente').allInnerTexts()) {
      expect(estado.trim()).toBe('Suspendido');
    }

    await page.getByTestId('filtro-clientes-bloqueados').click();
    await expect(page.getByTestId(`cliente-item-${bloqueado.id}`)).toBeVisible();
    await expect(page.getByTestId(`cliente-item-${suspendido.id}`)).toHaveCount(0);
    for (const estado of await page.getByTestId('estado-cliente').allInnerTexts()) {
      expect(estado.trim()).toBe('Bloqueado');
    }

    await buscar(page, activo.email);
    await expect(page.getByTestId('clientes-vacio')).toBeVisible();
    await expect(page.getByTestId('contador-clientes')).toHaveText('Mostrando 0 clientes');

    await page.getByTestId('filtro-clientes-todos').click();
    await expect(page.getByTestId(`cliente-item-${activo.id}`)).toBeVisible();
    await expect(page.getByTestId('contador-clientes')).toHaveText('Mostrando 1 cliente');

    for (const clave of ['inactivos', 'pendientes']) {
      await page.getByTestId(`filtro-clientes-${clave}`).click();
      await expect(page.getByTestId(`filtro-clientes-${clave}`)).toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('menú de acciones: teclado, Escape, tocar afuera y opciones según el estado', async ({ page, request }) => {
    const activo = await nuevoCliente(request, true);
    const suspendido = await nuevoCliente(request, true);
    await suspenderPorApi(request, suspendido);

    await abrirListado(page);
    await buscar(page, activo.email);
    const boton = page.getByTestId(`btn-acciones-cliente-${activo.id}`);
    await expect(boton).toHaveAttribute('aria-label', `Acciones de ${activo.nombreCompleto}`);
    await expect(boton).toHaveAttribute('aria-expanded', 'false');
    const caja = await boton.boundingBox();
    expect(Math.min(caja!.width, caja!.height)).toBeGreaterThanOrEqual(43.5);

    await boton.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByTestId(`menu-acciones-cliente-${activo.id}`);
    await expect(menu).toBeVisible();
    await expect(boton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId(`accion-suspender-${activo.id}`)).toBeFocused();
    await expect(menu.getByRole('menuitem')).toHaveCount(1);
    await expect(menu.getByRole('menuitem')).toHaveText('Suspender cuenta');
    await captura(page, '04-menu-de-acciones');

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(boton).toBeFocused();
    await expect(boton).toHaveAttribute('aria-expanded', 'false');

    await boton.click();
    await expect(menu).toBeVisible();
    await page.getByTestId('contador-clientes').click();
    await expect(menu).toHaveCount(0);

    await buscar(page, suspendido.email);
    await page.getByTestId(`btn-acciones-cliente-${suspendido.id}`).click();
    const menuSuspendido = page.getByTestId(`menu-acciones-cliente-${suspendido.id}`);
    await expect(menuSuspendido.getByRole('menuitem')).toHaveText(['Levantar suspensión']);
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId(`accion-levantar-${suspendido.id}`)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId(`btn-acciones-cliente-${suspendido.id}`)).toBeFocused();
  });

  test('suspender desde el listado: validación de 10 caracteres, contador, vista previa, toast y doble clic', async ({ page, request }) => {
    const cliente = await nuevoCliente(request, true);

    await abrirListado(page);
    await buscar(page, cliente.email);
    await page.getByTestId(`btn-acciones-cliente-${cliente.id}`).click();
    await page.getByTestId(`accion-suspender-${cliente.id}`).click();

    const modal = page.getByTestId('modal-suspender-cliente');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('role', 'alertdialog');
    await expect(page.getByTestId('modal-suspender-cliente-titulo')).toHaveText(`Suspender a ${cliente.nombreCompleto}`);
    await expect(page.getByTestId('suspender-que-va-a-pasar')).toContainText('No tiene pedidos en curso');
    await expect(page.getByTestId('suspender-que-va-a-pasar')).toContainText('No podrá ingresar ni comprar');
    await expect(page.getByTestId('input-suspender-motivo')).toBeFocused();
    const confirmar = page.getByTestId('btn-confirmar-suspender');
    await expect(confirmar).toBeDisabled();
    await expect(page.getByTestId('contador-suspender-motivo')).toHaveText('0 / 500 · mínimo 10');

    await page.getByTestId('input-suspender-motivo').fill('123456789');
    await expect(page.getByTestId('contador-suspender-motivo')).toHaveText('9 / 500 · mínimo 10');
    await expect(confirmar).toBeDisabled();
    await page.getByTestId('input-suspender-motivo').fill('          corto ');
    await expect(confirmar).toBeDisabled();

    await page.getByTestId('input-suspender-motivo').fill(MOTIVO);
    await expect(confirmar).toBeEnabled();
    await captura(page, '05-modal-suspender');
    await sinScrollHorizontal(page);

    await confirmar.dblclick();
    await expect(page.locator('.toast')).toContainText('Cuenta suspendida');
    await expect(modal).toHaveCount(0);
    await expect(page.getByTestId(`cliente-item-${cliente.id}`).getByTestId('estado-cliente')).toContainText('Suspendido');
    await expect(page.getByTestId(`btn-acciones-cliente-${cliente.id}`)).toBeFocused();
    await captura(page, '08-toast-cuenta-suspendida');

    expect(estadoDe(cliente)).toBe('SUSPENDIDO');
    expect(historial(cliente, 'SUSPENDIDO')).toBe(1);
    expect(sql(`SELECT motivo_suspension FROM usuario WHERE id = ${cliente.id};`)).toBe(MOTIVO);
  });

  test('suspender: Cancelar y Escape cierran sin suspender y el foco vuelve al botón', async ({ page, request }) => {
    const cliente = await nuevoCliente(request, true);

    await abrirListado(page);
    await buscar(page, cliente.email);
    const boton = page.getByTestId(`btn-acciones-cliente-${cliente.id}`);
    await boton.click();
    await page.getByTestId(`accion-suspender-${cliente.id}`).click();
    await page.getByTestId('input-suspender-motivo').fill(MOTIVO);
    await page.getByTestId('btn-cancelar-suspender').click();
    await expect(page.getByTestId('modal-suspender-cliente')).toHaveCount(0);
    await expect(boton).toBeFocused();

    await boton.click();
    await page.getByTestId(`accion-suspender-${cliente.id}`).click();
    await expect(page.getByTestId('modal-suspender-cliente')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('modal-suspender-cliente')).toHaveCount(0);
    await expect(boton).toBeFocused();
    expect(estadoDe(cliente)).toBe('ACTIVO');
  });

  test('suspender: si la cuenta ya estaba suspendida el modal muestra el error con salida y no queda colgado', async ({ page, request }) => {
    const cliente = await nuevoCliente(request, true);

    await abrirListado(page);
    await buscar(page, cliente.email);
    await page.getByTestId(`btn-acciones-cliente-${cliente.id}`).click();
    await page.getByTestId(`accion-suspender-${cliente.id}`).click();
    await page.getByTestId('input-suspender-motivo').fill(MOTIVO);
    await suspenderPorApi(request, cliente);

    await page.getByTestId('btn-confirmar-suspender').click();
    await expect(page.getByTestId('aviso-suspender')).toContainText('La cuenta ya está suspendida');
    await expect(page.getByTestId('btn-confirmar-suspender')).toBeEnabled();
    await page.getByTestId('btn-cancelar-suspender').click();
    await expect(page.getByTestId(`cliente-item-${cliente.id}`).getByTestId('estado-cliente')).toContainText('Suspendido');
    expect(historial(cliente, 'SUSPENDIDO')).toBe(1);
  });

  test('levantar con mensaje: toast, la cuenta vuelve activa y puede ingresar', async ({ page, request }) => {
    const cliente = await nuevoCliente(request, true);
    await suspenderPorApi(request, cliente);

    await abrirListado(page);
    await buscar(page, cliente.email);
    await page.getByTestId(`btn-acciones-cliente-${cliente.id}`).click();
    await page.getByTestId(`accion-levantar-${cliente.id}`).click();

    const modal = page.getByTestId('modal-levantar-suspension');
    await expect(modal).toBeVisible();
    await expect(page.getByTestId('modal-levantar-suspension-titulo')).toHaveText('Levantar suspensión');
    await expect(page.getByTestId('levantar-suspension-actual')).toContainText('Suspendida desde');
    await expect(page.getByTestId('levantar-motivo-actual')).toHaveText(MOTIVO);
    await expect(page.getByTestId('levantar-que-va-a-pasar')).toContainText('Podrá ingresar y comprar de nuevo.');
    await expect(page.getByTestId('levantar-que-va-a-pasar')).not.toContainText('Estaba bloqueada');
    await expect(page.getByTestId('contador-levantar-mensaje')).toHaveText('0 / 500');
    await page.getByTestId('input-levantar-mensaje').fill('Revisamos tu caso y todo está en orden');
    await expect(page.getByTestId('contador-levantar-mensaje')).toHaveText('38 / 500');
    await captura(page, '06-modal-levantar-suspension');
    await sinScrollHorizontal(page);

    await page.getByTestId('btn-confirmar-levantar').dblclick();
    await expect(page.locator('.toast')).toContainText('Suspensión levantada');
    await expect(modal).toHaveCount(0);
    await expect(page.getByTestId(`cliente-item-${cliente.id}`).getByTestId('estado-cliente')).toContainText('Activo');
    await expect(page.getByTestId(`btn-acciones-cliente-${cliente.id}`)).toBeFocused();

    expect(estadoDe(cliente)).toBe('ACTIVO');
    expect(Number(sql(`SELECT COUNT(*) FROM historial_estado_usuario WHERE usuario_id = ${cliente.id} AND estado_origen = 'SUSPENDIDO' AND estado_destino = 'ACTIVO';`))).toBe(1);
    expect(sql(`SELECT motivo FROM historial_estado_usuario WHERE usuario_id = ${cliente.id} AND estado_origen = 'SUSPENDIDO';`))
      .toBe('Revisamos tu caso y todo está en orden');
    const entrada = await login(request, cliente.nombreUsuario, cliente.password);
    expect(entrada.token).toBeTruthy();
  });

  test('levantar sin mensaje, y una cuenta que estaba bloqueada vuelve activa', async ({ page, request }) => {
    const cliente = await nuevoCliente(request, true);
    for (let i = 0; i < 3; i += 1) {
      await apiPost(request, '/auth/login', { nombreUsuario: cliente.nombreUsuario, password: 'Incorrecta1x' });
    }
    expect(estadoDe(cliente)).toBe('BLOQUEADO');
    await suspenderPorApi(request, cliente);

    await abrirListado(page);
    await buscar(page, cliente.email);
    await page.getByTestId(`btn-acciones-cliente-${cliente.id}`).click();
    await page.getByTestId(`accion-levantar-${cliente.id}`).click();
    await expect(page.getByTestId('levantar-que-va-a-pasar')).toContainText('Estaba bloqueada: vuelve activa.');
    await page.getByTestId('btn-confirmar-levantar').click();
    await expect(page.locator('.toast')).toContainText('Suspensión levantada');

    expect(estadoDe(cliente)).toBe('ACTIVO');
    expect(sql(`SELECT intentos_fallidos FROM usuario WHERE id = ${cliente.id};`)).toBe('0');
    expect(sql(`SELECT IFNULL(motivo, 'NULO') FROM historial_estado_usuario WHERE usuario_id = ${cliente.id} AND estado_origen = 'SUSPENDIDO';`)).toBe('NULO');
    const entrada = await login(request, cliente.nombreUsuario, cliente.password);
    expect(entrada.token).toBeTruthy();
  });

  test('una cuenta inactiva que se suspende y se levanta vuelve a estar inactiva', async ({ page, request }) => {
    const cliente = await nuevoCliente(request, true);
    sql(`UPDATE usuario SET estado = 'INACTIVO' WHERE id = ${cliente.id};`);

    await abrirListado(page);
    await buscar(page, cliente.email);
    await page.getByTestId(`btn-acciones-cliente-${cliente.id}`).click();
    await page.getByTestId(`accion-suspender-${cliente.id}`).click();
    await page.getByTestId('input-suspender-motivo').fill(MOTIVO);
    await page.getByTestId('btn-confirmar-suspender').click();
    await expect(page.locator('.toast')).toContainText('Cuenta suspendida');
    expect(estadoDe(cliente)).toBe('SUSPENDIDO');
    await expect(page.getByTestId(`cliente-item-${cliente.id}`).getByTestId('estado-cliente')).toContainText('Suspendido');

    await page.getByTestId(`btn-acciones-cliente-${cliente.id}`).click();
    await page.getByTestId(`accion-levantar-${cliente.id}`).click();
    await expect(page.getByTestId('levantar-que-va-a-pasar')).toContainText('Vuelve a estar inactiva');
    await page.getByTestId('btn-confirmar-levantar').click();
    await expect(page.locator('.toast')).toContainText('Suspensión levantada');
    await expect(page.getByTestId(`cliente-item-${cliente.id}`).getByTestId('estado-cliente')).toContainText('Inactivo');
    expect(estadoDe(cliente)).toBe('INACTIVO');
  });

  test('si el email del aviso falló: la fila lo dice y "Reenviar email" lo reenvía con un toast', async ({ page, request }) => {
    const cliente = await nuevoCliente(request, true);
    const fallas = await apiPut(request, '/test/email-aviso-cuenta/fallas?cantidad=1', {});
    expect(fallas.status).toBe(200);
    await suspenderPorApi(request, cliente);

    await abrirListado(page);
    await buscar(page, cliente.email);
    await expect(page.getByTestId(`email-fallido-${cliente.id}`)).toHaveText('No se envió el email');
    await page.getByTestId(`btn-acciones-cliente-${cliente.id}`).click();
    await expect(page.getByTestId(`menu-acciones-cliente-${cliente.id}`).getByRole('menuitem')).toHaveText(['Levantar suspensión', 'Reenviar email']);
    await page.getByTestId(`accion-reenviar-${cliente.id}`).click();

    await expect(page.locator('.toast')).toContainText('Email reenviado');
    await expect(page.getByTestId(`email-fallido-${cliente.id}`)).toHaveCount(0);
    await page.getByTestId(`btn-acciones-cliente-${cliente.id}`).click();
    await expect(page.getByTestId(`menu-acciones-cliente-${cliente.id}`).getByRole('menuitem')).toHaveText(['Levantar suspensión']);
  });
});
