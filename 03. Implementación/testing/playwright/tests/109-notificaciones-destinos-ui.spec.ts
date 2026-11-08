import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { login, registrarYVerificarCliente, sqlTest as sql } from './helpers/backend';
import { abrirComoUsuario } from './helpers/multicomercio';
import { agregarComercioApto } from './helpers/multicomercio';
import { abrirComoUsuarioConContexto, sumarAlEquipo } from './helpers/empleado';
import { abrirComoUsuarioConComercio, abrirPanel, comercioActivoEnSesion } from './helpers/selector';
import { nuevoCliente, prepararEscenario } from './helpers/reclamos';
import type { Escenario } from './helpers/reclamos';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

interface Esperado {
  tipo: string;
  entidad?: 'PEDIDO' | 'COMERCIO' | null;
  href: string | null;
  texto?: string;
}

function sembrar(usuarioId: number, comercioId: number | null, tipo: string, entidad: 'PEDIDO' | 'COMERCIO' | null, entidadId: number | null, leida = false): number {
  const entidadSql = entidad ? `'${entidad}'` : 'NULL';
  const idSql = entidadId === null ? 'NULL' : String(entidadId);
  const comercioSql = comercioId === null ? 'NULL' : String(comercioId);
  sql(
    `INSERT INTO notificacion (usuario_id, tipo, mensaje, leida, fecha_creacion, canal, estado, entidad_tipo, entidad_id, comercio_id) ` +
      `VALUES (${usuarioId}, '${tipo}', 'Aviso de prueba ${tipo}', ${leida ? 1 : 0}, NOW(), 'PUSH', 'PENDIENTE', ${entidadSql}, ${idSql}, ${comercioSql});`,
  );
  return Number(sql(`SELECT MAX(id) FROM notificacion WHERE usuario_id = ${usuarioId};`));
}

async function verificar(page: Page, usuarioId: number, comercioId: number | null, esperados: Esperado[], entidadId: number) {
  const ids: number[] = [];
  for (const esperado of esperados) {
    const entidad = esperado.entidad === undefined ? 'COMERCIO' : esperado.entidad;
    ids.push(sembrar(usuarioId, comercioId, esperado.tipo, entidad, entidad === null ? null : entidadId));
  }
  await page.goto('/notificaciones.html');
  await expect(page.locator('[data-testid^="notificacion-item-"]').first()).toBeVisible();
  for (let i = 0; i < esperados.length; i += 1) {
    const tarjeta = page.getByTestId(`notificacion-item-${ids[i]}`);
    const esperado = esperados[i];
    if (esperado.href === null) {
      expect(await tarjeta.evaluate((nodo) => nodo.tagName), esperado.tipo).toBe('BUTTON');
      await expect(tarjeta.locator('.notification-item__chevron'), esperado.tipo).toHaveCount(0);
    } else {
      expect(await tarjeta.evaluate((nodo) => nodo.tagName), esperado.tipo).toBe('A');
      await expect(tarjeta, esperado.tipo).toHaveAttribute('href', esperado.href);
      if (esperado.texto) {
        await expect(tarjeta.locator('.notification-item__destino'), esperado.tipo).toHaveText(esperado.texto);
      }
    }
  }
}

