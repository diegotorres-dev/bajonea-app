import path from 'node:path';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  obtenerLocalidadRioGrande,
  obtenerCodigoTest,
  registrarCliente,
  sufijoUnico,
  nombreUsuarioUnico,
  generarDni,
  generarTelefono,
  generarCuit,
  diaDeHoy,
  diaDistintoDeHoy,
  nombreArchivoFixture,
  verificarCuenta,
  login,
  apiGet,
  apiPost,
  esperarImagenCargadaEnRecorte,
} from './helpers/backend';

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/bajonea-e2e-producto.png');
const FIXTURE_BUFFER = readFileSync(FIXTURE_PATH);

test.describe('Registro y verificación de cuenta', () => {
  let localidadId: string;

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
  });

  async function elegirLocalidad(page: Page) {
    const localidadSelect = page.getByTestId('select-localidad');
    await expect(localidadSelect).toBeEnabled();
    await localidadSelect.selectOption(localidadId);
  }

  async function subirFotoComercioUi(page: Page) {
    await page.getByTestId('input-foto-comercio').setInputFiles({
      name: nombreArchivoFixture(),
      mimeType: 'image/png',
      buffer: FIXTURE_BUFFER,
    });
    await expect(page.getByTestId('modal-recorte-imagen')).toBeVisible();
    await expect(page.getByTestId('canvas-recorte')).toBeVisible();
    await expect(page.getByTestId('input-zoom-recorte')).toBeVisible();
    await esperarImagenCargadaEnRecorte(page);
    await page.getByTestId('btn-confirmar-recorte').click();
    await expect(page.getByTestId('modal-recorte-imagen')).toHaveCount(0);
  }

  async function completarRedSocialUi(page: Page, suf: string) {
    await page.getByTestId('select-tipo-red-social').selectOption('INSTAGRAM');
    await page.getByTestId('input-url-red-social').fill(`instagram.com/comercio.e2e.${suf}`);
  }

  test('registro de cliente con datos válidos completa el wizard y lleva a la pantalla de código', async ({ page, request }) => {
    const suf = sufijoUnico();
    const email = `cliente.ui.${suf}@bajonea.test`;

    await page.goto('/registro-cliente.html');

    await page.getByTestId('input-nombre').fill('Valentina');
    await page.getByTestId('input-apellido').fill('Domínguez');
    await page.getByTestId('input-dni').fill(generarDni());
    await page.getByTestId('input-fecha-nacimiento').fill('1995-05-20');
    await page.getByTestId('input-telefono').fill(generarTelefono());
    await page.getByTestId('input-nombre-usuario').fill(nombreUsuarioUnico('cli'));
    await page.getByTestId('input-email').fill(email);
    await page.getByTestId('input-password').fill('Testing123');
    await page.getByTestId('input-confirmar-password').fill('Testing123');
    await page.getByTestId('input-acepta-terminos').check();
    await page.getByTestId('btn-continuar').click();

    await expect(page.getByTestId('input-calle')).toBeVisible();
    await page.getByTestId('input-calle').fill('Belgrano');
    await page.getByTestId('input-numero').fill('450');
    await page.getByTestId('input-codigo-postal').fill('9420');
    await elegirLocalidad(page);

    const registroResponse = page.waitForResponse(
      (res) => res.url().endsWith('/auth/registro/cliente') && res.request().method() === 'POST',
    );
    await page.getByTestId('btn-crear-cuenta').click();
    const respuesta = await registroResponse;
    expect(respuesta.status()).toBe(201);

    await expect(page.getByTestId('btn-ir-a-verificar')).toBeVisible();
    await expect(page.getByText('Revisá tu email')).toBeVisible();
    await expect(page.getByTestId('btn-ir-a-verificar')).toHaveAttribute(
      'href',
      new RegExp(`verificar-email\\.html\\?email=${encodeURIComponent(email)}$`),
    );

    const codigo = await obtenerCodigoTest(request, email, 'VERIFICACION_EMAIL');
    expect(codigo).toMatch(/^\d{6}$/);
  });

  test('registro de cliente con foto de perfil: el recorte funciona sin errores y la URL de Cloudinary queda persistida', async ({ page, request }) => {
    const suf = sufijoUnico();
    const email = `cliente.foto.ui.${suf}@bajonea.test`;
    const password = 'Testing123';

    const erroresConsola: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') erroresConsola.push(msg.text());
    });

    const nombreUsuario = nombreUsuarioUnico('cli');
    await page.goto('/registro-cliente.html');

    await page.getByTestId('input-nombre').fill('Valentina');
    await page.getByTestId('input-apellido').fill('Domínguez');
    await page.getByTestId('input-dni').fill(generarDni());
    await page.getByTestId('input-fecha-nacimiento').fill('1995-05-20');
    await page.getByTestId('input-telefono').fill(generarTelefono());
    await page.getByTestId('input-nombre-usuario').fill(nombreUsuario);
    await page.getByTestId('input-email').fill(email);
    await page.getByTestId('input-password').fill(password);
    await page.getByTestId('input-confirmar-password').fill(password);
    await page.getByTestId('input-acepta-terminos').check();

    await page.getByTestId('input-foto-cliente').setInputFiles({
      name: nombreArchivoFixture(),
      mimeType: 'image/png',
      buffer: FIXTURE_BUFFER,
    });
    await expect(page.getByTestId('modal-recorte-imagen')).toBeVisible();
    await expect(page.getByTestId('canvas-recorte')).toBeVisible();
    await expect(page.getByTestId('input-zoom-recorte')).toBeVisible();
    await esperarImagenCargadaEnRecorte(page);
    await page.getByTestId('btn-confirmar-recorte').click();
    await expect(page.getByTestId('modal-recorte-imagen')).toHaveCount(0);

    await page.getByTestId('btn-continuar').click();

    await expect(page.getByTestId('input-calle')).toBeVisible();
    await page.getByTestId('input-calle').fill('Belgrano');
    await page.getByTestId('input-numero').fill('450');
    await page.getByTestId('input-codigo-postal').fill('9420');
    await elegirLocalidad(page);

    const registroResponse = page.waitForResponse(
      (res) => res.url().endsWith('/auth/registro/cliente') && res.request().method() === 'POST',
    );
    await page.getByTestId('btn-crear-cuenta').click();
    const respuesta = await registroResponse;
    expect(respuesta.status()).toBe(201);
    const cuerpoRespuesta = await respuesta.json();
    expect(cuerpoRespuesta.data.fotoPerfilUrl).toContain('res.cloudinary.com');

    await expect(page.getByTestId('btn-ir-a-verificar')).toBeVisible();

    expect(erroresConsola, `Errores de consola durante el flujo:\n${erroresConsola.join('\n')}`).toEqual([]);

    await verificarCuenta(request, email);
    const sesion = await login(request, nombreUsuario, password);
    const { status, body } = await apiGet(request, '/clientes/perfil', sesion.token);
    expect(status).toBe(200);
    expect(body.data.fotoPerfilUrl).toContain('res.cloudinary.com');
  });

  test('registro de comercio con datos válidos (representante y horarios) completa el wizard y lleva a la pantalla de código', async ({ page }) => {
    const suf = sufijoUnico();
    const emailLogin = `comercio.ui.${suf}@bajonea.test`;
    const emailContacto = `comercio.ui.contacto.${suf}@bajonea.test`;

    await page.goto('/registro-comercio.html');

    await page.getByTestId('input-nombre').fill(`Comercio UI E2E ${suf}`);
    await page.getByTestId('input-telefono').fill(generarTelefono());
    await page.getByTestId('input-email-contacto').fill(emailContacto);
    await page.getByTestId('select-tipo-comercio').selectOption('RESTAURANTE');
    await page.getByTestId('input-calle').fill('Av. San Martín');
    await page.getByTestId('input-numero').fill('100');
    await page.getByTestId('input-codigo-postal').fill('9420');
    await elegirLocalidad(page);
    await subirFotoComercioUi(page);
    await page.getByTestId('btn-continuar').click();

    await expect(page.getByTestId('input-razon-social')).toBeVisible();
    await page.getByTestId('input-razon-social').fill(`Razón Social UI E2E ${suf}`);
    await page.getByTestId('input-cuit').fill(generarCuit());
    await page.getByTestId('input-fecha-inicio-actividades').fill('2020-01-01');
    await page.getByTestId('select-tipo-sociedad').selectOption('SRL');
    await page.getByTestId('select-condicion-iva').selectOption('RESPONSABLE_INSCRIPTO');
    await page.getByTestId('input-domicilio-fiscal').fill('Av. San Martín 100');
    await page.getByTestId('input-nombre-representante').fill('Rodrigo');
    await page.getByTestId('input-apellido-representante').fill('Fernández');
    await page.getByTestId('input-dni-representante').fill(generarDni());
    await page.getByTestId('input-fecha-nacimiento-representante').fill('1985-03-15');
    await page.getByTestId('input-telefono-representante').fill(generarTelefono());
    await page.getByTestId('input-nombre-usuario').fill(nombreUsuarioUnico('com'));
    await page.getByTestId('input-email').fill(emailLogin);
    await page.getByTestId('input-password').fill('Testing123');
    await page.getByTestId('input-confirmar-password').fill('Testing123');
    await page.getByTestId('btn-continuar-2').click();

    await page.getByTestId('tab-horario-personalizado').click();
    const filas = page.getByTestId('fila-horario');
    await page.getByTestId('btn-agregar-horario').click();
    await expect(page.getByTestId('lista-horarios')).toBeVisible();
    await expect(filas).toHaveCount(1);
    await filas.nth(0).getByTestId('select-dia-horario').selectOption(diaDeHoy());
    await filas.nth(0).getByTestId('input-apertura-horario').fill('09:00');
    await filas.nth(0).getByTestId('input-cierre-horario').fill('18:00');

    await page.getByTestId('btn-agregar-horario').click();
    await expect(filas).toHaveCount(2);
    await filas.nth(1).getByTestId('select-dia-horario').selectOption(diaDistintoDeHoy());
    await filas.nth(1).getByTestId('input-apertura-horario').fill('10:00');
    await filas.nth(1).getByTestId('input-cierre-horario').fill('20:00');
    await page.getByTestId('btn-continuar-3').click();

    await expect(page.getByTestId('lista-redes-sociales')).toBeVisible();
    await completarRedSocialUi(page, suf);

    const registroResponse = page.waitForResponse(
      (res) => res.url().endsWith('/auth/registro/comercio') && res.request().method() === 'POST',
    );
    await page.getByTestId('btn-registrar-comercio').click();
    const respuesta = await registroResponse;
    expect(respuesta.status()).toBe(201);

    await expect(page.getByTestId('btn-ir-a-verificar')).toBeVisible();
    await expect(page.getByText('Registro enviado')).toBeVisible();
    await expect(page.getByTestId('btn-ir-a-verificar')).toHaveAttribute(
      'href',
      new RegExp(`verificar-email\\.html\\?email=${encodeURIComponent(emailLogin)}$`),
    );
  });

  test('verificación de cuenta: login se rechaza sin verificar, código incorrecto marca error, código correcto activa la cuenta', async ({
    page,
    request,
  }) => {
    const cliente = await registrarCliente(request, localidadId);

    await page.goto('/login.html');
    await page.getByTestId('input-nombre-usuario').fill(cliente.nombreUsuario);
    await page.getByTestId('input-password').fill(cliente.password);
    await page.getByTestId('btn-ingresar').click();
    await expect(page.getByTestId('mensaje-banner')).toContainText('Todavía no verificaste tu email');

    await page.goto(`/verificar-email.html?email=${encodeURIComponent(cliente.email)}`);

    const intentoIncorrecto = page.waitForResponse(
      (res) => res.url().endsWith('/auth/verificar') && res.request().method() === 'POST',
    );
    for (let i = 0; i < 6; i += 1) {
      await page.getByTestId(`input-codigo-digito-${i + 1}`).fill('9');
    }
    const respuestaIncorrecta = await intentoIncorrecto;
    expect(respuestaIncorrecta.status()).toBe(401);
    await expect(page.getByTestId('mensaje-error-codigo')).toBeVisible();

    for (let i = 0; i < 6; i += 1) {
      await page.getByTestId(`input-codigo-digito-${i + 1}`).fill('');
    }

    const codigo = await obtenerCodigoTest(request, cliente.email, 'VERIFICACION_EMAIL');
    const intentoCorrecto = page.waitForResponse(
      (res) => res.url().endsWith('/auth/verificar') && res.request().method() === 'POST',
    );
    for (let i = 0; i < 6; i += 1) {
      await page.getByTestId(`input-codigo-digito-${i + 1}`).fill(codigo[i]);
    }
    const respuestaCorrecta = await intentoCorrecto;
    expect(respuestaCorrecta.status()).toBe(200);
    await expect(page.getByTestId('estado-verificacion-exito')).toBeVisible();

    await page.getByTestId('btn-ir-a-login').click();
    await page.waitForURL('**/login.html');
    await page.getByTestId('input-nombre-usuario').fill(cliente.nombreUsuario);
    await page.getByTestId('input-password').fill(cliente.password);
    await page.getByTestId('btn-ingresar').click();
    await page.waitForURL('**/index.html');
  });

  test('registro-cliente: los inputs de DNI y teléfono bloquean letras y símbolos en tiempo real, no solo al enviar', async ({ page }) => {
    await page.goto('/registro-cliente.html');

    const dniInput = page.getByTestId('input-dni');
    await dniInput.pressSequentially('ab12cd345678');
    await expect(dniInput).toHaveValue('12345678');

    const telefonoInput = page.getByTestId('input-telefono');
    await telefonoInput.pressSequentially('29-64 abc123456789');
    await expect(telefonoInput).toHaveValue('2964123456');
  });

  test('registro-cliente: un campo requerido vacío bloquea el paso 1 con el error visible', async ({ page }) => {
    await page.goto('/registro-cliente.html');

    await page.getByTestId('input-nombre').fill('Valentina');
    await page.getByTestId('input-apellido').fill('Domínguez');
    await page.getByTestId('input-fecha-nacimiento').fill('1995-05-20');
    await page.getByTestId('input-telefono').fill(generarTelefono());
    await page.getByTestId('input-email').fill(`cliente.ui.${sufijoUnico()}@bajonea.test`);
    await page.getByTestId('input-password').fill('Testing123');
    await page.getByTestId('input-confirmar-password').fill('Testing123');
    await page.getByTestId('input-acepta-terminos').check();
    await page.getByTestId('btn-continuar').click();

    await expect(page.getByTestId('mensaje-error-dni')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-dni')).toContainText('El DNI es obligatorio');
    await expect(page.getByTestId('input-calle')).toBeHidden();
  });

  test('registro-cliente: un email con formato inválido bloquea el paso 1 con el error visible', async ({ page }) => {
    await page.goto('/registro-cliente.html');

    await page.getByTestId('input-nombre').fill('Valentina');
    await page.getByTestId('input-apellido').fill('Domínguez');
    await page.getByTestId('input-dni').fill(generarDni());
    await page.getByTestId('input-fecha-nacimiento').fill('1995-05-20');
    await page.getByTestId('input-telefono').fill(generarTelefono());
    await page.getByTestId('input-email').fill('correo-sin-formato-valido');
    await page.getByTestId('input-password').fill('Testing123');
    await page.getByTestId('input-confirmar-password').fill('Testing123');
    await page.getByTestId('input-acepta-terminos').check();
    await page.getByTestId('btn-continuar').click();

    await expect(page.getByTestId('mensaje-error-email')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-email')).toContainText('Ingresá un email válido');
    await expect(page.getByTestId('input-calle')).toBeHidden();
  });

  test('registro-comercio: un campo requerido vacío bloquea el paso 1 con el error visible', async ({ page }) => {
    await page.goto('/registro-comercio.html');

    await page.getByTestId('input-telefono').fill(generarTelefono());
    await page.getByTestId('input-email-contacto').fill(`comercio.ui.${sufijoUnico()}@bajonea.test`);
    await page.getByTestId('input-calle').fill('Av. San Martín');
    await page.getByTestId('input-numero').fill('100');
    await page.getByTestId('input-codigo-postal').fill('9420');
    await elegirLocalidad(page);
    await page.getByTestId('btn-continuar').click();

    await expect(page.getByTestId('mensaje-error-nombre')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-nombre')).toContainText('El nombre del comercio es obligatorio');
    await expect(page.getByTestId('input-razon-social')).toBeHidden();
  });

  test('registro-comercio: un CUIT con longitud incorrecta bloquea el paso 2 con el error visible', async ({ page }) => {
    const suf = sufijoUnico();
    await page.goto('/registro-comercio.html');

    await page.getByTestId('input-nombre').fill(`Comercio UI E2E ${suf}`);
    await page.getByTestId('input-telefono').fill(generarTelefono());
    await page.getByTestId('input-email-contacto').fill(`comercio.ui.contacto.${suf}@bajonea.test`);
    await page.getByTestId('select-tipo-comercio').selectOption('RESTAURANTE');
    await page.getByTestId('input-calle').fill('Av. San Martín');
    await page.getByTestId('input-numero').fill('100');
    await page.getByTestId('input-codigo-postal').fill('9420');
    await elegirLocalidad(page);
    await subirFotoComercioUi(page);
    await page.getByTestId('btn-continuar').click();

    await expect(page.getByTestId('input-razon-social')).toBeVisible();
    await page.getByTestId('input-razon-social').fill(`Razón Social UI E2E ${suf}`);
    await page.getByTestId('input-cuit').fill('12345');
    await page.getByTestId('input-fecha-inicio-actividades').fill('2020-01-01');
    await page.getByTestId('select-tipo-sociedad').selectOption('SRL');
    await page.getByTestId('select-condicion-iva').selectOption('RESPONSABLE_INSCRIPTO');
    await page.getByTestId('input-domicilio-fiscal').fill('Av. San Martín 100');
    await page.getByTestId('input-nombre-representante').fill('Rodrigo');
    await page.getByTestId('input-apellido-representante').fill('Fernández');
    await page.getByTestId('input-dni-representante').fill(generarDni());
    await page.getByTestId('input-fecha-nacimiento-representante').fill('1985-03-15');
    await page.getByTestId('input-telefono-representante').fill(generarTelefono());
    await page.getByTestId('input-nombre-usuario').fill(nombreUsuarioUnico('com'));
    await page.getByTestId('input-email').fill(`comercio.ui.${suf}@bajonea.test`);
    await page.getByTestId('input-password').fill('Testing123');
    await page.getByTestId('input-confirmar-password').fill('Testing123');
    await page.getByTestId('btn-continuar-2').click();

    await expect(page.getByTestId('mensaje-error-cuit')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-cuit')).toContainText('El CUIT debe tener 11 dígitos numéricos');
    await expect(page.getByTestId('lista-horarios')).toBeHidden();
  });

  test.describe('Términos y Condiciones por API', () => {
    function cuerpoRegistro(localidad: string, extra: Record<string, unknown>) {
      const suf = sufijoUnico();
      return {
        nombre: 'Prueba',
        apellido: 'Terminos',
        dni: generarDni(),
        fechaNacimiento: '1995-05-20',
        telefono: `+549${generarTelefono()}`,
        nombreUsuario: nombreUsuarioUnico('ter'),
        email: `terminos.${suf}@bajonea.test`,
        password: 'Testing123',
        direccion: { calle: 'Belgrano', numero: '450', pisoDepto: null, codigoPostal: '9420', localidadId: localidad, principal: true },
        ...extra,
      };
    }

    test('sin aceptaTerminos o con false el registro da 400 con el mensaje del campo', async ({ request }) => {
      const ausente = await apiPost(request, '/auth/registro/cliente', cuerpoRegistro(localidadId, {}));
      expect(ausente.status).toBe(400);
      expect(ausente.body.data.aceptaTerminos).toBe('Tenés que aceptar los Términos y Condiciones');

      const rechazado = await apiPost(request, '/auth/registro/cliente', cuerpoRegistro(localidadId, { aceptaTerminos: false }));
      expect(rechazado.status).toBe(400);
      expect(rechazado.body.data.aceptaTerminos).toBe('Tenés que aceptar los Términos y Condiciones');
    });

    test('con aceptaTerminos en true el registro da 201', async ({ request }) => {
      const aceptado = await apiPost(request, '/auth/registro/cliente', cuerpoRegistro(localidadId, { aceptaTerminos: true }));
      expect(aceptado.status).toBe(201);
    });
  });

  test('registro de comercio: un error del servidor con etiquetas HTML se muestra como texto en el banner', async ({ page }) => {
    const suf = sufijoUnico();
    const mensajeConHtml = 'No pudimos registrar el comercio <img src="x" onerror="window.__bannerInyectado=true"><b>importante</b>';
    const json = (cuerpo: unknown, status = 200) => ({
      status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(cuerpo),
    });

    await page.route('**/auth/registro/comercio/foto-firma', (route) =>
      route.fulfill(json({ mensaje: 'ok', data: { apiKey: 'k', timestamp: 1, signature: 's', folder: 'f', uploadPreset: 'p', cloudName: 'demo' } })),
    );
    await page.route('https://api.cloudinary.com/**', (route) =>
      route.fulfill(json({ secure_url: 'https://res.cloudinary.com/demo/image/upload/e2e.png' })),
    );
    await page.route('**/auth/registro/comercio', (route) =>
      route.request().method() === 'POST' ? route.fulfill(json({ mensaje: mensajeConHtml, data: null }, 409)) : route.continue(),
    );

    await page.goto('/registro-comercio.html');
    await page.getByTestId('input-nombre').fill(`Comercio Banner E2E ${suf}`);
    await page.getByTestId('input-telefono').fill(generarTelefono());
    await page.getByTestId('input-email-contacto').fill(`comercio.banner.contacto.${suf}@bajonea.test`);
    await page.getByTestId('select-tipo-comercio').selectOption('RESTAURANTE');
    await page.getByTestId('input-calle').fill('Av. San Martín');
    await page.getByTestId('input-numero').fill('100');
    await page.getByTestId('input-codigo-postal').fill('9420');
    await elegirLocalidad(page);
    await subirFotoComercioUi(page);
    await page.getByTestId('btn-continuar').click();

    await page.getByTestId('input-razon-social').fill(`Razón Social Banner ${suf}`);
    await page.getByTestId('input-cuit').fill(generarCuit());
    await page.getByTestId('input-fecha-inicio-actividades').fill('2020-01-01');
    await page.getByTestId('select-tipo-sociedad').selectOption('SRL');
    await page.getByTestId('select-condicion-iva').selectOption('RESPONSABLE_INSCRIPTO');
    await page.getByTestId('input-domicilio-fiscal').fill('Av. San Martín 100');
    await page.getByTestId('input-nombre-representante').fill('Rodrigo');
    await page.getByTestId('input-apellido-representante').fill('Fernández');
    await page.getByTestId('input-dni-representante').fill(generarDni());
    await page.getByTestId('input-fecha-nacimiento-representante').fill('1985-03-15');
    await page.getByTestId('input-telefono-representante').fill(generarTelefono());
    await page.getByTestId('input-nombre-usuario').fill(nombreUsuarioUnico('com'));
    await page.getByTestId('input-email').fill(`comercio.banner.${suf}@bajonea.test`);
    await page.getByTestId('input-password').fill('Testing123');
    await page.getByTestId('input-confirmar-password').fill('Testing123');
    await page.getByTestId('btn-continuar-2').click();

    await page.getByTestId('tab-horario-personalizado').click();
    await page.getByTestId('btn-agregar-horario').click();
    const fila = page.getByTestId('fila-horario').nth(0);
    await fila.getByTestId('select-dia-horario').selectOption(diaDeHoy());
    await fila.getByTestId('input-apertura-horario').fill('09:00');
    await fila.getByTestId('input-cierre-horario').fill('18:00');
    await page.getByTestId('btn-continuar-3').click();

    await expect(page.getByTestId('lista-redes-sociales')).toBeVisible();
    await completarRedSocialUi(page, suf);
    await page.getByTestId('btn-registrar-comercio').click();

    const banner = page.getByTestId('mensaje-banner');
    await expect(banner).toContainText(mensajeConHtml);
    await expect(banner.locator('img, b')).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { __bannerInyectado?: boolean }).__bannerInyectado)).toBeUndefined();
  });
});
