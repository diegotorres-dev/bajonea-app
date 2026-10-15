import path from 'node:path';
import { readFileSync } from 'node:fs';
import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  apiConHeaders,
  crearCategoria,
  crearProducto,
  diaDeHoy,
  esperarImagenCargadaEnRecorte,
  fijarPasswordAdminYLoguear,
  login,
  nombreArchivoFixture,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  sqlTest as sql,
  subirImagenProductoDirecto,
  sufijoUnico,
} from './helpers/backend';
import type { SesionApi } from './helpers/backend';
import { abrirComoUsuarioConContexto, contextoEnSesion, ponerEstadoComercio, sumarAlEquipo } from './helpers/empleado';
import { abrirComoUsuarioConComercio } from './helpers/selector';
import { prepararAprobado } from './helpers/multicomercio';
import type { Dueno } from './helpers/multicomercio';
import { sinScrollHorizontal } from './helpers/layout';

const HEADER = 'X-Comercio-Id';
const FIXTURE_BUFFER = readFileSync(path.resolve(__dirname, '../fixtures/bajonea-e2e-producto.png'));
const TITULO_HOJA = 'Vas a pasar a tu cuenta personal';
const TEXTO_HOJA = 'Para editar tus datos personales vas a salir de este comercio y entrar a tu cuenta de Cliente.';
const TITULO_BLOQUEADOS = 'Solo el Dueño puede cambiarlos';

interface Persona {
  sesion: SesionApi;
}

test.use({ viewport: { width: 375, height: 812 } });

