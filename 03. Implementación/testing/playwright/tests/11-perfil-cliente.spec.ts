import path from 'node:path';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  login,
  apiGet,
  nombreArchivoFixture,
} from './helpers/backend';

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/bajonea-e2e-producto.png');
const FIXTURE_BUFFER = readFileSync(FIXTURE_PATH);

async function loginUi(page: Page, email: string, password: string) {
  await page.goto('/login.html');
  await page.getByTestId('input-email').fill(email);
  await page.getByTestId('input-password').fill(password);
  await page.getByTestId('btn-ingresar').click();
  await page.waitForURL('**/index.html');
}

/**
 * Bajoneá tiene sesión única por cuenta (Sesion.activa) -- un login nuevo por API para la
 * MISMA cuenta invalida el JWT que ya tiene la pestaña del navegador (mismo criterio ya
 * documentado en testing/playwright/README.md para specs futuros). Para verificar estado
 * post-acción sin romper la sesión que la UI todavía va a seguir usando, se lee el token que
 * el propio navegador ya tiene en localStorage en vez de loguear de nuevo por API.
 */
async function tokenDeSesionUi(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('bajonea_token'));
  if (!token) {
    throw new Error('No hay token de sesión en localStorage -- ¿se llamó a este helper antes de loguear por UI?');
  }
  return token;
}

async function subirFotoPerfilViaCropUi(page: Page, buffer: Buffer, mimeType = 'image/png') {
  await page.getByTestId('input-foto-cliente').setInputFiles({
    name: nombreArchivoFixture(),
    mimeType,
    buffer,
  });
  await expect(page.getByTestId('modal-recorte-imagen')).toBeVisible();
  await expect(page.getByTestId('canvas-recorte')).toBeVisible();
  const respuesta = page.waitForResponse(
    (res) => res.url().endsWith('/foto-perfil') && res.request().method() === 'PATCH',
  );
  await page.getByTestId('btn-confirmar-recorte').click();
  await expect(page.getByTestId('modal-recorte-imagen')).toHaveCount(0);
  return respuesta;
}

test.describe('Perfil de Cliente: editar datos personales', () => {
  let localidadId: string;

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
  });

  test('nombre/apellido vacío y con formato inválido muestran el error cerca del campo, sin guardar', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    await loginUi(page, cliente.email, cliente.password);
    await page.goto('/perfil.html');
    await page.getByTestId('btn-editar-datos').click();

    await page.getByTestId('input-nombre').fill('');
    await page.getByTestId('btn-guardar-datos').click();
    await expect(page.getByTestId('mensaje-error-nombre')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-nombre')).toContainText('obligatorio');

    await page.getByTestId('input-nombre').fill('Cliente123');
    await page.getByTestId('btn-guardar-datos').click();
    await expect(page.getByTestId('mensaje-error-nombre')).toContainText('solo letras');
  });

  test('el input de nombre no deja escribir más de 100 caracteres (boundary visual del maxlength)', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    await loginUi(page, cliente.email, cliente.password);
    await page.goto('/perfil.html');
    await page.getByTestId('btn-editar-datos').click();

    const nombreInput = page.getByTestId('input-nombre');
    await nombreInput.fill('');
    await nombreInput.pressSequentially('a'.repeat(105));
    await expect(nombreInput).toHaveValue('a'.repeat(100));
  });

  test('el input de teléfono filtra letras y símbolos en tiempo real, no solo al enviar', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    await loginUi(page, cliente.email, cliente.password);
    await page.goto('/perfil.html');
    await page.getByTestId('btn-editar-datos').click();

    const telefonoInput = page.getByTestId('input-telefono');
    await telefonoInput.fill('');
    await telefonoInput.pressSequentially('29-64 abc999888777666');
    await expect(telefonoInput).toHaveValue('2964999888');
  });

  test('guardar datos válidos actualiza el encabezado del perfil y persiste contra el backend real', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    await loginUi(page, cliente.email, cliente.password);
    await page.goto('/perfil.html');
    await page.getByTestId('btn-editar-datos').click();

    await page.getByTestId('input-nombre').fill('Renombrada');
    await page.getByTestId('input-apellido').fill('Editada');
    const telefonoInput = page.getByTestId('input-telefono');
    await telefonoInput.fill('');
    await telefonoInput.pressSequentially('2964555444');

    const guardarResponse = page.waitForResponse(
      (res) => res.url().endsWith('/clientes/perfil') && res.request().method() === 'PUT',
    );
    await page.getByTestId('btn-guardar-datos').click();
    const respuesta = await guardarResponse;
    expect(respuesta.status()).toBe(200);

    await expect(page.getByTestId('nombre-cliente-perfil')).toHaveText('Renombrada Editada');

    const sesion = await login(request, cliente.email, cliente.password);
    const { body } = await apiGet(request, '/clientes/perfil', sesion.token);
    expect(body.data.nombre).toBe('Renombrada');
    expect(body.data.apellido).toBe('Editada');
    expect(body.data.telefono).toBe('+5492964555444');
  });
});