test.describe('Tramo 2B, bloque 2: destinos por tipo y por rol', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let esc: Escenario;

  test.beforeAll(async ({ request }) => {
    esc = await prepararEscenario(request);
  });

  test('el Dueño: cada tipo de comercio, documentos y equipo lleva a su pantalla y los informativos solo se marcan', async ({ page }) => {
    const d = esc.dueno;
    sql(`DELETE FROM notificacion WHERE usuario_id = ${d.duenoId};`);
    await abrirComoUsuario(page, d.sesion);
    await verificar(page, d.duenoId, d.comercioId, [
      { tipo: 'COMERCIO_APROBADO', href: 'comercio-dashboard.html', texto: 'Ver panel' },
      { tipo: 'COMERCIO_APTO_VENTA', href: 'comercio-dashboard.html', texto: 'Ir al panel' },
      { tipo: 'COMERCIO_SIN_APTITUD', href: 'comercio-dashboard.html', texto: 'Ver qué falta' },
      { tipo: 'COMERCIO_SUSPENDIDO', href: 'comercio-dashboard.html', texto: 'Ver panel' },
      { tipo: 'SUSPENSION_LEVANTADA', href: 'comercio-dashboard.html', texto: 'Ver panel' },
      { tipo: 'COMERCIO_RECHAZADO', href: 'comercio-dashboard.html', texto: 'Ver panel' },
      { tipo: 'DOCUMENTO_APROBADO', href: 'comercio-documentacion.html', texto: 'Ver documentación' },
      { tipo: 'DOCUMENTO_RECHAZADO', href: 'comercio-documentacion.html', texto: 'Ver documentación' },
      { tipo: 'INVITACION_EMPLEADO', href: 'comercio-perfil.html?vista=equipo', texto: 'Ver equipo' },
      { tipo: 'EMPLEADO_DESACTIVADO', href: 'comercio-perfil.html?vista=equipo', texto: 'Ver equipo' },
      { tipo: 'COMERCIO_INACTIVADO', href: null },
    ], d.comercioId);
    await sinScrollHorizontal(page);
  });

  test('el Dueño: los avisos de pedido abren el detalle del pedido del comercio y los de reclamo dicen "Ver reclamo"', async ({ page }) => {
    const d = esc.dueno;
    sql(`DELETE FROM notificacion WHERE usuario_id = ${d.duenoId};`);
    await abrirComoUsuario(page, d.sesion);
    await verificar(page, d.duenoId, d.comercioId, [
      { tipo: 'NUEVO_PEDIDO', entidad: 'PEDIDO', href: 'comercio-pedido-detalle.html?id=777', texto: 'Ver pedido' },
      { tipo: 'PEDIDO_CANCELADO_CLIENTE', entidad: 'PEDIDO', href: 'comercio-pedido-detalle.html?id=777', texto: 'Ver pedido' },
      { tipo: 'PEDIDO_EXPIRADO_COMERCIO', entidad: 'PEDIDO', href: 'comercio-pedido-detalle.html?id=777', texto: 'Ver pedido' },
      { tipo: 'PEDIDO_AUTOCONFIRMADO_COMERCIO', entidad: 'PEDIDO', href: 'comercio-pedido-detalle.html?id=777', texto: 'Ver pedido' },
      { tipo: 'RECLAMO_REEMBOLSO_DUENO', entidad: 'PEDIDO', href: 'comercio-pedido-detalle.html?id=777', texto: 'Ver reclamo' },
    ], 777);
  });

  test('el Empleado: pedidos y suspensión del comercio llevan a pantallas que puede ver y lo del Dueño no tiene destino', async ({ page, request }) => {
    const d = esc.dueno;
    const cuenta = await registrarYVerificarCliente(request, esc.localidadId);
    await sumarAlEquipo(request, d.comercioId, cuenta, d.token);
    const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
    await abrirComoUsuarioConContexto(page, sesion, { contexto: { tipo: 'EMPLEADO', comercioId: d.comercioId } });
    await verificar(page, sesion.usuario.id, d.comercioId, [
      { tipo: 'NUEVO_PEDIDO', entidad: 'PEDIDO', href: 'comercio-pedido-detalle.html?id=778', texto: 'Ver pedido' },
      { tipo: 'COMERCIO_SUSPENDIDO_EQUIPO', href: 'comercio-dashboard.html', texto: 'Ver panel' },
      { tipo: 'COMERCIO_SUSPENSION_LEVANTADA_EQUIPO', href: 'comercio-dashboard.html', texto: 'Ver panel' },
      { tipo: 'DOCUMENTO_APROBADO', href: null },
      { tipo: 'INVITACION_EMPLEADO', href: null },
      { tipo: 'COMERCIO_APROBADO', href: null },
    ], 778);
  });

  test('el Cliente: pedidos, reclamos, carrito y cambio de cuenta tienen destino y lo informativo solo se marca', async ({ page, request }) => {
    const cliente = await nuevoCliente(request, esc.localidadId);
    await abrirComoUsuario(page, cliente.sesion);
    const id = cliente.sesion.usuario.id;
    await verificar(page, id, null, [
      { tipo: 'PEDIDO_ACEPTADO', entidad: 'PEDIDO', href: 'pedido-detalle.html?id=779', texto: 'Ver pedido' },
      { tipo: 'PEDIDO_NO_RETIRADO', entidad: 'PEDIDO', href: 'pedido-detalle.html?id=779', texto: 'Ver pedido' },
      { tipo: 'RECLAMO_APROBADO', entidad: 'PEDIDO', href: 'pedido-detalle.html?id=779', texto: 'Ver reclamo' },
      { tipo: 'RECLAMO_RECHAZADO', entidad: 'PEDIDO', href: 'pedido-detalle.html?id=779', texto: 'Ver reclamo' },
      { tipo: 'PRODUCTO_REMOVIDO_CARRITO', entidad: null, href: 'carrito.html', texto: 'Ver carrito' },
      { tipo: 'EMPLEADO_REACTIVADO', href: 'seleccionar-contexto.html', texto: 'Cambiar de cuenta' },
      { tipo: 'EMPLEADO_DESACTIVADO', href: null },
      { tipo: 'CUENTA_INACTIVADA', entidad: null, href: null },
      { tipo: 'CLIENTE_SUSPENDIDO', entidad: null, href: null },
      { tipo: 'SUSPENSION_LEVANTADA', entidad: null, href: null },
    ], 779);
    await sinScrollHorizontal(page);
  });

  test('la función de destinos: un rechazo según el estado, un tipo desconocido y un Empleado sin pantallas del Dueño', async ({ page }) => {
    await page.goto('/login.html');
    const resultados = await page.evaluate(async () => {
      const { destinoDeAviso } = await import('/js/destino-aviso.js');
      const rechazo = { tipo: 'COMERCIO_RECHAZADO', entidadTipo: 'COMERCIO', entidadId: 5 };
      return {
        rechazado: destinoDeAviso(rechazo, 'DUENO', [{ id: 5, estado: 'RECHAZADO' }]),
        definitivo: destinoDeAviso(rechazo, 'DUENO', [{ id: 5, estado: 'RECHAZO_DEFINITIVO' }]),
        operativo: destinoDeAviso(rechazo, 'DUENO', [{ id: 5, estado: 'APTO_VENTA' }]),
        sinDatos: destinoDeAviso(rechazo, 'DUENO', null),
        desconocido: destinoDeAviso({ tipo: 'TIPO_INVENTADO', entidadTipo: 'COMERCIO', entidadId: 5 }, 'DUENO'),
        desconocidoCliente: destinoDeAviso({ tipo: 'TIPO_INVENTADO', entidadTipo: null, entidadId: null }, 'CLIENTE'),
        vacio: destinoDeAviso(null, 'CLIENTE'),
        empleadoDocumentos: destinoDeAviso({ tipo: 'DOCUMENTO_APROBADO', entidadTipo: 'COMERCIO', entidadId: 5 }, 'EMPLEADO'),
        empleadoEquipo: destinoDeAviso({ tipo: 'INVITACION_EMPLEADO', entidadTipo: 'COMERCIO', entidadId: 5 }, 'EMPLEADO'),
        empleadoPanel: destinoDeAviso({ tipo: 'COMERCIO_APROBADO', entidadTipo: 'COMERCIO', entidadId: 5 }, 'EMPLEADO'),
        clienteDocumentos: destinoDeAviso({ tipo: 'DOCUMENTO_APROBADO', entidadTipo: 'COMERCIO', entidadId: 5 }, 'CLIENTE'),
      };
    });
    expect(resultados.rechazado).toEqual({ href: 'comercio-rechazado.html?id=5', texto: 'Ver comercio' });
    expect(resultados.definitivo).toEqual({ href: 'comercio-rechazo-definitivo.html?id=5', texto: 'Ver comercio' });
    expect(resultados.operativo).toEqual({ href: 'comercio-dashboard.html', texto: 'Ver panel' });
    expect(resultados.sinDatos).toEqual({ href: 'comercio-rechazado.html?id=5', texto: 'Ver comercio' });
    expect(resultados.desconocido).toBeNull();
    expect(resultados.desconocidoCliente).toBeNull();
    expect(resultados.vacio).toBeNull();
    expect(resultados.empleadoDocumentos).toBeNull();
    expect(resultados.empleadoEquipo).toBeNull();
    expect(resultados.empleadoPanel).toBeNull();
    expect(resultados.clienteDocumentos).toBeNull();
  });

  test('"Ver equipo" abre la vista de equipo del perfil con ?vista=equipo y limpia el parámetro', async ({ page }) => {
    const d = esc.dueno;
    sql(`DELETE FROM notificacion WHERE usuario_id = ${d.duenoId};`);
    const id = sembrar(d.duenoId, d.comercioId, 'INVITACION_EMPLEADO', 'COMERCIO', d.comercioId);
    await abrirComoUsuario(page, d.sesion);
    await page.goto('/notificaciones.html');
    await page.getByTestId(`notificacion-item-${id}`).click();
    await page.waitForURL('**/comercio-perfil.html**');
    await expect(page.locator('#view-equipo')).not.toHaveClass(/is-hidden/);
    await expect(page.locator('#view-principal')).toHaveClass(/is-hidden/);
    expect(page.url()).not.toContain('vista=');
    expect(sql(`SELECT leida FROM notificacion WHERE id = ${id};`)).toBe('1');
  });

  test('con ?vista=equipo un Empleado se queda en su perfil: esa vista no es suya', async ({ page, request }) => {
    const d = esc.dueno;
    const cuenta = await registrarYVerificarCliente(request, esc.localidadId);
    await sumarAlEquipo(request, d.comercioId, cuenta, d.token);
    const sesion = await login(request, cuenta.nombreUsuario, cuenta.password);
    await abrirComoUsuarioConContexto(page, sesion, { contexto: { tipo: 'EMPLEADO', comercioId: d.comercioId } });
    await page.goto('/comercio-perfil.html?vista=equipo');
    await expect(page.locator('#view-principal')).not.toHaveClass(/is-hidden/);
    await expect(page.locator('#view-equipo:not(.is-hidden)')).toHaveCount(0);
  });

  test('un pedido que no existe o no es tuyo ofrece "Ver mis pedidos" para salir', async ({ page, request }) => {
    const cliente = await nuevoCliente(request, esc.localidadId);
    await abrirComoUsuario(page, cliente.sesion);
    await page.goto('/pedido-detalle.html?id=99999999');
    await expect(page.getByTestId('estado-vacio')).toContainText('No encontramos este pedido');
    const salida = page.getByTestId('btn-ver-mis-pedidos');
    await expect(salida).toHaveText('Ver mis pedidos');
    await expect(salida).toHaveAttribute('href', 'pedidos.html');
    await salida.click();
    await page.waitForURL('**/pedidos.html');
    await sinScrollHorizontal(page);
  });
});

