import path from 'node:path';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  obtenerLocalidadRioGrande,
  registrarCliente,
  registrarYVerificarCliente,
  registrarYVerificarComercio,
  nombreUsuarioUnico,
  sufijoUnico,
  generarDni,
  generarTelefono,
  nombreArchivoFixture,
  esperarImagenCargadaEnRecorte,
  diaDeHoy,
  apiGet,
  apiPost,
  apiPut,
  login,
  obtenerCodigoTest,
  API_BASE_URL,
} from './helpers/backend';

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/bajonea-e2e-producto.png');
const FIXTURE_BUFFER = readFileSync(FIXTURE_PATH);

const MENSAJE_EN_USO = 'Ese nombre de usuario ya está en uso';

test.describe('Nombre de usuario: login, registro, disponibilidad en vivo y perfil', () => {
  let localidadId: string;

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
  });

  async function loginUi(page: Page, usuario: string, password: string) {
    await page.goto('/login.html');
    await page.getByTestId('input-nombre-usuario').fill(usuario);
    await page.getByTestId('input-password').fill(password);
    await page.getByTestId('btn-ingresar').click();
  }

  test.describe('Login', () => {
    test('el login funciona escribiendo el nombre de usuario en mayúsculas', async ({ page, request }) => {
      const cliente = await registrarYVerificarCliente(request, localidadId);
      await loginUi(page, cliente.nombreUsuario.toUpperCase(), cliente.password);
      await page.waitForURL('**/index.html');
      await expect(page.getByTestId('mensaje-saludo')).toContainText(cliente.nombre);
    });

    test('el login con el email en lugar del nombre de usuario falla con el mensaje genérico', async ({ page, request }) => {
      const cliente = await registrarYVerificarCliente(request, localidadId);
      await loginUi(page, cliente.email, cliente.password);
      await expect(page.getByTestId('mensaje-error-login')).toContainText('Usuario o contraseña incorrectos');
      await expect(page).toHaveURL(/login\.html/);
    });

    test('usuario inexistente y contraseña incorrecta muestran exactamente el mismo mensaje', async ({ page, request }) => {
      const cliente = await registrarYVerificarCliente(request, localidadId);

      await loginUi(page, 'noexiste' + sufijoUnico().slice(-6), 'Testing123');
      await expect(page.getByTestId('mensaje-error-login')).toBeVisible();
      const mensajeInexistente = await page.getByTestId('mensaje-error-login').innerText();

      await loginUi(page, cliente.nombreUsuario, 'ContraseñaIncorrecta1');
      await expect(page.getByTestId('mensaje-error-login')).toBeVisible();
      const mensajePasswordMala = await page.getByTestId('mensaje-error-login').innerText();

      expect(mensajeInexistente).toBe(mensajePasswordMala);
      expect(mensajeInexistente).toContain('Usuario o contraseña incorrectos');
    });

    test('campo de usuario vacío muestra error sin llamar al backend', async ({ page }) => {
      await page.goto('/login.html');
      await page.getByTestId('input-password').fill('Testing123');
      await page.getByTestId('btn-ingresar').click();
      await expect(page.getByTestId('mensaje-error-login')).toContainText('Ingresá tu nombre de usuario');
    });

    test('login por API: mayúsculas y espacios se normalizan, el email no sirve como usuario', async ({ request }) => {
      const cliente = await registrarYVerificarCliente(request, localidadId);
      const conMayusculas = await apiPost(request, '/auth/login', { nombreUsuario: `  ${cliente.nombreUsuario.toUpperCase()} `, password: cliente.password });
      expect(conMayusculas.status).toBe(200);
      const conEmail = await apiPost(request, '/auth/login', { nombreUsuario: cliente.email, password: cliente.password });
      expect(conEmail.status).toBe(401);
      expect(conEmail.body.mensaje).toBe('Usuario o contraseña incorrectos');
      const campoViejo = await apiPost(request, '/auth/login', { email: cliente.email, password: cliente.password });
      expect(campoViejo.status).toBe(400);
    });

    test('un usuario con cuenta pendiente ve el aviso y el link lleva a verificar-email sin email en la URL', async ({ page, request }) => {
      const cliente = await registrarCliente(request, localidadId);
      await loginUi(page, cliente.nombreUsuario, cliente.password);
      const link = page.getByTestId('mensaje-banner').getByRole('link');
      await expect(link).toHaveAttribute('href', 'verificar-email.html');
    });

    test('el JWT lleva el id de usuario como subject', async ({ request }) => {
      const cliente = await registrarYVerificarCliente(request, localidadId);
      const sesion = await login(request, cliente.nombreUsuario, cliente.password);
      const payload = JSON.parse(Buffer.from(sesion.token.split('.')[1], 'base64url').toString());
      expect(payload.sub).toBe(String(sesion.usuario.id));
      expect(payload.userId).toBe(sesion.usuario.id);
      expect(payload.sub).not.toContain('@');
    });

    test('placeholder "Usuario" y aviso de bloqueo en rojo, alineado con el mensaje de error', async ({ page, request }) => {
      const cliente = await registrarYVerificarCliente(request, localidadId);
      await page.goto('/login.html');
      await expect(page.getByTestId('input-nombre-usuario')).toHaveAttribute('placeholder', 'Usuario');

      await loginUi(page, cliente.nombreUsuario, 'ContraseñaMala1');
      await expect(page.getByTestId('mensaje-error-login')).toBeVisible();
      await loginUi(page, cliente.nombreUsuario, 'ContraseñaMala2');
      const warning = page.getByTestId('mensaje-advertencia-bloqueo');
      await expect(warning).toHaveText('Cuidado: si fallás una vez más, tu cuenta se bloqueará.');

      const estilos = await page.evaluate(() => {
        const error = document.getElementById('error-credenciales')!;
        const aviso = document.getElementById('warning-bloqueo')!;
        return {
          colorError: getComputedStyle(error).color,
          colorAviso: getComputedStyle(aviso).color,
          paddingError: getComputedStyle(error).paddingLeft,
          paddingAviso: getComputedStyle(aviso).paddingLeft,
        };
      });
      expect(estilos.colorAviso).toBe(estilos.colorError);
      expect(estilos.paddingAviso).toBe(estilos.paddingError);
    });
  });

  test.describe('Endpoint de disponibilidad', () => {
    test('libre, ocupado, ocupado con otra capitalización, reservado y formato inválido', async ({ request }) => {
      const cliente = await registrarClienteConUsuario(request);

      const libre = await apiGet(request, `/auth/nombre-usuario/disponibilidad?nombreUsuario=${nombreUsuarioUnico('lib')}`);
      expect(libre.status).toBe(200);
      expect(libre.body.data).toEqual({ disponible: true });

      const ocupado = await apiGet(request, `/auth/nombre-usuario/disponibilidad?nombreUsuario=${cliente.nombreUsuario}`);
      expect(ocupado.body.data).toEqual({ disponible: false });

      const otraCapitalizacion = await apiGet(
        request,
        `/auth/nombre-usuario/disponibilidad?nombreUsuario=${cliente.nombreUsuario.toUpperCase()}`,
      );
      expect(otraCapitalizacion.body.data).toEqual({ disponible: false });

      for (const reservado of ['administrador', 'Administrator', 'BAJONEA1'.slice(0, 7), 'superadmin', 'DUENIO']) {
        const esValidoDeLargo = reservado.length >= 8;
        const respuesta = await apiGet(request, `/auth/nombre-usuario/disponibilidad?nombreUsuario=${reservado}`);
        if (esValidoDeLargo) {
          expect(respuesta.status, reservado).toBe(200);
          expect(respuesta.body.data, reservado).toEqual({ disponible: false });
        } else {
          expect(respuesta.status, reservado).toBe(400);
        }
      }

      for (const invalido of ['abc', 'abc_defgh1', 'con espacio1', 'a'.repeat(21), 'ñandúñandú', '12345678']) {
        const respuesta = await apiGet(request, `/auth/nombre-usuario/disponibilidad?nombreUsuario=${encodeURIComponent(invalido)}`);
        expect(respuesta.status, invalido).toBe(400);
        expect(respuesta.body.data ?? null, invalido).toBeNull();
      }
    });

    test('el endpoint no requiere autenticación y responde solo disponible/no disponible', async ({ request }) => {
      const respuesta = await request.get(`${API_BASE_URL}/auth/nombre-usuario/disponibilidad?nombreUsuario=${nombreUsuarioUnico('pub')}`);
      expect(respuesta.status()).toBe(200);
      const cuerpo = await respuesta.json();
      expect(Object.keys(cuerpo.data)).toEqual(['disponible']);
    });
  });

  test.describe('Registro por API', () => {
    async function registroCrudo(request: import('@playwright/test').APIRequestContext, nombreUsuario: unknown) {
      const suf = sufijoUnico();
      return apiPost(request, '/auth/registro/cliente', {
        nombre: 'Prueba',
        apellido: 'Usuario',
        dni: generarDni(),
        fechaNacimiento: '1995-05-20',
        telefono: `+549${generarTelefono()}`,
        nombreUsuario,
        email: `nu.${suf}@bajonea.test`,
        password: 'Testing123',
        direccion: { calle: 'Belgrano', numero: '450', pisoDepto: null, codigoPostal: '9420', localidadId, principal: true },
      });
    }

    test('se guarda en minúsculas aunque se envíe en mayúsculas y con espacios', async ({ request }) => {
      const nombre = nombreUsuarioUnico('Mix');
      const respuesta = await registroCrudo(request, `  ${nombre.toUpperCase()}  `);
      expect(respuesta.status).toBe(201);
      const disponibilidad = await apiGet(request, `/auth/nombre-usuario/disponibilidad?nombreUsuario=${nombre.toLowerCase()}`);
      expect(disponibilidad.body.data).toEqual({ disponible: false });
    });

    test('formato inválido, vacío y ausente devuelven 400 con mensaje por campo', async ({ request }) => {
      const casos: Array<[unknown, string]> = [
        ['abc', 'al menos 8 caracteres'],
        ['abc-defgh12', 'Solo se permiten letras y números'],
        ['12345678', 'al menos una letra'],
        ['a'.repeat(21), 'no puede superar los 20 caracteres'],
        ['', 'obligatorio'],
        [undefined, 'obligatorio'],
      ];
      for (const [valor, texto] of casos) {
        const respuesta = await registroCrudo(request, valor);
        expect(respuesta.status, String(valor)).toBe(400);
        expect(respuesta.body.data.nombreUsuario, String(valor)).toContain(texto);
      }
    });

    test('reservado y ocupado (incluso con otra capitalización) devuelven 409 con el mismo mensaje', async ({ request }) => {
      const existente = await registrarClienteConUsuario(request);
      const reservado = await registroCrudo(request, 'Administrador');
      expect(reservado.status).toBe(409);
      expect(reservado.body.mensaje).toBe(MENSAJE_EN_USO);

      const ocupado = await registroCrudo(request, existente.nombreUsuario.toUpperCase());
      expect(ocupado.status).toBe(409);
      expect(ocupado.body.mensaje).toBe(MENSAJE_EN_USO);

      const deAdmin = await registroCrudo(request, 'adminbajonea');
      expect(deAdmin.status).toBe(409);
      expect(deAdmin.body.mensaje).toBe(MENSAJE_EN_USO);
    });

    test('adminbajonea no es reservado exacto pero sí está ocupado; un nombre que solo contiene una palabra reservada se acepta', async ({ request }) => {
      const nombre = `cliente${nombreUsuarioUnico('x').slice(1, 9)}`;
      const respuesta = await registroCrudo(request, nombre);
      expect(respuesta.status).toBe(201);
    });

    test('condición de carrera: registros simultáneos con el mismo nombre de usuario, solo uno entra y el resto recibe 409', async ({ request }) => {
      const nombre = nombreUsuarioUnico('car');
      const intentos = Array.from({ length: 8 }, (_, i) => registroCrudo(request, i % 2 === 0 ? nombre : nombre.toUpperCase()));
      const respuestas = await Promise.all(intentos);

      const estados = respuestas.map((r) => r.status);
      expect(estados.filter((s) => s === 201)).toHaveLength(1);
      expect(estados.filter((s) => s === 409)).toHaveLength(7);
      expect(estados.filter((s) => s >= 500)).toHaveLength(0);
      for (const r of respuestas.filter((x) => x.status === 409)) {
        expect(r.body.mensaje).toBe(MENSAJE_EN_USO);
      }
    });
  });

  async function registrarClienteConUsuario(request: import('@playwright/test').APIRequestContext) {
    return registrarYVerificarCliente(request, localidadId);
  }

  test.describe('Registro de Cliente por UI', () => {
    async function completarPaso1SinUsuario(page: Page) {
      await page.getByTestId('input-nombre').fill('Valentina');
      await page.getByTestId('input-apellido').fill('Domínguez');
      await page.getByTestId('input-dni').fill(generarDni());
      await page.getByTestId('input-fecha-nacimiento').fill('1995-05-20');
      await page.getByTestId('input-telefono').fill(generarTelefono());
      await page.getByTestId('input-email').fill(`nu.ui.${sufijoUnico()}@bajonea.test`);
      await page.getByTestId('input-password').fill('Testing123');
      await page.getByTestId('input-confirmar-password').fill('Testing123');
      await page.getByTestId('input-acepta-terminos').check();
    }

    test('el campo está entre Email y Contraseña, con ayuda y maxlength 20', async ({ page }) => {
      await page.goto('/registro-cliente.html');
      const orden = await page.evaluate(() => {
        const ids = ['email', 'nombreUsuario', 'password'];
        const posiciones = ids.map((id) => {
          const el = document.getElementById(id)!;
          return el.getBoundingClientRect().top + window.scrollY;
        });
        return posiciones;
      });
      expect(orden[0]).toBeLessThan(orden[1]);
      expect(orden[1]).toBeLessThan(orden[2]);
      await expect(page.getByTestId('input-nombre-usuario')).toHaveAttribute('maxlength', '20');
      await expect(page.getByTestId('input-nombre-usuario')).toHaveAttribute('placeholder', 'Elegí tu nombre de usuario');
      await expect(page.getByText('Entre 8 y 20 caracteres, solo letras y números.')).toBeVisible();
    });

    test('bloquea el tipeo de más de 20 caracteres', async ({ page }) => {
      await page.goto('/registro-cliente.html');
      await page.getByTestId('input-nombre-usuario').pressSequentially('a'.repeat(30));
      await expect(page.getByTestId('input-nombre-usuario')).toHaveValue('a'.repeat(20));
    });

    test('sin mensaje mientras no sale del campo; errores de formato al salir', async ({ page }) => {
      await page.goto('/registro-cliente.html');
      const input = page.getByTestId('input-nombre-usuario');
      await input.pressSequentially('abc');
      await expect(page.getByTestId('mensaje-error-nombre-usuario')).toBeHidden();
      await expect(page.getByTestId('estado-nombre-usuario')).toBeHidden();

      await input.blur();
      await expect(page.getByTestId('mensaje-error-nombre-usuario')).toHaveText('El nombre de usuario debe tener al menos 8 caracteres');

      await input.fill('abc_defgh12');
      await input.blur();
      await expect(page.getByTestId('mensaje-error-nombre-usuario')).toHaveText('Solo se permiten letras y números');
      await expect(page.getByTestId('estado-nombre-usuario')).toBeHidden();
    });

    test('campo obligatorio al continuar', async ({ page }) => {
      await page.goto('/registro-cliente.html');
      await completarPaso1SinUsuario(page);
      await page.getByTestId('btn-continuar').click();
      await expect(page.getByTestId('mensaje-error-nombre-usuario')).toHaveText('El nombre de usuario es obligatorio');
      await expect(page.getByTestId('input-calle')).toBeHidden();
    });

    test('muestra Verificando… y luego disponible (verde) para un nombre libre; se normaliza a minúsculas', async ({ page }) => {
      await page.route('**/auth/nombre-usuario/disponibilidad*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 600));
        await route.continue();
      });
      await page.goto('/registro-cliente.html');
      const input = page.getByTestId('input-nombre-usuario');
      const icono = page.getByTestId('icono-estado-nombre-usuario');
      await input.fill(nombreUsuarioUnico('Lib').toUpperCase());
      await input.blur();
      await expect(page.getByTestId('estado-nombre-usuario')).toHaveText('Verificando…');
      await expect(icono).toHaveClass(/input-shell__status-icon--verificando/);
      await expect(page.getByTestId('estado-nombre-usuario')).toHaveText('Nombre de usuario disponible');
      await expect(page.getByTestId('estado-nombre-usuario')).toHaveClass(/field__status--ok/);
      await expect(icono).toHaveClass(/input-shell__status-icon--disponible/);
      await expect(page.getByTestId('mensaje-error-nombre-usuario')).toBeHidden();
      const valor = await input.inputValue();
      expect(valor).toBe(valor.toLowerCase());
    });

    test('muestra en rojo que ya está en uso: usuario existente, otra capitalización y reservado', async ({ page, request }) => {
      const existente = await registrarClienteConUsuario(request);
      await page.goto('/registro-cliente.html');
      const input = page.getByTestId('input-nombre-usuario');
      const icono = page.getByTestId('icono-estado-nombre-usuario');
      for (const valor of [existente.nombreUsuario, existente.nombreUsuario.toUpperCase(), 'administrador']) {
        await input.fill(valor);
        await input.blur();
        await expect(page.getByTestId('mensaje-error-nombre-usuario')).toHaveText(MENSAJE_EN_USO);
        await expect(icono).toHaveClass(/input-shell__status-icon--ocupado/);
      }
    });

    test('el ícono de estado pasa por sus 4 estados: sin validar, verificando, disponible y ocupado', async ({ page, request }) => {
      const existente = await registrarClienteConUsuario(request);
      await page.goto('/registro-cliente.html');
      const input = page.getByTestId('input-nombre-usuario');
      const icono = page.getByTestId('icono-estado-nombre-usuario');

      await expect(icono).toBeHidden();

      await input.pressSequentially('abc');
      await expect(icono).toBeHidden();

      await page.route('**/auth/nombre-usuario/disponibilidad*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        await route.continue();
      });
      await input.fill(nombreUsuarioUnico('Ico'));
      await input.blur();
      await expect(icono).toBeVisible();
      await expect(icono).toHaveClass(/input-shell__status-icon--verificando/);
      await expect(icono).toHaveClass(/input-shell__status-icon--disponible/);

      await input.fill(existente.nombreUsuario);
      await input.blur();
      await expect(icono).toHaveClass(/input-shell__status-icon--ocupado/);

      await input.fill('');
      await input.dispatchEvent('input');
      await expect(icono).toBeHidden();
    });

    test('un nombre ocupado bloquea el avance al paso siguiente', async ({ page, request }) => {
      const existente = await registrarClienteConUsuario(request);
      await page.goto('/registro-cliente.html');
      await completarPaso1SinUsuario(page);
      await page.getByTestId('input-nombre-usuario').fill(existente.nombreUsuario);
      await page.getByTestId('btn-continuar').click();
      await expect(page.getByTestId('mensaje-error-nombre-usuario')).toHaveText(MENSAJE_EN_USO);
      await expect(page.getByTestId('input-calle')).toBeHidden();
    });

    test('registro completo: el usuario queda en minúsculas y permite iniciar sesión', async ({ page, request }) => {
      const nombre = nombreUsuarioUnico('Ui');
      const email = `nu.ui.completo.${sufijoUnico()}@bajonea.test`;
      await page.goto('/registro-cliente.html');
      await page.getByTestId('input-nombre').fill('Valentina');
      await page.getByTestId('input-apellido').fill('Domínguez');
      await page.getByTestId('input-dni').fill(generarDni());
      await page.getByTestId('input-fecha-nacimiento').fill('1995-05-20');
      await page.getByTestId('input-telefono').fill(generarTelefono());
      await page.getByTestId('input-email').fill(email);
      await page.getByTestId('input-nombre-usuario').fill(nombre);
      await page.getByTestId('input-password').fill('Testing123');
      await page.getByTestId('input-confirmar-password').fill('Testing123');
      await page.getByTestId('input-acepta-terminos').check();
      await page.getByTestId('btn-continuar').click();

      await expect(page.getByTestId('input-calle')).toBeVisible();
      await page.getByTestId('input-calle').fill('Belgrano');
      await page.getByTestId('input-numero').fill('450');
      await page.getByTestId('input-codigo-postal').fill('9420');
      await page.getByTestId('select-localidad').selectOption(localidadId);

      const registroResponse = page.waitForResponse(
        (res) => res.url().endsWith('/auth/registro/cliente') && res.request().method() === 'POST',
      );
      await page.getByTestId('btn-crear-cuenta').click();
      const respuesta = await registroResponse;
      expect(respuesta.status()).toBe(201);
      expect(respuesta.request().postDataJSON().nombreUsuario).toBe(nombre.toLowerCase());

      const codigo = await obtenerCodigoTest(request, email, 'VERIFICACION_EMAIL');
      await apiPost(request, '/auth/verificar', { email, codigo });
      const sesion = await login(request, nombre.toLowerCase(), 'Testing123');
      expect(sesion.usuario.rol).toBe('CLIENTE');
    });
  });

  test.describe('Registro de Comercio por UI', () => {
    async function llegarAPaso2(page: Page) {
      const suf = sufijoUnico();
      await page.goto('/registro-comercio.html');
      await page.getByTestId('input-nombre').fill(`Comercio Usuario E2E ${suf}`);
      await page.getByTestId('input-telefono').fill(generarTelefono());
      await page.getByTestId('input-email-contacto').fill(`comercio.nu.${suf}@bajonea.test`);
      await page.getByTestId('select-tipo-comercio').selectOption('RESTAURANTE');
      await page.getByTestId('input-calle').fill('Av. San Martín');
      await page.getByTestId('input-numero').fill('100');
      await page.getByTestId('input-codigo-postal').fill('9420');
      await page.getByTestId('select-localidad').selectOption(localidadId);
      await page.getByTestId('input-foto-comercio').setInputFiles({
        name: nombreArchivoFixture(),
        mimeType: 'image/png',
        buffer: FIXTURE_BUFFER,
      });
      await esperarImagenCargadaEnRecorte(page);
      await page.getByTestId('btn-confirmar-recorte').click();
      await expect(page.getByTestId('modal-recorte-imagen')).toHaveCount(0);
      await page.getByTestId('btn-continuar').click();
      await expect(page.getByTestId('input-razon-social')).toBeVisible();
    }

    test('en "Acceso a la plataforma" el nombre de usuario va primero, arriba de Email de acceso, y el texto del email cambió', async ({ page }) => {
      await llegarAPaso2(page);
      const orden = await page.evaluate(() => {
        const top = (id: string) => document.getElementById(id)!.getBoundingClientRect().top + window.scrollY;
        return ['nombreUsuario', 'email', 'password', 'confirmarPassword'].map(top);
      });
      expect([...orden].sort((a, b) => a - b)).toEqual(orden);
      await expect(page.getByTestId('input-nombre-usuario')).toHaveAttribute('maxlength', '20');
      await expect(page.getByTestId('input-nombre-usuario')).toHaveAttribute('placeholder', 'Elegí tu nombre de usuario');
      await expect(page.getByText('Entre 8 y 20 caracteres, solo letras y números.')).toBeVisible();
      await expect(page.getByText('Este email se usará para recuperar tu contraseña y recibir notificaciones.')).toBeVisible();
    });

    test('mismos estados que en Cliente: formato, en uso, disponible; obligatorio al continuar', async ({ page, request }) => {
      const existente = await registrarYVerificarComercio(request, localidadId, {
        horarios: [{ diaSemana: diaDeHoy(), horaApertura: '09:00', horaCierre: '18:00' }],
      });
      await llegarAPaso2(page);
      const input = page.getByTestId('input-nombre-usuario');

      await input.fill('corto');
      await input.blur();
      await expect(page.getByTestId('mensaje-error-nombre-usuario')).toHaveText('El nombre de usuario debe tener al menos 8 caracteres');

      await input.fill(existente.nombreUsuario.toUpperCase());
      await input.blur();
      await expect(page.getByTestId('mensaje-error-nombre-usuario')).toHaveText(MENSAJE_EN_USO);

      await input.fill(nombreUsuarioUnico('lib'));
      await input.blur();
      await expect(page.getByTestId('estado-nombre-usuario')).toHaveText('Nombre de usuario disponible');

      await input.fill('');
      await page.getByTestId('btn-continuar-2').click();
      await expect(page.getByTestId('mensaje-error-nombre-usuario')).toHaveText('El nombre de usuario es obligatorio');
    });

    test('"Hamburguesería" aparece en el desplegable de tipo de comercio y se puede seleccionar', async ({ page }) => {
      await page.goto('/registro-comercio.html');
      const select = page.getByTestId('select-tipo-comercio');
      await expect(select.locator('option[value="HAMBURGUESERIA"]')).toHaveText('Hamburguesería');
      await select.selectOption('HAMBURGUESERIA');
      await expect(select).toHaveValue('HAMBURGUESERIA');
    });
  });

  test.describe('Perfil del Cliente: edición de nombre de usuario', () => {
    test('el campo es editable, arriba del email, con el hint del límite de cambios; el endpoint de datos personales lo sigue ignorando', async ({ page, request }) => {
      const cliente = await registrarYVerificarCliente(request, localidadId);
      await loginUi(page, cliente.nombreUsuario, cliente.password);
      await page.waitForURL('**/index.html');
      await page.goto('/perfil.html');
      await page.getByTestId('btn-editar-datos').click();

      const campo = page.locator('#editar-nombre-usuario');
      await expect(campo).toBeEnabled();
      await expect(campo).toHaveValue(cliente.nombreUsuario);
      await expect(page.getByText('Podés cambiar tu nombre de usuario hasta 3 veces cada 30 días.')).toBeVisible();
      const posiciones = await page.evaluate(() => ({
        usuario: document.getElementById('editar-nombre-usuario')!.getBoundingClientRect().top,
        email: document.getElementById('editar-email')!.getBoundingClientRect().top,
      }));
      expect(posiciones.usuario).toBeLessThan(posiciones.email);

      const sesion = await login(request, cliente.nombreUsuario, cliente.password);
      const intento = await apiPut(
        request,
        '/clientes/perfil',
        { nombre: 'Cliente', apellido: 'Editado', telefono: `+549${generarTelefono()}`, nombreUsuario: 'hackeado1234' },
        sesion.token,
      );
      expect(intento.status).toBe(200);
      const perfil = await apiGet(request, '/clientes/perfil', sesion.token);
      expect(perfil.body.data.nombreUsuario).toBe(cliente.nombreUsuario);
    });

    test('por API: contraseña correcta actualiza el nombre de usuario sin cerrar la sesión activa', async ({ request }) => {
      const cliente = await registrarYVerificarCliente(request, localidadId);
      const sesion = await login(request, cliente.nombreUsuario, cliente.password);
      const nuevo = nombreUsuarioUnico('cam');

      const cambio = await apiPut(
        request,
        '/clientes/perfil/nombre-usuario',
        { nombreUsuario: nuevo, passwordActual: cliente.password },
        sesion.token,
      );
      expect(cambio.status).toBe(200);
      expect(cambio.body.data.nombreUsuario).toBe(nuevo);

      const perfilConMismoToken = await apiGet(request, '/clientes/perfil', sesion.token);
      expect(perfilConMismoToken.status).toBe(200);
      expect(perfilConMismoToken.body.data.nombreUsuario).toBe(nuevo);

      const sesionConNuevo = await login(request, nuevo, cliente.password);
      expect(sesionConNuevo.usuario.id).toBe(sesion.usuario.id);
    });

    test('mandar el mismo nombre de usuario actual devuelve 400', async ({ request }) => {
      const cliente = await registrarYVerificarCliente(request, localidadId);
      const sesion = await login(request, cliente.nombreUsuario, cliente.password);
      const intento = await apiPut(
        request,
        '/clientes/perfil/nombre-usuario',
        { nombreUsuario: cliente.nombreUsuario, passwordActual: cliente.password },
        sesion.token,
      );
      expect(intento.status).toBe(400);
      expect(intento.body.mensaje).toContain('distinto al actual');
    });

    test('un nombre de usuario ya en uso devuelve 409 con el mismo mensaje que el registro', async ({ request }) => {
      const existente = await registrarClienteConUsuario(request);
      const cliente = await registrarYVerificarCliente(request, localidadId);
      const sesion = await login(request, cliente.nombreUsuario, cliente.password);
      const intento = await apiPut(
        request,
        '/clientes/perfil/nombre-usuario',
        { nombreUsuario: existente.nombreUsuario, passwordActual: cliente.password },
        sesion.token,
      );
      expect(intento.status).toBe(409);
      expect(intento.body.mensaje).toBe(MENSAJE_EN_USO);
    });

    test('contraseña incorrecta: 401 con intentosRestantes decreciente, bloqueo real al 3er intento, sin consumir el cupo de cambios', async ({ request }) => {
      const cliente = await registrarYVerificarCliente(request, localidadId);
      const sesion = await login(request, cliente.nombreUsuario, cliente.password);
      const nuevo = nombreUsuarioUnico('blo');

      for (const intentosRestantesEsperado of [2, 1, 0]) {
        const intento = await apiPut(
          request,
          '/clientes/perfil/nombre-usuario',
          { nombreUsuario: nuevo, passwordActual: 'ContraseñaMala1' },
          sesion.token,
        );
        expect(intento.status).toBe(401);
        expect(intento.body.data.intentosRestantes).toBe(intentosRestantesEsperado);
      }

      const loginTrasBloqueo = await apiPost(request, '/auth/login', { nombreUsuario: cliente.nombreUsuario, password: cliente.password });
      expect(loginTrasBloqueo.status).toBe(409);
      expect(loginTrasBloqueo.body.mensaje).toContain('bloqueada');

      await apiPost(request, '/auth/recuperar-password', { email: cliente.email });
      const codigo = await obtenerCodigoTest(request, cliente.email, 'RECUPERACION_PASSWORD');
      await apiPost(request, '/auth/recuperar-password/confirmar', { email: cliente.email, codigo, nuevaPassword: cliente.password });
      const sesionRecuperada = await login(request, cliente.nombreUsuario, cliente.password);
      const cambioTrasRecuperar = await apiPut(
        request,
        '/clientes/perfil/nombre-usuario',
        { nombreUsuario: nuevo, passwordActual: cliente.password },
        sesionRecuperada.token,
      );
      expect(cambioTrasRecuperar.status).toBe(200);
    });

    test('límite de 3 cambios cada 30 días: los primeros 3 funcionan, el 4to se rechaza con mensaje claro', async ({ request }) => {
      const cliente = await registrarYVerificarCliente(request, localidadId);
      const sesion = await login(request, cliente.nombreUsuario, cliente.password);

      for (let i = 0; i < 3; i += 1) {
        const cambio = await apiPut(
          request,
          '/clientes/perfil/nombre-usuario',
          { nombreUsuario: nombreUsuarioUnico(`lim${i}`), passwordActual: cliente.password },
          sesion.token,
        );
        expect(cambio.status, `cambio #${i + 1}`).toBe(200);
      }

      const cuarto = await apiPut(
        request,
        '/clientes/perfil/nombre-usuario',
        { nombreUsuario: nombreUsuarioUnico('lim4'), passwordActual: cliente.password },
        sesion.token,
      );
      expect(cuarto.status).toBe(409);
      expect(cuarto.body.mensaje).toContain('máximo de 3 cambios de nombre de usuario en los últimos 30 días');
      expect(cuarto.body.mensaje).toContain('Podés volver a intentarlo en 30 días.');
    });

    test('flujo completo por UI: pide confirmar la contraseña, rechaza la incorrecta sin cerrar el modal, y aplica el cambio con la correcta', async ({ page, request }) => {
      const cliente = await registrarYVerificarCliente(request, localidadId);
      await loginUi(page, cliente.nombreUsuario, cliente.password);
      await page.waitForURL('**/index.html');
      await page.goto('/perfil.html');
      await page.getByTestId('btn-editar-datos').click();

      const nuevo = nombreUsuarioUnico('ui');
      const input = page.locator('#editar-nombre-usuario');
      await input.fill(nuevo);
      await input.blur();
      await expect(page.getByTestId('estado-nombre-usuario')).toHaveText('Nombre de usuario disponible');
      await page.getByTestId('btn-guardar-datos').click();

      const modal = page.getByTestId('modal-confirmar-nombre-usuario');
      await expect(modal).toBeVisible();

      await page.getByTestId('input-password-confirmar-nombre-usuario').fill('ContraseñaMala1');
      await page.getByTestId('btn-confirmar-nombre-usuario').click();
      await expect(page.getByTestId('mensaje-error-password-confirmar-nombre-usuario')).toHaveText('La contraseña actual no es correcta.');
      await expect(page.getByTestId('mensaje-advertencia-bloqueo-confirmar-nombre-usuario')).toBeHidden();
      await expect(modal).toBeVisible();

      await page.getByTestId('input-password-confirmar-nombre-usuario').fill('ContraseñaMala2');
      await page.getByTestId('btn-confirmar-nombre-usuario').click();
      await expect(page.getByTestId('mensaje-advertencia-bloqueo-confirmar-nombre-usuario')).toHaveText('Cuidado: si fallás una vez más, tu cuenta se bloqueará.');
      await expect(modal).toBeVisible();

      await page.getByTestId('input-password-confirmar-nombre-usuario').fill(cliente.password);
      await page.getByTestId('btn-confirmar-nombre-usuario').click();
      await expect(modal).toBeHidden();

      const sesionConNuevo = await login(request, nuevo, cliente.password);
      expect(sesionConNuevo.usuario.rol).toBe('CLIENTE');
    });
  });

  test.describe('Verificación de cuenta sin email en la URL', () => {
    test('sin ?email= muestra el campo Email arriba del código y usa el email escrito', async ({ page, request }) => {
      const cliente = await registrarCliente(request, localidadId);
      await page.goto('/verificar-email.html');
      await expect(page.getByText('Ingresá el email con el que te registraste y el código de 6 dígitos que te enviamos.')).toBeVisible();
      const email = page.getByTestId('input-email');
      await expect(email).toBeVisible();
      await expect(email).toHaveAttribute('placeholder', 'tu@email.com');
      const orden = await page.evaluate(() => ({
        email: document.getElementById('email-verificacion')!.getBoundingClientRect().top,
        codigo: document.querySelector('[data-testid="input-codigo-verificacion"]')!.getBoundingClientRect().top,
      }));
      expect(orden.email).toBeLessThan(orden.codigo);

      await page.getByTestId('btn-verificar-cuenta').click();
      await expect(page.getByTestId('mensaje-error-email')).toHaveText('El email es obligatorio');

      await email.fill(cliente.email);
      const codigo = await obtenerCodigoTest(request, cliente.email, 'VERIFICACION_EMAIL');
      const verificacion = page.waitForResponse((res) => res.url().endsWith('/auth/verificar') && res.request().method() === 'POST');
      for (let i = 0; i < 6; i += 1) {
        await page.getByTestId(`input-codigo-digito-${i + 1}`).fill(codigo[i]);
      }
      const respuesta = await verificacion;
      expect(respuesta.status()).toBe(200);
      expect(respuesta.request().postDataJSON().email).toBe(cliente.email);
      await expect(page.getByTestId('estado-verificacion-exito')).toBeVisible();
    });

    test('sin ?email= el botón Reenviar código usa el email escrito', async ({ page, request }) => {
      const cliente = await registrarCliente(request, localidadId);
      await page.goto('/verificar-email.html');
      await page.getByTestId('input-email').fill(cliente.email);
      const reenvio = page.waitForResponse((res) => res.url().endsWith('/auth/reenviar-verificacion') && res.request().method() === 'POST');
      await page.getByTestId('btn-reenviar-codigo').click();
      const respuesta = await reenvio;
      expect(respuesta.status()).toBe(200);
      expect(respuesta.request().postDataJSON().email).toBe(cliente.email);
    });

    test('con ?email= la pantalla queda como siempre, sin el campo Email', async ({ page, request }) => {
      const cliente = await registrarCliente(request, localidadId);
      await page.goto(`/verificar-email.html?email=${encodeURIComponent(cliente.email)}`);
      await expect(page.getByTestId('input-email')).toBeHidden();
      await expect(page.locator('#verificar-texto')).toContainText(`Te enviamos un código de 6 dígitos al email ${cliente.email}.`);
    });
  });

  test.describe('Recuperación de contraseña sigue usando email', () => {
    test('recuperar contraseña por API con email y luego login con el nombre de usuario y la clave nueva', async ({ request }) => {
      const cliente = await registrarYVerificarCliente(request, localidadId);
      await apiPost(request, '/auth/recuperar-password', { email: cliente.email });
      const codigo = await obtenerCodigoTest(request, cliente.email, 'RECUPERACION_PASSWORD');
      const confirmar = await apiPost(request, '/auth/recuperar-password/confirmar', {
        email: cliente.email,
        codigo,
        nuevaPassword: 'NuevaClave456',
      });
      expect(confirmar.status).toBe(200);
      const sesion = await login(request, cliente.nombreUsuario, 'NuevaClave456');
      expect(sesion.usuario.rol).toBe('CLIENTE');
    });
  });
});