test.describe('Perfil de Cliente: cambiar contraseña', () => {
  let localidadId: string;

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
  });

  test('campos vacíos y contraseña nueva insegura muestran el error cerca del campo correspondiente', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    await loginUi(page, cliente.email, cliente.password);
    await page.goto('/perfil.html');
    await page.getByTestId('btn-cambiar-password').click();

    await page.getByTestId('btn-guardar-password').click();
    await expect(page.getByTestId('mensaje-error-password-actual')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-password-nueva')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-password-confirmar')).toBeVisible();

    // "debilxxx" (8 minúsculas, sin mayúscula ni número) pasa el minlength=8 nativo del input
    // -- así la validación llega de verdad hasta esPasswordSegura() y muestra el mensaje real
    // de complejidad, no el genérico de "campo vacío" que dispara checkValidity() con <8.
    await page.getByTestId('input-password-actual').fill(cliente.password);
    await page.getByTestId('input-password-nueva').fill('debilxxx');
    await page.getByTestId('input-password-confirmar').fill('debilxxx');
    await page.getByTestId('btn-guardar-password').click();
    await expect(page.getByTestId('mensaje-error-password-nueva')).toContainText('mínimo 8 caracteres');
  });

  test('la fortaleza visual reacciona en vivo y la confirmación que no coincide bloquea el submit', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    await loginUi(page, cliente.email, cliente.password);
    await page.goto('/perfil.html');
    await page.getByTestId('btn-cambiar-password').click();

    // Selector plano (no encadenado, ver nota en 10-recuperacion-y-reactivacion.spec.ts).
    const barrasLlenas = page.locator('[data-testid="indicador-fortaleza-password"] .strength-meter__bar--filled');
    await page.getByTestId('input-password-nueva').fill('debil');
    await expect(barrasLlenas).toHaveCount(0);
    // calcularFortalezaPassword (validators.js) suma el 4to punto por símbolo especial O
    // longitud >= 12 -- "Fuerte12345" (11) se queda en 3/4, hace falta un caracter más para
    // las 4 barras llenas.
    await page.getByTestId('input-password-nueva').fill('Fuerte123456');
    await expect(barrasLlenas).toHaveCount(4);

    await page.getByTestId('input-password-actual').fill(cliente.password);
    await page.getByTestId('input-password-confirmar').fill('OtraCosaDistinta1');
    await page.getByTestId('btn-guardar-password').click();
    await expect(page.getByTestId('mensaje-error-password-confirmar')).toContainText('no coinciden');
  });

  test('2 intentos seguidos con la contraseña actual incorrecta muestran el aviso de bloqueo inminente, y el cambio real invalida la sesión', async ({
    page,
    request,
  }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    const passwordNueva = 'CambiadaOk123';
    await loginUi(page, cliente.email, cliente.password);
    await page.goto('/perfil.html');
    await page.getByTestId('btn-cambiar-password').click();

    // 1er intento fallido: error puntual, sin advertencia de bloqueo todavía.
    await page.getByTestId('input-password-actual').fill('ContraseñaEquivocada1');
    await page.getByTestId('input-password-nueva').fill(passwordNueva);
    await page.getByTestId('input-password-confirmar').fill(passwordNueva);
    const primerIntento = page.waitForResponse(
      (res) => res.url().endsWith('/auth/cambiar-password') && res.request().method() === 'POST',
    );
    await page.getByTestId('btn-guardar-password').click();
    const respuesta1 = await primerIntento;
    expect(respuesta1.status()).toBe(401);
    await expect(page.getByTestId('mensaje-error-password-actual')).toContainText('no es correcta');
    await expect(page.getByTestId('mensaje-banner-password')).not.toContainText('bloqueará');

    // 2do intento fallido: MAX_INTENTOS_FALLIDOS=3 -- a 1 de distancia del bloqueo, banner real.
    await page.getByTestId('input-password-actual').fill('OtraVezMal2');
    const segundoIntento = page.waitForResponse(
      (res) => res.url().endsWith('/auth/cambiar-password') && res.request().method() === 'POST',
    );
    await page.getByTestId('btn-guardar-password').click();
    await segundoIntento;
    await expect(page.getByTestId('mensaje-banner-password')).toContainText('se bloqueará');

    // 3er intento con la contraseña actual correcta: éxito, resetea el contador y cierra la
    // sesión -- redirige a login con el flag de contraseña actualizada.
    await page.getByTestId('input-password-actual').fill(cliente.password);
    const tercerIntento = page.waitForResponse(
      (res) => res.url().endsWith('/auth/cambiar-password') && res.request().method() === 'POST',
    );
    await page.getByTestId('btn-guardar-password').click();
    const respuesta3 = await tercerIntento;
    expect(respuesta3.status()).toBe(200);
    await page.waitForURL('**/login.html?passwordActualizada=1');

    const sesionNueva = await login(request, cliente.email, passwordNueva);
    expect(sesionNueva.token).toBeTruthy();
  });
});

