import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { diaDeHoy, fijarPasswordAdminYLoguear, login, obtenerLocalidadRioGrande, registrarYVerificarCliente } from './helpers/backend';
import type { ClienteRegistrado, SesionApi } from './helpers/backend';
import { abrirComoUsuarioConContexto, sumarAlEquipo } from './helpers/empleado';
import { abrirComoUsuario, capturar, prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { caja, sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 1440, height: 900 } });

const NOMBRE_MUY_LARGO = 'Maximiliano Alejandro Bartolomé de la Santísima Trinidad y Todos los Santos';

function sinNombre(sesion: SesionApi): SesionApi {
  return { token: sesion.token, usuario: { id: sesion.usuario.id, rol: sesion.usuario.rol } };
}

function conNombre(sesion: SesionApi, nombre: string): SesionApi {
  return { token: sesion.token, usuario: { ...sesion.usuario, nombre } };
}

function registrarPeticionesDePerfil(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (peticion) => {
    if (/\/(clientes|comercios)\/perfil(\?|$)/.test(peticion.url())) {
      urls.push(`${peticion.method()} ${new URL(peticion.url()).pathname}`);
    }
  });
  return urls;
}

test.describe('Escritorio B1: el pie de la barra lateral usa el nombre de la sesión @escritorio', () => {
  test.describe.configure({ timeout: 240_000 });
  let dueno: Dueno;
  let empleado: ClienteRegistrado;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000);
    const adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    const localidadId = await obtenerLocalidadRioGrande(request);
    const horarios = [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
    dueno = await prepararAprobado(request, adminToken, localidadId, true, horarios);
    empleado = await registrarYVerificarCliente(request, localidadId);
    await sumarAlEquipo(request, dueno.comercioId, empleado, dueno.token);
  });

  async function abrirEmpleado(page: Page, transformar: (sesion: SesionApi) => SesionApi = (sesion) => sesion) {
    const sesion = transformar(await login(page.request, empleado.nombreUsuario, empleado.password));
    await abrirComoUsuarioConContexto(page, sesion, {
      contexto: { tipo: 'EMPLEADO', comercioId: dueno.comercioId },
      ultimoContexto: `EMPLEADO:${dueno.comercioId}`,
    });
  }

  test('el Dueño ve su nombre de pila y el avatar con su inicial, sin pedir el perfil del comercio por el pie @escritorio', async ({ page }) => {
    const peticiones = registrarPeticionesDePerfil(page);
    await abrirComoUsuario(page, dueno.sesion);
    await page.goto('/comercio-pedidos.html');
    await expect(page.getByTestId('persona-lateral-nombre')).toHaveText('Representante');
    await expect(page.getByTestId('persona-lateral-rol')).toHaveText('Dueño');
    await expect(page.getByTestId('persona-lateral').locator('.persona__avatar')).toHaveText('R');
    await page.waitForLoadState('networkidle');
    expect(peticiones.filter((url) => url.includes('/comercios/perfil'))).toEqual([]);
  });

  test('el Empleado ve su nombre de pila sin pedir el perfil de Cliente @escritorio', async ({ page }) => {
    const peticiones = registrarPeticionesDePerfil(page);
    await abrirEmpleado(page);
    await page.goto('/comercio-pedidos.html');
    await expect(page.getByTestId('persona-lateral-nombre')).toHaveText(empleado.nombre);
    await expect(page.getByTestId('persona-lateral-rol')).toHaveText('Empleado');
    await page.waitForLoadState('networkidle');
    expect(peticiones).toEqual([]);
  });

  test('el panel del Empleado tampoco pide el perfil de Cliente y el saludo y el pie muestran el mismo nombre @escritorio', async ({ page }) => {
    const peticiones = registrarPeticionesDePerfil(page);
    await abrirEmpleado(page);
    await page.goto('/comercio-dashboard.html');
    await expect(page.getByTestId('mensaje-saludo')).toHaveText(`Hola, ${empleado.nombre} 👋`);
    await expect(page.getByTestId('persona-lateral-nombre')).toHaveText(empleado.nombre);
    await page.waitForLoadState('networkidle');
    expect(peticiones.filter((url) => url.includes('/clientes/perfil'))).toEqual([]);
  });

  test('el saludo del panel del Dueño mantiene su tipografía y ahora lleva el nombre @escritorio', async ({ page }) => {
    await abrirComoUsuario(page, dueno.sesion);
    await page.goto('/comercio-dashboard.html');
    await expect(page.getByTestId('mensaje-saludo')).toHaveText('Hola, Representante 👋');
    await capturar(page, 'escritorio-panel-dueno');
    expect(await page.getByTestId('mensaje-saludo').evaluate((nodo) => getComputedStyle(nodo).fontSize)).toBe('34px');
    await sinScrollHorizontal(page);
  });

  test('sin nombre en la sesión el pie muestra el rol y un avatar neutro, y el panel saluda sin nombre @escritorio', async ({ page }) => {
    await abrirComoUsuario(page, sinNombre(dueno.sesion));
    await page.goto('/comercio-dashboard.html');
    await expect(page.getByTestId('persona-lateral-nombre')).toHaveText('Dueño');
    await expect(page.getByTestId('persona-lateral').locator('.persona__avatar')).toHaveText('?');
    await expect(page.getByTestId('mensaje-saludo')).toHaveText('Hola 👋');
  });

  test('sin nombre el Empleado ve «Empleado» en el pie @escritorio', async ({ page }) => {
    await abrirEmpleado(page, sinNombre);
    await page.goto('/comercio-dashboard.html');
    await expect(page.getByTestId('persona-lateral-nombre')).toHaveText('Empleado');
    await expect(page.getByTestId('mensaje-saludo')).toHaveText('Hola 👋');
  });

  test('un nombre larguísimo se corta con puntos suspensivos en el pie, con el nombre completo accesible y sin desbordar @escritorio', async ({ page }) => {
    await abrirComoUsuario(page, conNombre(dueno.sesion, NOMBRE_MUY_LARGO));
    await page.goto('/comercio-dashboard.html');
    const nombre = page.getByTestId('persona-lateral-nombre');
    await expect(nombre).toBeVisible();
    await expect(nombre).toHaveAttribute('title', /Maximiliano Alejandro/);
    const medidas = await nombre.evaluate((nodo) => ({ corta: nodo.scrollWidth > nodo.clientWidth, overflow: getComputedStyle(nodo).textOverflow }));
    expect(medidas.corta).toBe(true);
    expect(medidas.overflow).toBe('ellipsis');
    const lateral = await caja(page.locator('#bottom-nav-slot'));
    const persona = await caja(page.getByTestId('persona-lateral'));
    expect(persona.x + persona.width).toBeLessThanOrEqual(lateral.x + lateral.width);
    expect((await caja(page.getByTestId('btn-lateral-cerrar-sesion'))).height).toBeGreaterThanOrEqual(44);
    await expect(page.getByTestId('mensaje-saludo')).toContainText('👋');
    await capturar(page, 'escritorio-pie-nombre-largo');
    await sinScrollHorizontal(page);
  });

  test('el nombre del pie se pinta como texto, nunca como HTML @escritorio', async ({ page }) => {
    await abrirComoUsuario(page, conNombre(dueno.sesion, '<b>Negrita</b>'));
    await page.goto('/comercio-dashboard.html');
    await expect(page.getByTestId('persona-lateral-nombre')).toContainText('<');
    await expect(page.getByTestId('persona-lateral-nombre').locator('b')).toHaveCount(0);
  });
});
