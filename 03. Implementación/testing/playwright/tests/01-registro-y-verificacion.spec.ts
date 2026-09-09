import path from 'node:path';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  obtenerLocalidadRioGrande,
  obtenerCodigoTest,
  registrarCliente,
  sufijoUnico,
  generarDni,
  generarTelefono,
  generarCuit,
  diaDeHoy,
  diaDistintoDeHoy,
  nombreArchivoFixture,
  verificarCuenta,
  login,
  apiGet,
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

  /**
   * RegistroComercioRequestDTO.fotoPerfilUrl es obligatorio desde la migración a
   * bajonea_final (ver CLAUDE.md §1bis, Tramo 4) -- el wizard bloquea el paso 1 -> 2 sin foto
   * (auth.js, listener de continuar-btn). Confirmar el recorte solo deja la foto en memoria
   * (fotoComercioStaged): la subida real a Cloudinary ocurre recién en el submit final, así
   * que acá no hace falta esperar ninguna respuesta de red.
   */
  async function subirFotoComercioUi(page: Page) {
    await page.getByTestId('input-foto-comercio').setInputFiles({
      name: nombreArchivoFixture(),
      mimeType: 'image/png',
      buffer: FIXTURE_BUFFER,
    });
    await expect(page.getByTestId('modal-recorte-imagen')).toBeVisible();
    // Esperar a que la imagen esté cargada en el canvas antes de confirmar -- igual que en
    // spec 06 (subirFotoViaCropUi): confirmar apenas se abre el modal, antes de que el <img>
    // termine de cargar, deja el canvas sin dibujar y el recorte se pierde en silencio.
    await expect(page.getByTestId('canvas-recorte')).toBeVisible();
    await expect(page.getByTestId('input-zoom-recorte')).toBeVisible();
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

  /**
   * A diferencia de Comercio (fotoPerfilUrl obligatoria), la foto de perfil de Cliente es
   * opcional (RegistroClienteRequestDTO.fotoPerfilUrl sin @NotBlank/@NotNull) -- por eso el
   * resto de los tests de este describe no la cargan. Este test cubre específicamente ese
   * camino: recorte real (js/crop.js, mismo mecanismo que subirFotoComercioUi) + subida real
   * a Cloudinary en el submit final + persistencia confirmada contra el backend real después
   * de verificar la cuenta y loguearse (GET /clientes/perfil).
   */
  test('registro de cliente con foto de perfil: el recorte funciona sin errores y la URL de Cloudinary queda persistida', async ({ page, request }) => {
    const suf = sufijoUnico();
    const email = `cliente.foto.ui.${suf}@bajonea.test`;
    const password = 'Testing123';

    const erroresConsola: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') erroresConsola.push(msg.text());
    });

    await page.goto('/registro-cliente.html');

    await page.getByTestId('input-nombre').fill('Valentina');
    await page.getByTestId('input-apellido').fill('Domínguez');
    await page.getByTestId('input-dni').fill(generarDni());
    await page.getByTestId('input-fecha-nacimiento').fill('1995-05-20');
    await page.getByTestId('input-telefono').fill(generarTelefono());
    await page.getByTestId('input-email').fill(email);
    await page.getByTestId('input-password').fill(password);
    await page.getByTestId('input-confirmar-password').fill(password);
    await page.getByTestId('input-acepta-terminos').check();

    // Mismo mecanismo real que subirFotoComercioUi: seleccionar archivo -> abre el editor de
    // recorte (js/crop.js, URL.createObjectURL) -> confirmar deja la foto en memoria
    // (fotoClienteStaged); la subida real a Cloudinary ocurre recién en el submit final.
    await page.getByTestId('input-foto-cliente').setInputFiles({
      name: nombreArchivoFixture(),
      mimeType: 'image/png',
      buffer: FIXTURE_BUFFER,
    });
    await expect(page.getByTestId('modal-recorte-imagen')).toBeVisible();
    await expect(page.getByTestId('canvas-recorte')).toBeVisible();
    await expect(page.getByTestId('input-zoom-recorte')).toBeVisible();
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

    // Persistencia confirmada de punta a punta: verificar cuenta -> loguear -> leer el perfil
    // real desde el backend, no solo confiar en lo que devolvió el registro.
    await verificarCuenta(request, email);
    const sesion = await login(request, email, password);
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
    await page.getByTestId('input-email').fill(emailLogin);
    await page.getByTestId('input-password').fill('Testing123');
    await page.getByTestId('input-confirmar-password').fill('Testing123');
    await page.getByTestId('btn-continuar-2').click();

    // El horario tiene 2 tabs -- "Horario fijo" (activo por default) y "Personalizado"
    // (donde vive lista-horarios/fila-horario) -- hay que cambiar de tab antes de poder
    // cargar franjas por día. A diferencia de la versión anterior de esta pantalla, la lista
    // de "Personalizado" arranca vacía (sin ninguna fila precargada) -- hay que agregar la
    // primera franja a mano con btn-agregar-horario, no asumir que ya existe una.
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
    await page.getByTestId('input-email').fill(cliente.email);
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

    // Los boxes del OTP todavía tienen los dígitos del intento incorrecto -- hay que
    // vaciarlos antes de cargar el código correcto, si no un valor mixto (mitad viejo,
    // mitad nuevo) dispara el auto-submit de crearInputOtp apenas se completan 6 dígitos.
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
    await page.getByTestId('input-email').fill(cliente.email);
    await page.getByTestId('input-password').fill(cliente.password);
    await page.getByTestId('btn-ingresar').click();
    await page.waitForURL('**/index.html');
  });

  test('registro-cliente: los inputs de DNI y teléfono bloquean letras y símbolos en tiempo real, no solo al enviar', async ({ page }) => {
    await page.goto('/registro-cliente.html');

    const dniInput = page.getByTestId('input-dni');
    await dniInput.pressSequentially('ab12cd345678');
    // input.js filtra no-dígitos y trunca a 8 en cada keystroke (auth.js, dniInput 'input') --
    // "ab12cd345678" solo aporta los dígitos "12345678", ya truncados a los primeros 8 al tipear.
    await expect(dniInput).toHaveValue('12345678');

    const telefonoInput = page.getByTestId('input-telefono');
    await telefonoInput.pressSequentially('29-64 abc123456789');
    // Mismo criterio: solo dígitos, truncado a 10 mientras se tipea.
    await expect(telefonoInput).toHaveValue('2964123456');
  });

  test('registro-cliente: un campo requerido vacío bloquea el paso 1 con el error visible', async ({ page }) => {
    await page.goto('/registro-cliente.html');

    await page.getByTestId('input-nombre').fill('Valentina');
    await page.getByTestId('input-apellido').fill('Domínguez');
    // DNI queda vacío a propósito.
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

    // Nombre del comercio queda vacío a propósito.
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
    await page.getByTestId('input-email').fill(`comercio.ui.${suf}@bajonea.test`);
    await page.getByTestId('input-password').fill('Testing123');
    await page.getByTestId('input-confirmar-password').fill('Testing123');
    await page.getByTestId('btn-continuar-2').click();

    await expect(page.getByTestId('mensaje-error-cuit')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-cuit')).toContainText('El CUIT debe tener 11 dígitos numéricos');
    await expect(page.getByTestId('lista-horarios')).toBeHidden();
  });
});