test.describe('Perfil de Cliente: foto de perfil', () => {
  let localidadId: string;

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
  });

  test('un archivo de más de 5 MB o con formato no permitido se rechaza en el cliente, sin llegar a pedir la firma de Cloudinary', async ({
    page,
    request,
  }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    await loginUi(page, cliente.email, cliente.password);
    await page.goto('/perfil.html');

    let firmaPedida = false;
    page.on('request', (req) => {
      if (req.url().endsWith('/foto-perfil/firma')) {
        firmaPedida = true;
      }
    });

    const archivoGigante = Buffer.alloc(6 * 1024 * 1024, 1);
    await page.getByTestId('input-foto-cliente').setInputFiles({
      name: 'gigante.png',
      mimeType: 'image/png',
      buffer: archivoGigante,
    });
    await expect(page.locator('.toast')).toContainText('no puede superar los 5 MB');
    await expect(page.getByTestId('modal-recorte-imagen')).toHaveCount(0);

    await page.getByTestId('input-foto-cliente').setInputFiles({
      name: 'documento.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 no es una imagen real'),
    });
    await expect(page.locator('.toast')).toContainText('Formato no permitido');
    await expect(page.getByTestId('modal-recorte-imagen')).toHaveCount(0);

    expect(firmaPedida).toBe(false);
  });

  test('subir, editar y eliminar la foto de perfil funcionan de punta a punta contra Cloudinary real', async ({ page, request }) => {
    const cliente = await registrarYVerificarCliente(request, localidadId);
    await loginUi(page, cliente.email, cliente.password);
    await page.goto('/perfil.html');

    // Sin foto todavía: el click en el avatar abre directo el selector de archivo, sin modal
    // intermedio de "Editar/Eliminar" (mostrarModalFotoPerfil solo aparece si ya hay foto).
    await expect(page.getByTestId('modal-foto-perfil')).toHaveCount(0);

    const respuestaSubida = await subirFotoPerfilViaCropUi(page, FIXTURE_BUFFER);
    expect(respuestaSubida.status()).toBe(200);
    await expect(page.locator('.toast')).toContainText('Foto de perfil actualizada');
    await expect(page.getByTestId('btn-foto-perfil').locator('img')).toBeVisible();

    const token = await tokenDeSesionUi(page);
    const { body: perfilConFoto } = await apiGet(request, '/clientes/perfil', token);
    expect(perfilConFoto.data.fotoPerfilUrl).toContain('res.cloudinary.com');

    // Con foto ya cargada, el click abre el modal de Editar/Eliminar en vez del selector directo.
    await page.getByTestId('btn-foto-perfil').click();
    await expect(page.getByTestId('modal-foto-perfil')).toBeVisible();

    const eliminarResponse = page.waitForResponse(
      (res) => res.url().endsWith('/foto-perfil') && res.request().method() === 'DELETE',
    );
    await page.getByTestId('btn-eliminar-foto-perfil').click();
    const respuestaEliminar = await eliminarResponse;
    expect(respuestaEliminar.status()).toBe(200);
    await expect(page.locator('.toast')).toContainText('Foto de perfil eliminada');

    const { body: perfilSinFoto } = await apiGet(request, '/clientes/perfil', token);
    expect(perfilSinFoto.data.fotoPerfilUrl).toBeNull();
  });

  test('la foto de perfil de un cliente es invisible/inaccesible para otro cliente (aislamiento por id)', async ({ page, request }) => {
    const clienteA = await registrarYVerificarCliente(request, localidadId);
    const clienteB = await registrarYVerificarCliente(request, localidadId);
    const sesionA = await login(request, clienteA.email, clienteA.password);
    const sesionB = await login(request, clienteB.email, clienteB.password);
    const { body: perfilA } = await apiGet(request, '/clientes/perfil', sesionA.token);
    const idA = perfilA.data.id as number;

    // UsuarioService.validarPropioUsuario compara el {id} del path contra el id del JWT y
    // lanza RecursoNoEncontradoException (404, no 403) cuando no coinciden -- mismo criterio
    // que el resto del proyecto para no confirmarle a un usuario ajeno que el id existe.
    const respuesta = await request.patch(`http://localhost:8080/api/v1/usuarios/${idA}/foto-perfil`, {
      headers: { Authorization: `Bearer ${sesionB.token}`, 'Content-Type': 'application/json' },
      data: { url: 'https://res.cloudinary.com/demo/image/upload/v1/foto.jpg' },
    });
    expect(respuesta.status()).toBe(404);
  });
});