test.describe('Tramo 2B: el comercio B con avisos sin leer', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let esc: Escenario;
  let comercioB: number;

  test.beforeAll(async ({ request }) => {
    esc = await prepararEscenario(request);
    comercioB = await agregarComercioApto(request, esc.dueno, `Comercio B ${Date.now()}`);
  });

  test('tocar la fila de B con avisos lo activa y abre sus notificaciones, sin mezclarse con las de A', async ({ page }) => {
    const d = esc.dueno;
    sql(`DELETE FROM notificacion WHERE usuario_id = ${d.duenoId};`);
    const avisoB = sembrar(d.duenoId, comercioB, 'COMERCIO_APTO_VENTA', 'COMERCIO', comercioB);
    await abrirComoUsuarioConComercio(page, d.sesion, { comercioActivoId: d.comercioId });
    await page.goto('/notificaciones.html');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId(`notificacion-item-${avisoB}`)).toHaveCount(0);
    await expect(page.getByTestId('estado-vacio')).toBeVisible();

    await page.goto('/comercio-dashboard.html');
    await abrirPanel(page);
    await page.getByTestId(`fila-comercio-${comercioB}`).click();
    await page.waitForURL('**/notificaciones.html');
    expect((await comercioActivoEnSesion(page))?.comercioId).toBe(comercioB);
    await expect(page.getByTestId(`notificacion-item-${avisoB}`)).toBeVisible();
  });

  test('una fila sin avisos sin leer sigue abriendo el panel', async ({ page }) => {
    const d = esc.dueno;
    sql(`DELETE FROM notificacion WHERE usuario_id = ${d.duenoId};`);
    await abrirComoUsuarioConComercio(page, d.sesion, { comercioActivoId: d.comercioId });
    await page.goto('/comercio-dashboard.html');
    await abrirPanel(page);
    await page.getByTestId(`fila-comercio-${comercioB}`).click();
    await page.waitForURL('**/comercio-dashboard.html');
    expect((await comercioActivoEnSesion(page))?.comercioId).toBe(comercioB);
  });
});
