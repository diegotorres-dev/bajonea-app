import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { apiPost, diaDeHoy, fijarPasswordAdminYLoguear, login, obtenerLocalidadRioGrande, registrarYVerificarCliente } from './helpers/backend';
import type { ClienteRegistrado, SesionApi } from './helpers/backend';
import { abrirComoUsuarioConContexto, sumarAlEquipo } from './helpers/empleado';
import { abrirComoUsuario, capturar, prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';

test.use({ viewport: { width: 390, height: 844 } });

const NOMBRE_MUY_LARGO = 'Maximiliano Alejandro Bartolomé de la Santísima Trinidad y Todos los Santos';

function sinNombre(sesion: SesionApi): SesionApi {
  return { token: sesion.token, usuario: { id: sesion.usuario.id, rol: sesion.usuario.rol } };
}

function conNombre(sesion: SesionApi, nombre: string): SesionApi {
  return { token: sesion.token, usuario: { ...sesion.usuario, nombre } };
}

async function nombreEnLaSesion(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const crudo = localStorage.getItem('bajonea_usuario');
    return crudo ? JSON.parse(crudo).nombre : undefined;
  });
}

test.describe('El login devuelve el nombre de pila y el saludo lo usa (tramo B1), en móvil', () => {
  test.describe.configure({ timeout: 240_000 });
  let dueno: Dueno;
  let cliente: ClienteRegistrado;
  let empleado: ClienteRegistrado;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000);
    const adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    const localidadId = await obtenerLocalidadRioGrande(request);
    const horarios = [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
    dueno = await prepararAprobado(request, adminToken, localidadId, true, horarios);
    cliente = await registrarYVerificarCliente(request, localidadId);
    empleado = await registrarYVerificarCliente(request, localidadId);
    await sumarAlEquipo(request, dueno.comercioId, empleado, dueno.token);
  });

  const sesionDueno = (page: Page) => login(page.request, dueno.nombreUsuario, dueno.password);
  const sesionCliente = (page: Page) => login(page.request, cliente.nombreUsuario, cliente.password);

  test('la respuesta del login trae el nombre de pila de cada rol y de nadie más', async ({ request }) => {
    const respuestaDueno = await apiPost(request, '/auth/login', { nombreUsuario: dueno.nombreUsuario, password: dueno.password });
    expect(respuestaDueno.body.data.usuario.nombre).toBe('Representante');
    const respuestaCliente = await apiPost(request, '/auth/login', { nombreUsuario: cliente.nombreUsuario, password: cliente.password });
    expect(respuestaCliente.body.data.usuario.nombre).toBe(cliente.nombre);
    const respuestaEmpleado = await apiPost(request, '/auth/login', { nombreUsuario: empleado.nombreUsuario, password: empleado.password });
    expect(respuestaEmpleado.body.data.usuario.nombre).toBe(empleado.nombre);
    const campos = Object.keys(respuestaCliente.body.data.usuario).sort();
    expect(campos).toEqual(['email', 'estado', 'fotoPerfilUrl', 'id', 'nombre', 'rol']);
    const error = await apiPost(request, '/auth/login', { nombreUsuario: cliente.nombreUsuario, password: 'Incorrecta1' });
    expect(error.status).toBe(401);
    expect(JSON.stringify(error.body)).not.toContain(cliente.nombre);
  });

  test('el login por la pantalla guarda el nombre en la sesión del navegador', async ({ page }) => {
    await page.goto('/login.html');
    await page.getByTestId('input-nombre-usuario').fill(cliente.nombreUsuario);
    await page.getByTestId('input-password').fill(cliente.password);
    await page.getByTestId('btn-ingresar').click();
    await page.waitForURL('**/index.html');
    expect(await nombreEnLaSesion(page)).toBe(cliente.nombre);
    await expect(page.getByTestId('mensaje-saludo')).toHaveText(`Hola, ${cliente.nombre} 👋`);
  });

  test.describe('saludo del panel del comercio', () => {
    test('el Dueño ve «Hola, {nombre} 👋» con el nombre de pila de su cuenta', async ({ page }) => {
      await abrirComoUsuario(page, await sesionDueno(page));
      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('mensaje-saludo')).toHaveText('Hola, Representante 👋');
      await capturar(page, 'movil-dueno-saludo');
      await expect(page.getByTestId('mensaje-saludo')).not.toContainText(dueno.nombre);
      await sinScrollHorizontal(page);
    });

    test('el Empleado ve el nombre de su propia cuenta y no el del Dueño', async ({ page }) => {
      await abrirComoUsuarioConContexto(page, await login(page.request, empleado.nombreUsuario, empleado.password), {
        contexto: { tipo: 'EMPLEADO', comercioId: dueno.comercioId },
        ultimoContexto: `EMPLEADO:${dueno.comercioId}`,
      });
      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('mensaje-saludo')).toHaveText(`Hola, ${empleado.nombre} 👋`);
    });

    test('sin nombre en la sesión el saludo queda en «Hola 👋»', async ({ page }) => {
      await abrirComoUsuario(page, sinNombre(await sesionDueno(page)));
      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('mensaje-saludo')).toHaveText('Hola 👋');
      await expect(page.getByTestId('saludo-nombre')).toHaveCount(0);
    });

    test('un nombre larguísimo se corta con puntos suspensivos, conserva el nombre completo y no rompe el layout', async ({ page }) => {
      await abrirComoUsuario(page, conNombre(await sesionDueno(page), NOMBRE_MUY_LARGO));
      await page.goto('/comercio-dashboard.html');
      const saludo = page.getByTestId('mensaje-saludo');
      await expect(saludo).toContainText('Hola, Maximiliano');
      await expect(saludo).toContainText('👋');
      const nombre = page.getByTestId('saludo-nombre');
      await expect(nombre).toHaveAttribute('title', /^Maximiliano Alejandro Bartolomé .* Santos$/);
      const medidas = await nombre.evaluate((nodo) => ({
        corta: nodo.scrollWidth > nodo.clientWidth,
        overflow: getComputedStyle(nodo).textOverflow,
      }));
      expect(medidas.corta).toBe(true);
      expect(medidas.overflow).toBe('ellipsis');
      const alto = await saludo.evaluate((nodo) => ({ caja: nodo.getBoundingClientRect().height, linea: parseFloat(getComputedStyle(nodo).lineHeight) || parseFloat(getComputedStyle(nodo).fontSize) * 1.3 }));
      expect(alto.caja).toBeLessThan(alto.linea * 1.5);
      await capturar(page, 'movil-saludo-nombre-largo');
      await sinScrollHorizontal(page);
    });

    test('el nombre se pinta como texto, nunca como HTML', async ({ page }) => {
      await abrirComoUsuario(page, conNombre(await sesionDueno(page), '<img src=x onerror=alert(1)>'));
      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('saludo-nombre')).toContainText(/img src/i);
      await expect(page.getByTestId('mensaje-saludo').locator('img')).toHaveCount(0);
    });
  });

  test.describe('saludo del Cliente', () => {
    test('el catálogo saluda con el nombre guardado en la sesión aunque el perfil devuelva otro o falle', async ({ page }) => {
      await page.route('**/clientes/perfil', (ruta) => ruta.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ mensaje: 'ok', data: { nombre: 'Otronombre', apellido: 'Distinto', email: 'x@bajonea.test', telefono: '+5492964000000', fotoPerfilUrl: null } }),
      }));
      await abrirComoUsuarioConContexto(page, await sesionCliente(page));
      await page.goto('/index.html');
      await expect(page.getByTestId('mensaje-saludo')).toHaveText(`Hola, ${cliente.nombre} 👋`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('mensaje-saludo')).not.toContainText('Otronombre');
    });

    test('el saludo aparece antes de cualquier respuesta del perfil', async ({ page }) => {
      await page.route('**/clientes/perfil', () => new Promise(() => {}));
      await abrirComoUsuarioConContexto(page, await sesionCliente(page));
      await page.goto('/index.html');
      await expect(page.getByTestId('mensaje-saludo')).toHaveText(`Hola, ${cliente.nombre} 👋`);
    });

    test('sin nombre en la sesión el catálogo saluda con «Hola 👋»', async ({ page }) => {
      await abrirComoUsuario(page, sinNombre(await sesionCliente(page)));
      await page.goto('/index.html');
      await expect(page.getByTestId('mensaje-saludo')).toHaveText('Hola 👋');
    });

    test('al cambiar el nombre en el perfil la sesión se actualiza y el saludo lo refleja', async ({ page }) => {
      await abrirComoUsuarioConContexto(page, await sesionCliente(page));
      await page.goto('/perfil.html');
      await expect(page.getByTestId('nombre-cliente-perfil')).not.toHaveText('');
      await page.getByTestId('btn-editar-datos').click();
      await page.getByTestId('input-nombre').fill('Renombrada');
      await page.getByTestId('btn-guardar-datos').click();
      await expect(page.getByTestId('nombre-cliente-perfil')).toContainText('Renombrada');
      await expect.poll(() => nombreEnLaSesion(page)).toBe('Renombrada');
      await page.goto('/index.html');
      await expect(page.getByTestId('mensaje-saludo')).toHaveText('Hola, Renombrada 👋');
    });

    test('una sesión sin nombre se completa al abrir el perfil', async ({ page }) => {
      const otro = await registrarYVerificarCliente(page.request, await obtenerLocalidadRioGrande(page.request));
      const sesion = await login(page.request, otro.nombreUsuario, otro.password);
      await abrirComoUsuarioConContexto(page, sinNombre(sesion));
      await page.goto('/perfil.html');
      await expect(page.getByTestId('nombre-cliente-perfil')).not.toHaveText('');
      await expect.poll(() => nombreEnLaSesion(page)).toBe(otro.nombre);
    });
  });
});
