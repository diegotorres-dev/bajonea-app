import { test, expect } from './helpers/prueba';
import type { Locator, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  apiPut,
  crearCategoria,
  diaDeHoy,
  fijarPasswordAdminYLoguear,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  sufijoUnico,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import { abrirComoUsuario, agregarComercioApto, prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 375, height: 812 } });

const CARPETA_CAPTURAS = path.resolve(__dirname, '../../../docs/capturas-pulido-p1');
const MOTIVO = 'Se suspende por reiteradas quejas de clientes del barrio';
const todoElDia = () => [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];

async function captura(page: Page, nombre: string) {
  if (process.env.CAPTURAS !== '1') {
    return;
  }
  fs.mkdirSync(CARPETA_CAPTURAS, { recursive: true });
  await page.screenshot({ path: path.join(CARPETA_CAPTURAS, `${nombre}.png`) });
}

async function colores(hoja: Locator): Promise<string[]> {
  return hoja.evaluate((nodo) => {
    const prohibidos = new Set(['rgb(255, 247, 230)', 'rgb(235, 247, 238)', 'rgb(232, 245, 233)']);
    const encontrados: string[] = [];
    nodo.querySelectorAll('*').forEach((hijo) => {
      if (['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'SVG', 'PATH'].includes(hijo.tagName.toUpperCase())) return;
      const estilo = getComputedStyle(hijo);
      if (prohibidos.has(estilo.backgroundColor)) encontrados.push(`${hijo.className}: fondo ${estilo.backgroundColor}`);
      if (estilo.borderTopColor === 'rgb(242, 180, 0)' && estilo.borderTopWidth !== '0px') encontrados.push(`${hijo.className}: borde amarillo`);
    });
    return encontrados;
  });
}

async function revisarHoja(page: Page, testid: string, confirmar: string, { conDetalle }: { conDetalle: boolean }) {
  const hoja = page.getByTestId(testid);
  await expect(hoja).toBeVisible();
  expect(await colores(hoja)).toEqual([]);

  const titulo = (await page.getByTestId(`${testid}-titulo`).boundingBox())!;
  const primerTexto = hoja.locator('.cliente-modal__sub').first();
  if (await primerTexto.count()) {
    const caja = (await primerTexto.boundingBox())!;
    expect(caja.y - (titulo.y + titulo.height)).toBeGreaterThanOrEqual(6);
  }

  const detalle = hoja.locator('details.hoja__detalle').first();
  if (conDetalle) {
    await expect(detalle).toBeVisible();
    await expect(detalle).not.toHaveAttribute('open', '');
    const resumen = detalle.locator('summary');
    expect((await resumen.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(detalle.locator('.hoja__detalle-cuerpo')).toBeHidden();
    await resumen.click();
    await expect(detalle.locator('.hoja__detalle-cuerpo')).toBeVisible();
    await resumen.click();
    await expect(detalle.locator('.hoja__detalle-cuerpo')).toBeHidden();
  }

  const botonConfirmar = page.getByTestId(confirmar);
  await expect(botonConfirmar).toBeVisible();
  const cajaConfirmar = (await botonConfirmar.boundingBox())!;
  expect(cajaConfirmar.y + cajaConfirmar.height).toBeLessThanOrEqual(812);
  await sinScrollHorizontal(page);
}

test.describe('Pulido P1a, T04: hojas de suspender y levantar sin cajas amarillas, con "Ver detalle" y el pie siempre visible', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminSesion: SesionApi;
  let localidadId: string;
  let dueno: Dueno;

  test.beforeAll(async ({ request }) => {
    adminSesion = await fijarPasswordAdminYLoguear(request);
    localidadId = await obtenerLocalidadRioGrande(request);
    await crearCategoria(request, adminSesion.token, `Cat Hojas Suspension ${sufijoUnico()}`);
    dueno = await prepararAprobado(request, adminSesion.token, localidadId, true, todoElDia());
    await agregarComercioApto(request, dueno, `Segundo ${sufijoUnico()}`, todoElDia());
  });

  test('suspender a un Dueño con comercios', async ({ page }) => {
    await abrirComoUsuario(page, adminSesion);
    await page.goto('/admin-duenos.html');
    await page.getByTestId('input-buscar-dueno').fill(dueno.email);
    await page.getByTestId(`btn-acciones-dueno-${dueno.duenoId}`).click();
    await page.getByTestId('accion-suspender-dueno').click();
    await revisarHoja(page, 'modal-suspender-dueno', 'btn-confirmar-suspender-dueno', { conDetalle: true });
    await expect(page.getByTestId('btn-confirmar-suspender-dueno')).toHaveClass(/btn-peligro/);
    await expect(page.getByTestId('btn-cancelar-suspender-dueno')).toHaveClass(/btn-secondary/);
    await captura(page, '01-suspender-dueno');
  });

  test('levantar a un Dueño suspendido', async ({ page, request }) => {
    const { status } = await apiPut(request, `/administrador/duenos/${dueno.duenoId}/suspender`, { motivo: MOTIVO }, adminSesion.token);
    expect(status).toBe(200);
    await abrirComoUsuario(page, adminSesion);
    await page.goto('/admin-duenos.html');
    await page.getByTestId('input-buscar-dueno').fill(dueno.email);
    await page.getByTestId(`btn-acciones-dueno-${dueno.duenoId}`).click();
    await page.getByTestId('accion-levantar-dueno').click();
    await revisarHoja(page, 'modal-levantar-dueno', 'btn-confirmar-levantar-dueno', { conDetalle: true });
    await expect(page.getByTestId('btn-confirmar-levantar-dueno')).toHaveClass(/btn-primary/);
    await captura(page, '02-levantar-dueno');
  });

  test('suspender y levantar un comercio', async ({ page, request }) => {
    const levantado = await apiPut(request, `/administrador/duenos/${dueno.duenoId}/levantar-suspension`, {}, adminSesion.token);
    expect(levantado.status).toBe(200);
    await abrirComoUsuario(page, adminSesion);
    await page.goto('/admin-comercios.html');
    await page.getByTestId(`btn-ver-detalle-comercio-${dueno.comercioId}`).click();
    await expect(page.getByTestId('modal-detalle-comercio')).toBeVisible();
    await page.getByTestId('btn-suspender-comercio').click();
    await revisarHoja(page, 'modal-suspender-comercio', 'btn-confirmar-suspender-comercio', { conDetalle: false });
    await expect(page.getByTestId('btn-confirmar-suspender-comercio')).toHaveClass(/btn-peligro/);
    await captura(page, '03-suspender-comercio');
    await page.getByTestId('input-suspender-comercio-motivo').fill(MOTIVO);
    await page.getByTestId('btn-confirmar-suspender-comercio').click();
    await expect(page.locator('.toast')).toContainText('Comercio suspendido');
    await page.reload();
    await page.getByTestId(`btn-ver-detalle-comercio-${dueno.comercioId}`).click();

    await page.getByTestId('btn-levantar-suspension-comercio').click();
    await revisarHoja(page, 'modal-levantar-suspension-comercio', 'btn-confirmar-levantar-comercio', { conDetalle: true });
    await captura(page, '04-levantar-comercio');
  });

  test('suspender y levantar a un Cliente', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const id = Number(sql(`SELECT id FROM usuario WHERE email = '${cliente.email}';`));
    await abrirComoUsuario(page, adminSesion);
    await page.goto('/admin-clientes.html');
    await page.getByTestId('input-buscar-cliente').fill(cliente.email);
    await page.getByTestId(`btn-acciones-cliente-${id}`).click();
    await page.getByTestId(`accion-suspender-${id}`).click();
    await revisarHoja(page, 'modal-suspender-cliente', 'btn-confirmar-suspender', { conDetalle: true });
    await expect(page.getByTestId('btn-confirmar-suspender')).toHaveClass(/btn-peligro/);
    await captura(page, '05-suspender-cliente');
    await page.getByTestId('input-suspender-motivo').fill(MOTIVO);
    await page.getByTestId('btn-confirmar-suspender').click();
    await expect(page.locator('.toast')).toContainText('Cuenta suspendida');

    await expect(page.getByTestId('modal-suspender-cliente')).toHaveCount(0);
    await expect(async () => {
      await page.keyboard.press('Escape');
      await page.getByTestId(`btn-acciones-cliente-${id}`).click({ timeout: 3000 });
      await expect(page.getByTestId(`accion-levantar-${id}`)).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 20_000 });
    await page.getByTestId(`accion-levantar-${id}`).click();
    await revisarHoja(page, 'modal-levantar-suspension', 'btn-confirmar-levantar', { conDetalle: true });
    await captura(page, '06-levantar-cliente');
  });
});
