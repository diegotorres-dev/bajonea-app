import { test, expect } from '@playwright/test';
import type { APIRequestContext, Page, Request } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import {
  apiGet,
  apiPost,
  fijarPasswordAdminYLoguear,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  verificarCuenta,
  sufijoUnico,
  generarDni,
  generarCuit,
  generarTelefono,
  diaDeHoy,
  ADMIN_EMAIL,
  ADMIN_USUARIO,
  ADMIN_PASSWORD_CONOCIDA,
  type SesionApi,
  nombreUsuarioUnico,
} from './helpers/backend';

async function registrarYVerificarComercioSinCloudinaryReal(request: APIRequestContext, localidadId: string) {
  const suf = sufijoUnico();
  const email = `comercio.tarifas.e2e.${suf}@bajonea.test`;
  const nombreUsuario = nombreUsuarioUnico('com');
  const password = 'Testing123';
  const payload = {
    fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/v1/comercios/fixture.jpg',
    razonSocial: `Razon Social Tarifas E2E ${suf}`,
    cuit: generarCuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. San Martín 100',
    fechaInicioActividades: '2020-01-01',
    nombre: `Comercio Tarifas E2E ${suf}`,
    descripcion: 'Comercio de prueba generado por Playwright (spec 18, sin Cloudinary real)',
    telefono: `+549${generarTelefono()}`,
    emailContacto: email,
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: true,
    aceptaRetiro: false,
    nombreUsuario,
    email,
    password,
    direccion: {
      calle: 'Av. San Martín',
      numero: '100',
      pisoDepto: null,
      codigoPostal: '9420',
      localidadId,
      principal: true,
    },
    horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/comercio.tarifas.e2e.${suf}` }],
    nombreRepresentante: 'Representante',
    apellidoRepresentante: 'Playwright',
    dniRepresentante: generarDni(),
    telefonoRepresentante: `+549${generarTelefono()}`,
    fechaNacimientoRepresentante: '1985-03-15',
  };
  const { status, body } = await apiPost(request, '/auth/registro/comercio', payload);
  if (status !== 201) {
    throw new Error(`No se pudo registrar el comercio ${email}: ${status} ${JSON.stringify(body)}`);
  }
  await verificarCuenta(request, email);
  return { nombreUsuario, email, password };
}

const MYSQL_EXE = 'C:/xampp/mysql/bin/mysql.exe';

const idsTarifaCreados: number[] = [];

function formatearCargoTest(valor: number, tipo: string): string {
  if (tipo === 'PORCENTAJE') {
    const texto = valor % 1 === 0 ? valor.toFixed(0) : valor.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return `${texto}%`;
  }
  return `$${Math.round(valor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

async function loginAdminUi(page: Page) {
  await page.goto('/login.html');
  await page.getByTestId('input-nombre-usuario').fill(ADMIN_USUARIO);
  await page.getByTestId('input-password').fill(ADMIN_PASSWORD_CONOCIDA);
  await page.getByTestId('btn-ingresar').click();
  await page.waitForURL('**/admin-dashboard.html');
}

test.describe('Configuración de Tarifas (Administrador)', () => {
  test.afterAll(() => {
    if (idsTarifaCreados.length === 0) {
      return;
    }
    const idsSql = idsTarifaCreados.join(',');
    execFileSync(
      MYSQL_EXE,
      ['-u', 'root', 'bajonea_test', '-e', `DELETE FROM configuracion_tarifa WHERE id IN (${idsSql});`],
    );
  });

  test('flujo completo: navegar desde el dashboard, ver la tarifa vigente real, validar el formulario vacío, cancelar y luego confirmar una tarifa nueva', async ({
    request,
    page,
  }) => {
    const adminSesion: SesionApi = await fijarPasswordAdminYLoguear(request);
    const vigenteAntes = (await apiGet(request, '/administrador/tarifas/vigente', adminSesion.token)).body.data;

    await loginAdminUi(page);
    await page.getByTestId('tile-gestion-tarifas').click();
    await page.waitForURL('**/admin-tarifas.html');

    const contenido = page.getByTestId('contenido-tarifas');
    await expect(contenido).toContainText(formatearCargoTest(vigenteAntes.cargoCliente, vigenteAntes.tipoCargoCliente));
    await expect(contenido).toContainText(formatearCargoTest(vigenteAntes.cargoComercio, vigenteAntes.tipoCargoComercio));

    await page.getByTestId('btn-nueva-tarifa').click();
    await expect(page.getByTestId('modal-nueva-tarifa')).toBeVisible();

    const inputCliente = page.getByTestId('input-valor-cargo-cliente');
    const inputComercio = page.getByTestId('input-valor-cargo-comercio');
    const selectCliente = page.getByTestId('select-tipo-cargo-cliente');
    const selectComercio = page.getByTestId('select-tipo-cargo-comercio');

    await expect(inputCliente).toHaveValue('');
    await expect(inputComercio).toHaveValue('');
    await expect(selectCliente).toHaveValue('FIJO');
    await expect(selectComercio).toHaveValue('PORCENTAJE');

    let seEnvioAlgo = false;
    const detectarEnvio = (req: Request) => {
      if (req.url().endsWith('/administrador/tarifas') && req.method() === 'POST') {
        seEnvioAlgo = true;
      }
    };
    page.on('request', detectarEnvio);
    await page.getByTestId('btn-guardar-nueva-tarifa').click();
    await expect(page.getByTestId('mensaje-error-cargo-cliente')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-cargo-cliente')).toContainText('Ingresá un valor numérico igual o mayor a 0.');
    await expect(page.getByTestId('mensaje-error-cargo-comercio')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-cargo-comercio')).toContainText('Ingresá un valor numérico igual o mayor a 0.');
    await expect(page.getByTestId('modal-confirmar-tarifa')).toHaveCount(0);
    expect(seEnvioAlgo).toBe(false);
    page.off('request', detectarEnvio);

    await inputCliente.fill('250');
    await inputComercio.fill('3');
    await page.getByTestId('btn-guardar-nueva-tarifa').click();

    const modalConfirmar = page.getByTestId('modal-confirmar-tarifa');
    await expect(modalConfirmar).toBeVisible();
    await expect(modalConfirmar).toContainText('$250 al cliente');
    await expect(modalConfirmar).toContainText('3% al comercio');

    await page.getByTestId('btn-cancelar-confirmar-tarifa').click();
    await expect(modalConfirmar).toHaveCount(0);
    await expect(page.getByTestId('modal-nueva-tarifa')).toBeVisible();
    await expect(inputCliente).toHaveValue('250');
    await expect(inputComercio).toHaveValue('3');

    const crearResponse = page.waitForResponse(
      (res) => res.url().endsWith('/administrador/tarifas') && res.request().method() === 'POST',
    );
    await page.getByTestId('btn-guardar-nueva-tarifa').click();
    await expect(page.getByTestId('modal-confirmar-tarifa')).toBeVisible();
    await page.getByTestId('btn-confirmar-nueva-tarifa').click();

    const creada = await crearResponse;
    expect(creada.status()).toBe(201);
    const nuevaTarifaId = (await creada.json()).data.id as number;
    idsTarifaCreados.push(nuevaTarifaId);

    await expect(page.getByTestId('modal-confirmar-tarifa')).toHaveCount(0);
    await expect(page.getByTestId('modal-nueva-tarifa')).toHaveCount(0);
    await expect(page.locator('.toast')).toContainText('Tarifa creada correctamente');

    await expect(contenido).toContainText('$250');
    await expect(contenido).toContainText('3%');

    await expect(contenido).toContainText(formatearCargoTest(vigenteAntes.cargoCliente, vigenteAntes.tipoCargoCliente));
    await expect(contenido).toContainText(formatearCargoTest(vigenteAntes.cargoComercio, vigenteAntes.tipoCargoComercio));
  });

  test('acceder a admin-tarifas.html sin rol Administrador redirige a login', async ({ page, request }) => {
    const localidadId = await obtenerLocalidadRioGrande(request);

    const cliente = await registrarYVerificarCliente(request, localidadId);
    await page.goto('/login.html');
    await page.getByTestId('input-nombre-usuario').fill(cliente.nombreUsuario);
    await page.getByTestId('input-password').fill(cliente.password);
    await page.getByTestId('btn-ingresar').click();
    await page.waitForURL('**/index.html');

    await page.goto('/admin-tarifas.html');
    await page.waitForURL('**/login.html');

    const comercio = await registrarYVerificarComercioSinCloudinaryReal(request, localidadId);
    await page.goto('/login.html');
    await page.getByTestId('input-nombre-usuario').fill(comercio.nombreUsuario);
    await page.getByTestId('input-password').fill(comercio.password);
    await page.getByTestId('btn-ingresar').click();
    await page.waitForURL('**/comercio-pendiente.html?id=*');

    await page.goto('/admin-tarifas.html');
    await page.waitForURL('**/login.html');
  });
});