test.describe('Edición del comercio, productos y cierre para el Empleado, E3 entrega B etapa 2', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let adminToken: string;
  let localidadId: string;
  let categoriaId: number;
  let dueno: Dueno;
  let productoConFoto: number;
  let elena: Persona;

  const conComercio = (): Record<string, string> => ({ [HEADER]: String(dueno.comercioId) });
  const datosDelComercio = async (request: APIRequestContext) =>
    (await apiConHeaders(request, 'GET', '/comercios/perfil', dueno.token, conComercio())).body.data;

  async function abrirComoEmpleado(page: Page) {
    await abrirComoUsuarioConContexto(page, elena.sesion, {
      contexto: { tipo: 'EMPLEADO', comercioId: dueno.comercioId },
      ultimoContexto: `EMPLEADO:${dueno.comercioId}`,
    });
  }

  async function abrirComoDueno(page: Page) {
    await abrirComoUsuarioConComercio(page, dueno.sesion, { comercioActivoId: dueno.comercioId, ultimoComercioId: dueno.comercioId });
  }

  async function abrirEdicionDelComercio(page: Page) {
    await page.goto('/comercio-perfil.html');
    await expect(page.getByTestId('btn-editar-datos-comercio')).toBeEnabled();
    await page.getByTestId('btn-editar-datos-comercio').click();
    await expect(page.getByTestId('input-empleado-telefono')).toBeVisible();
  }

  function restaurarComercio() {
    ponerEstadoComercio(dueno.comercioId, 'APTO_VENTA');
    sql(`UPDATE comercio SET cerrado_manualmente = 0 WHERE id = ${dueno.comercioId};`);
  }

  test.beforeAll(async ({ request }) => {
    adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    localidadId = await obtenerLocalidadRioGrande(request);
    categoriaId = await crearCategoria(request, adminToken, `Cat E3B2 ${sufijoUnico()}`);
    const horarios = [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
    dueno = await prepararAprobado(request, adminToken, localidadId, true, horarios);
    productoConFoto = await crearProducto(request, dueno.token, { nombre: `Producto E3B2 ${sufijoUnico()}`, precio: 4200, categoriaId });
    await subirImagenProductoDirecto(request, dueno.token, productoConFoto, FIXTURE_BUFFER, { orden: 0, esPrincipal: true });
    const registro = await registrarYVerificarCliente(request, localidadId);
    await sumarAlEquipo(request, dueno.comercioId, registro, dueno.token);
    elena = { sesion: await login(request, registro.nombreUsuario, registro.password) };
  });

  test.afterEach(() => {
    restaurarComercio();
  });

  test.describe('Perfil del Empleado', () => {
    test('es una lista plana de cinco filas, con la única sección "Mi lugar en el equipo", sin "Cambiar contraseña" ni su vista, y sin ids repetidos en la página', async ({ page }) => {
      await abrirComoEmpleado(page);
      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('btn-ver-datos-comercio')).toBeEnabled();

      await expect(page.getByTestId('lista-perfil').locator('.profile-link')).toHaveText([
        'Ver datos del comercio',
        'Editar datos del comercio',
        'Editar datos personales',
        'Cambiar de cuenta',
        'Cerrar sesión',
      ]);
      await expect(page.locator('.profile-section__title')).toHaveText(['Mi lugar en el equipo']);
      await expect(page.getByTestId('btn-cambiar-password')).toHaveCount(0);
      await expect(page.locator('#cambiar-password-link, #view-cambiar-password, #view-editar-datos')).toHaveCount(0);
      const repetidos = await page.evaluate(() => {
        const vistos = new Set<string>();
        const repetidosEncontrados: string[] = [];
        document.querySelectorAll('[id]').forEach((nodo) => {
          if (vistos.has(nodo.id)) repetidosEncontrados.push(nodo.id);
          vistos.add(nodo.id);
        });
        return repetidosEncontrados;
      });
      expect(repetidos).toEqual([]);
      await sinScrollHorizontal(page);
    });

    test('"Editar datos del comercio" muestra descripción y teléfono editables y cinco filas con candado bajo "Solo el Dueño puede cambiarlos"', async ({ page, request }) => {
      const comercio = await datosDelComercio(request);
      await abrirComoEmpleado(page);
      await abrirEdicionDelComercio(page);

      await expect(page.getByTestId('input-empleado-descripcion')).toBeEditable();
      await expect(page.getByTestId('input-empleado-telefono')).toBeEditable();
      await expect(page.getByTestId('input-empleado-telefono')).toHaveValue(String(comercio.telefono).replace(/^\+549/, ''));
      await expect(page.getByTestId('btn-guardar-datos-comercio')).toBeEnabled();
      await expect(page.getByTestId('titulo-campos-bloqueados')).toHaveText(TITULO_BLOQUEADOS);
      const filas = page.getByTestId('campos-bloqueados').locator('.campo-bloqueado');
      await expect(filas).toHaveCount(5);
      await expect(filas.locator('.field__label')).toHaveText(['Nombre', 'Foto', 'Dirección', 'Email de contacto', 'Modalidades de entrega']);
      await expect(page.getByTestId('campo-bloqueado-nombre')).toContainText(dueno.nombre);
      await expect(page.getByTestId('campo-bloqueado-direccion')).not.toContainText('undefined');
      await expect(page.getByTestId('campo-bloqueado-email')).toContainText(String(comercio.emailContacto));
      await expect(page.getByTestId('campo-bloqueado-modalidades')).not.toBeEmpty();
      for (let i = 0; i < 5; i += 1) {
        await expect(filas.nth(i).locator('svg')).toHaveCount(1);
      }
      await expect(page.getByTestId('campos-bloqueados').locator('input, textarea, select, button')).toHaveCount(0);
      await expect(page.getByTestId('btn-nav-perfil')).toBeVisible();
      await sinScrollHorizontal(page);
    });

    test('al guardar manda un solo PUT a datos-operativos con solo descripción y teléfono, actualiza la vista y vuelve a la lista', async ({ page, request }) => {
      const descripcion = `Descripción editada por el equipo ${sufijoUnico()}`;
      const telefono = `2964${String(Date.now()).slice(-6)}`;
      const puts: Array<{ url: string; cuerpo: Record<string, unknown> }> = [];
      page.on('request', (peticion) => {
        if (peticion.method() === 'PUT' && peticion.url().includes('/comercios/')) {
          puts.push({ url: new URL(peticion.url()).pathname, cuerpo: peticion.postDataJSON() });
        }
      });
      await abrirComoEmpleado(page);
      await abrirEdicionDelComercio(page);

      await page.getByTestId('input-empleado-descripcion').fill(descripcion);
      await page.getByTestId('input-empleado-telefono').fill(telefono);
      await page.getByTestId('btn-guardar-datos-comercio').click();

      await expect(page.locator('.toast')).toContainText('Datos actualizados correctamente');
      await expect(page.getByTestId('lista-perfil')).toBeVisible();
      expect(puts).toHaveLength(1);
      expect(puts[0].url).toBe('/api/v1/comercios/perfil/datos-operativos');
      expect(Object.keys(puts[0].cuerpo).sort()).toEqual(['descripcion', 'telefono']);
      expect(puts[0].cuerpo).toEqual({ descripcion, telefono: `+549${telefono}` });
      const guardado = await datosDelComercio(request);
      expect(guardado.descripcion).toBe(descripcion);
      expect(guardado.telefono).toBe(`+549${telefono}`);

      await page.getByTestId('btn-ver-datos-comercio').click();
      await expect(page.getByTestId('empleado-descripcion')).toHaveText(descripcion);
      await expect(page.getByTestId('empleado-telefono')).toHaveText(`+549${telefono}`);
    });

    test('valida el teléfono vacío y mal formado sin llamar al servidor', async ({ page }) => {
      let llamadas = 0;
      page.on('request', (peticion) => {
        if (peticion.method() === 'PUT' && peticion.url().includes('datos-operativos')) llamadas += 1;
      });
      await abrirComoEmpleado(page);
      await abrirEdicionDelComercio(page);

      await page.getByTestId('input-empleado-telefono').fill('');
      await page.getByTestId('btn-guardar-datos-comercio').click();
      await expect(page.getByTestId('mensaje-error-empleado-telefono')).toHaveText('Ingresá el teléfono del comercio.');
      await page.getByTestId('input-empleado-telefono').fill('123');
      await page.getByTestId('btn-guardar-datos-comercio').click();
      await expect(page.getByTestId('mensaje-error-empleado-telefono')).toHaveText('Ingresá un teléfono argentino válido (código de área + número).');
      expect(llamadas).toBe(0);
    });

    test('con el comercio suspendido el 409 del servidor sale en un aviso fijo y no cambia nada', async ({ page, request }) => {
      const antes = await datosDelComercio(request);
      ponerEstadoComercio(dueno.comercioId, 'SUSPENDIDO');
      const mensaje = (await apiConHeaders(request, 'PUT', '/comercios/perfil/datos-operativos', elena.sesion.token, conComercio(), { descripcion: 'x', telefono: '+5492964111111' })).body.mensaje as string;
      expect(mensaje.length).toBeGreaterThan(10);
      await abrirComoEmpleado(page);
      await abrirEdicionDelComercio(page);

      await page.getByTestId('input-empleado-descripcion').fill('Intento con el comercio suspendido');
      await page.getByTestId('btn-guardar-datos-comercio').click();

      const aviso = page.getByTestId('mensaje-banner-editar-datos-comercio').getByTestId('aviso-fijo');
      await expect(aviso.getByTestId('aviso-fijo-texto')).toHaveText(mensaje);
      await expect(page.locator('.toast')).toHaveCount(0);
      await expect(page.getByTestId('btn-guardar-datos-comercio')).toBeEnabled();
      const despues = await datosDelComercio(request);
      expect(despues.descripcion).toBe(antes.descripcion);
      await sinScrollHorizontal(page);
    });

    test('"Editar datos personales" abre la hoja con su título y sus dos botones; Cancelar la cierra sin cambiar nada', async ({ page }) => {
      await abrirComoEmpleado(page);
      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('btn-editar-datos')).toBeEnabled();

      await page.getByTestId('btn-editar-datos').click();

      const hoja = page.getByTestId('modal-cuenta-personal');
      await expect(hoja.getByRole('heading')).toHaveText(TITULO_HOJA);
      await expect(hoja).toContainText(TEXTO_HOJA);
      await expect(page.getByTestId('btn-continuar-cuenta-personal')).toHaveText('Continuar');
      await expect(page.getByTestId('btn-cancelar-cuenta-personal')).toHaveText('Cancelar');
      await sinScrollHorizontal(page);

      await page.getByTestId('btn-cancelar-cuenta-personal').click();

      await expect(hoja).toHaveCount(0);
      expect(page.url()).toContain('comercio-perfil.html');
      expect(await contextoEnSesion(page)).toMatchObject({ tipo: 'EMPLEADO', comercioId: dueno.comercioId });
      await expect(page.getByTestId('lista-perfil')).toBeVisible();
    });

    test('"Continuar" pasa a la cuenta de Cliente y llega a perfil.html, donde está "Editar datos personales"', async ({ page }) => {
      await abrirComoEmpleado(page);
      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('btn-editar-datos')).toBeEnabled();
      await page.getByTestId('btn-editar-datos').click();

      await page.getByTestId('btn-continuar-cuenta-personal').click();

      await page.waitForURL('**/perfil.html');
      expect(await contextoEnSesion(page)).toMatchObject({ tipo: 'CLIENTE', comercioId: null });
      await expect(page.getByTestId('nombre-cliente-perfil')).not.toBeEmpty();
      await expect(page.getByTestId('btn-editar-datos')).toBeEnabled();
      await expect(page.getByTestId('btn-cambiar-cuenta')).toBeEnabled();
      await sinScrollHorizontal(page);
    });

    test('el perfil del Dueño no cambia: edita todo el comercio, conserva "Cambiar contraseña" y no tiene la fila ni la vista del Empleado', async ({ page }) => {
      await abrirComoDueno(page);
      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('btn-editar-perfil-comercio')).toBeEnabled();

      await expect(page.getByTestId('btn-editar-datos-comercio')).toHaveCount(0);
      await expect(page.getByTestId('btn-cambiar-password')).toBeVisible();
      await expect(page.locator('#view-editar-datos-comercio, #view-editar-datos')).toHaveCount(0);
      await page.getByTestId('btn-editar-perfil-comercio').click();
      await expect(page.getByTestId('input-nombre')).toHaveValue(dueno.nombre);
      await expect(page.getByTestId('input-nombre')).toBeEditable();
      await expect(page.getByTestId('input-email-contacto')).toBeEditable();
      await expect(page.getByTestId('btn-switch-delivery')).toBeVisible();
      await expect(page.locator('#editar-nombre, #editar-telefono, #editar-banner-slot')).toHaveCount(3);
    });
  });

  test.describe('Productos', () => {
    test('el Empleado ve el botón para crear y el menú de cada producto, y cambia el estado desde el menú', async ({ page, request }) => {
      const productoId = await crearProducto(request, dueno.token, { nombre: `Producto Estado E3B2 ${sufijoUnico()}`, precio: 3100, categoriaId });
      await abrirComoEmpleado(page);
      await page.goto('/comercio-productos.html');

      await expect(page.getByTestId('btn-crear-producto')).toBeVisible();
      await expect(page.getByTestId(`btn-acciones-producto-${productoId}`)).toBeVisible();
      await page.getByTestId(`btn-acciones-producto-${productoId}`).click();
      await expect(page.getByTestId('modal-acciones-producto')).toBeVisible();
      await sinScrollHorizontal(page);
      await page.getByTestId('btn-cambiar-estado-producto').click();

      await expect(page.locator('.toast')).toContainText('Estado del producto actualizado');
      expect(sql(`SELECT estado FROM producto WHERE id = ${productoId};`)).toBe('AGOTADO');
      expect(sql(`SELECT COUNT(*) FROM historial_edicion_comercio WHERE comercio_id = ${dueno.comercioId} AND entidad_id = ${productoId} AND actor_rol = 'EMPLEADO';`)).not.toBe('0');
    });

    test('edita un producto desde el formulario, que abre para el Empleado, y vuelve a la lista con el aviso de éxito', async ({ page, request }) => {
      await abrirComoEmpleado(page);
      await page.goto(`/comercio-producto-form.html?id=${productoConFoto}`);
      await expect(page.getByTestId('btn-guardar-producto')).toHaveText('Guardar cambios');
      await expect(page.getByTestId('input-nombre-producto')).not.toHaveValue('');
      await expect(page.getByTestId('btn-guardar-producto')).toBeEnabled();

      await page.getByTestId('input-precio-producto').fill('5300');
      await page.getByTestId('btn-guardar-producto').click();

      await page.waitForURL(/comercio-productos\.html\?productoActualizado=1/);
      await expect(page.locator('.toast')).toContainText('Producto actualizado con éxito');
      const producto = (await apiConHeaders(request, 'GET', '/productos', dueno.token, conComercio())).body.data.find((p: any) => p.id === productoConFoto);
      expect(Number(producto.precio)).toBe(5300);
    });

    test('crea un producto con foto desde la pantalla de nuevo producto', async ({ page, request }) => {
      const nombre = `Nuevo Prod ${sufijoUnico().slice(-6).replace(/[0-9]/g, (digito) => 'abcdefghij'[Number(digito)])}`;
      await abrirComoEmpleado(page);
      await page.goto('/comercio-productos.html');
      await page.getByTestId('btn-crear-producto').click();
      await page.waitForURL('**/comercio-producto-form.html');

      await page.getByTestId('input-nombre-producto').fill(nombre);
      await page.getByTestId('select-categoria-producto').selectOption(String(categoriaId));
      await page.getByTestId('input-precio-producto').fill('2800');
      await page.getByTestId('input-foto-producto').setInputFiles({ name: nombreArchivoFixture(), mimeType: 'image/png', buffer: FIXTURE_BUFFER });
      await esperarImagenCargadaEnRecorte(page);
      await page.getByTestId('btn-confirmar-recorte').click();
      await expect(page.getByTestId('modal-recorte-imagen')).toHaveCount(0);
      await page.getByTestId('btn-guardar-producto').click();

      await page.waitForURL(/comercio-productos\.html\?productoCreado=1/, { timeout: 60_000 });
      const productos = (await apiConHeaders(request, 'GET', '/productos', dueno.token, conComercio())).body.data as any[];
      const creado = productos.find((p) => p.nombre.toLowerCase() === nombre.toLowerCase());
      expect(creado).toBeTruthy();
      expect(creado.imagenes).toHaveLength(1);
    });

    test('con el comercio cerrado temporalmente el Empleado puede editar productos', async ({ page, request }) => {
      ponerEstadoComercio(dueno.comercioId, 'CERRADO_TEMPORALMENTE');
      const productoId = await crearProducto(request, dueno.token, { nombre: `Producto Cerrado E3B2 ${sufijoUnico()}`, precio: 1900, categoriaId });
      await abrirComoEmpleado(page);
      await page.goto('/comercio-productos.html');
      await page.getByTestId(`btn-acciones-producto-${productoId}`).click();
      await page.getByTestId('btn-cambiar-estado-producto').click();

      await expect(page.locator('.toast')).toContainText('Estado del producto actualizado');
      await expect(page.getByTestId('aviso-productos-slot').getByTestId('aviso-fijo')).toHaveCount(0);
      expect(sql(`SELECT estado FROM producto WHERE id = ${productoId};`)).toBe('AGOTADO');
    });

    test('con el comercio suspendido el cambio de estado desde la lista sale en un aviso fijo con el mensaje del servidor', async ({ page, request }) => {
      const productoId = await crearProducto(request, dueno.token, { nombre: `Producto Susp E3B2 ${sufijoUnico()}`, precio: 2100, categoriaId });
      ponerEstadoComercio(dueno.comercioId, 'SUSPENDIDO');
      const respuesta = await apiConHeaders(request, 'PATCH', `/productos/${productoId}/estado`, elena.sesion.token, conComercio(), { estado: 'AGOTADO' });
      expect(respuesta.status).toBe(409);
      expect(respuesta.body.data.codigo).toBe('COMERCIO_SUSPENDIDO');
      await abrirComoEmpleado(page);
      await page.goto('/comercio-productos.html');
      await expect(page.getByTestId(`btn-acciones-producto-${productoId}`)).toBeVisible();

      await page.getByTestId(`btn-acciones-producto-${productoId}`).click();
      await page.getByTestId('btn-cambiar-estado-producto').click();

      const aviso = page.getByTestId('aviso-productos-slot').getByTestId('aviso-fijo');
      await expect(aviso.getByTestId('aviso-fijo-texto')).toHaveText(respuesta.body.mensaje);
      await expect(aviso).toHaveAttribute('role', 'alert');
      await expect(page.locator('.toast')).toHaveCount(0);
      expect(sql(`SELECT estado FROM producto WHERE id = ${productoId};`)).toBe('DISPONIBLE');
      await sinScrollHorizontal(page);

      await page.getByTestId(`btn-acciones-producto-${productoId}`).click();
      await expect(page.getByTestId('aviso-productos-slot').getByTestId('aviso-fijo')).toHaveCount(0);
    });

    test('con el comercio suspendido guardar el formulario y pedir la firma de una foto salen en el aviso fijo, y la firma no dice "máximo de imágenes"', async ({ page, request }) => {
      ponerEstadoComercio(dueno.comercioId, 'SUSPENDIDO');
      const firma = await apiConHeaders(request, 'POST', `/productos/${productoConFoto}/cloudinary/firma`, elena.sesion.token, conComercio());
      expect(firma.status).toBe(409);
      expect(firma.body.data.codigo).toBe('COMERCIO_SUSPENDIDO');
      await abrirComoEmpleado(page);
      await page.goto(`/comercio-producto-form.html?id=${productoConFoto}`);
      await expect(page.getByTestId('btn-guardar-producto')).toBeEnabled();

      await page.getByTestId('input-precio-producto').fill('6100');
      await page.getByTestId('btn-guardar-producto').click();
      const aviso = page.getByTestId('mensaje-banner').getByTestId('aviso-fijo');
      await expect(aviso.getByTestId('aviso-fijo-texto')).toBeVisible();
      const textoGuardar = await aviso.getByTestId('aviso-fijo-texto').innerText();
      expect(textoGuardar).not.toContain('máximo');

      await page.getByTestId('input-foto-producto').setInputFiles({ name: nombreArchivoFixture(), mimeType: 'image/png', buffer: FIXTURE_BUFFER });
      await esperarImagenCargadaEnRecorte(page);
      const respuestaFirma = page.waitForResponse((r) => r.url().endsWith('/cloudinary/firma') && r.request().method() === 'POST');
      await page.getByTestId('btn-confirmar-recorte').click();
      expect((await respuestaFirma).status()).toBe(409);

      await expect(aviso.getByTestId('aviso-fijo-texto')).toHaveText(firma.body.mensaje);
      await expect(aviso.getByTestId('aviso-fijo-texto')).not.toContainText('máximo');
      await sinScrollHorizontal(page);
    });

    test('el Dueño conserva el botón para crear y el menú de cada producto', async ({ page }) => {
      await abrirComoDueno(page);
      await page.goto('/comercio-productos.html');

      await expect(page.getByTestId(`producto-item-${productoConFoto}`)).toBeVisible();
      await expect(page.getByTestId('btn-crear-producto')).toBeVisible();
      await expect(page.getByTestId(`btn-acciones-producto-${productoConFoto}`)).toBeVisible();
    });
  });

  test.describe('Cierre manual', () => {
    test('el Empleado ve el interruptor en el panel, cierra con confirmación y vuelve a abrir sin ella', async ({ page, request }) => {
      await abrirComoEmpleado(page);
      await page.goto('/comercio-dashboard.html');
      const interruptor = page.getByTestId('switch-cierre-comercio');
      await expect(interruptor).toBeVisible();
      await expect(interruptor).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('titulo-cierre-comercio')).toHaveText('Recibiendo pedidos');
      await sinScrollHorizontal(page);

      await interruptor.click();
      await expect(page.getByTestId('modal-cierre-comercio')).toBeVisible();
      await page.getByTestId('btn-confirmar-cierre-comercio').click();

      await expect(interruptor).toHaveAttribute('aria-checked', 'false');
      await expect(page.getByTestId('titulo-cierre-comercio')).toHaveText('Pedidos pausados');
      expect((await datosDelComercio(request)).cerradoManualmente).toBe(true);
      expect(sql(`SELECT actor_rol FROM historial_cierre_comercio WHERE comercio_id = ${dueno.comercioId} ORDER BY id DESC LIMIT 1;`)).toBe('EMPLEADO');

      await interruptor.click();
      await expect(page.getByTestId('modal-cierre-comercio')).toHaveCount(0);
      await expect(interruptor).toHaveAttribute('aria-checked', 'true');
      expect((await datosDelComercio(request)).cerradoManualmente).toBe(false);
    });

    test('un 409 real (el comercio pasó a suspendido) sale en el aviso fijo del interruptor y no como aviso temporal', async ({ page, request }) => {
      await abrirComoEmpleado(page);
      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('switch-cierre-comercio')).toHaveAttribute('aria-checked', 'true');
      ponerEstadoComercio(dueno.comercioId, 'SUSPENDIDO');
      const mensaje = (await apiConHeaders(request, 'PUT', '/comercios/cerrar', elena.sesion.token, conComercio())).body.mensaje as string;
      expect(mensaje.length).toBeGreaterThan(10);

      await page.getByTestId('switch-cierre-comercio').click();
      await page.getByTestId('btn-confirmar-cierre-comercio').click();

      const aviso = page.getByTestId('aviso-cierre-slot').getByTestId('aviso-fijo');
      await expect(aviso.getByTestId('aviso-fijo-texto')).toHaveText(mensaje);
      await expect(aviso).toHaveAttribute('role', 'alert');
      await expect(page.locator('.toast')).toHaveCount(0);
      await sinScrollHorizontal(page);
    });

    test('un 409 simulado de apertura sale en el aviso fijo y se limpia al intentar de nuevo', async ({ page, request }) => {
      await apiConHeaders(request, 'PUT', '/comercios/cerrar', elena.sesion.token, conComercio());
      let intentos = 0;
      await page.route('**/comercios/abrir', (ruta) => {
        intentos += 1;
        if (intentos === 1) {
          return ruta.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ mensaje: 'Solo podés abrir o cerrar dentro de tu horario', data: null }) });
        }
        return ruta.continue();
      });
      await abrirComoEmpleado(page);
      await page.goto('/comercio-dashboard.html');
      await expect(page.getByTestId('switch-cierre-comercio')).toHaveAttribute('aria-checked', 'false');

      await page.getByTestId('switch-cierre-comercio').click();
      await expect(page.getByTestId('aviso-cierre-slot').getByTestId('aviso-fijo-texto')).toHaveText('Solo podés abrir o cerrar dentro de tu horario');
      await expect(page.getByTestId('switch-cierre-comercio')).toHaveAttribute('aria-checked', 'false');

      await page.getByTestId('switch-cierre-comercio').click();
      await expect(page.getByTestId('switch-cierre-comercio')).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('aviso-cierre-slot').getByTestId('aviso-fijo')).toHaveCount(0);
    });

    test('un error de red al cerrar sigue saliendo como aviso temporal', async ({ page }) => {
      await page.route('**/comercios/cerrar', (ruta) => ruta.abort('failed'));
      await abrirComoEmpleado(page);
      await page.goto('/comercio-dashboard.html');
      await page.getByTestId('switch-cierre-comercio').click();
      await page.getByTestId('btn-confirmar-cierre-comercio').click();

      await expect(page.locator('.toast')).toContainText('No pudimos actualizar el estado. Probá de nuevo.');
      await expect(page.getByTestId('aviso-fijo')).toHaveCount(0);
    });

    test('con el comercio suspendido el panel del Empleado no muestra el interruptor', async ({ page }) => {
      ponerEstadoComercio(dueno.comercioId, 'SUSPENDIDO');
      await abrirComoEmpleado(page);
      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('aviso-comercio-no-operativo')).toBeVisible();
      await expect(page.getByTestId('tarjeta-cierre-comercio')).toHaveCount(0);
    });

    test('el Dueño conserva su interruptor de cierre en el panel', async ({ page }) => {
      await abrirComoDueno(page);
      await page.goto('/comercio-dashboard.html');

      await expect(page.getByTestId('tarjeta-cierre-comercio')).toBeVisible();
      await expect(page.getByTestId('switch-cierre-comercio')).toBeVisible();
      await expect(page.getByTestId('titulo-cierre-comercio')).toHaveText('Recibiendo pedidos');
    });
  });
});
