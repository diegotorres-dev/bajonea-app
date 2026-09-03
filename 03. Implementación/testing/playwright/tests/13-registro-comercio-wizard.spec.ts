import path from 'node:path';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  obtenerLocalidadRioGrande,
  sufijoUnico,
  generarDni,
  generarTelefono,
  generarCuit,
  diaDeHoy,
  diaDistintoDeHoy,
  nombreArchivoFixture,
} from './helpers/backend';

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/bajonea-e2e-producto.png');
const FIXTURE_BUFFER = readFileSync(FIXTURE_PATH);

/**
 * Tramo dedicado a lo que solo tiene sentido probar con navegador real sobre el wizard de
 * registro de Comercio (4 pasos): retención de datos entre pasos, bloqueo de teclado en vivo,
 * boundary de maxlength, y el comportamiento de los 2 tabs de "3. Horarios" sobre el mismo
 * array subyacente. El flujo feliz completo y los casos de "campo vacío"/"CUIT inválido" en
 * paso 1/2 ya están cubiertos en 01-registro-y-verificacion.spec.ts -- no se repiten acá.
 */
test.describe('Wizard de registro de Comercio: navegación entre pasos, teclado en vivo y horarios', () => {
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
    await page.getByTestId('btn-confirmar-recorte').click();
    await expect(page.getByTestId('modal-recorte-imagen')).toHaveCount(0);
  }

  interface DatosPaso1 {
    nombre: string;
    telefono: string;
    emailContacto: string;
    calle: string;
    numero: string;
    codigoPostal: string;
  }

  async function completarPaso1(page: Page, datos: DatosPaso1) {
    await page.getByTestId('input-nombre').fill(datos.nombre);
    await page.getByTestId('input-telefono').fill(datos.telefono);
    await page.getByTestId('input-email-contacto').fill(datos.emailContacto);
    await page.getByTestId('select-tipo-comercio').selectOption('RESTAURANTE');
    await page.getByTestId('input-calle').fill(datos.calle);
    await page.getByTestId('input-numero').fill(datos.numero);
    await page.getByTestId('input-codigo-postal').fill(datos.codigoPostal);
    await elegirLocalidad(page);
    await subirFotoComercioUi(page);
  }

  interface DatosPaso2 {
    razonSocial: string;
    cuit: string;
    nombreRepresentante: string;
    apellidoRepresentante: string;
    dniRepresentante: string;
    telefonoRepresentante: string;
    email: string;
    password: string;
  }

  async function completarPaso2(page: Page, datos: DatosPaso2) {
    await page.getByTestId('input-razon-social').fill(datos.razonSocial);
    await page.getByTestId('input-cuit').fill(datos.cuit);
    await page.getByTestId('input-fecha-inicio-actividades').fill('2020-01-01');
    await page.getByTestId('select-tipo-sociedad').selectOption('SRL');
    await page.getByTestId('select-condicion-iva').selectOption('RESPONSABLE_INSCRIPTO');
    await page.getByTestId('input-domicilio-fiscal').fill('Av. San Martín 100');
    await page.getByTestId('input-nombre-representante').fill(datos.nombreRepresentante);
    await page.getByTestId('input-apellido-representante').fill(datos.apellidoRepresentante);
    await page.getByTestId('input-dni-representante').fill(datos.dniRepresentante);
    await page.getByTestId('input-fecha-nacimiento-representante').fill('1985-03-15');
    await page.getByTestId('input-telefono-representante').fill(datos.telefonoRepresentante);
    await page.getByTestId('input-email').fill(datos.email);
    await page.getByTestId('input-password').fill(datos.password);
    await page.getByTestId('input-confirmar-password').fill(datos.password);
  }

  test('paso 2: un error de validación (razón social vacía) no hace perder los datos ya cargados del paso 1 al volver atrás', async ({ page }) => {
    const suf = sufijoUnico();
    const paso1: DatosPaso1 = {
      nombre: `Comercio Wizard E2E ${suf}`,
      telefono: generarTelefono(),
      emailContacto: `comercio.wizard.${suf}@bajonea.test`,
      calle: 'Av. San Martín',
      numero: '100',
      codigoPostal: '9420',
    };

    await page.goto('/registro-comercio.html');
    await completarPaso1(page, paso1);
    await page.getByTestId('btn-continuar').click();
    await expect(page.getByTestId('input-razon-social')).toBeVisible();

    // Razón social queda vacía a propósito -- el resto de paso 2 sí se completa, para aislar
    // la validación de un único campo.
    const cuit = generarCuit();
    const dniRepresentante = generarDni();
    const telefonoRepresentante = generarTelefono();
    await page.getByTestId('input-cuit').fill(cuit);
    await page.getByTestId('input-fecha-inicio-actividades').fill('2020-01-01');
    await page.getByTestId('select-tipo-sociedad').selectOption('SRL');
    await page.getByTestId('select-condicion-iva').selectOption('RESPONSABLE_INSCRIPTO');
    await page.getByTestId('input-domicilio-fiscal').fill('Av. San Martín 100');
    await page.getByTestId('input-nombre-representante').fill('Rodrigo');
    await page.getByTestId('input-apellido-representante').fill('Fernández');
    await page.getByTestId('input-dni-representante').fill(dniRepresentante);
    await page.getByTestId('input-fecha-nacimiento-representante').fill('1985-03-15');
    await page.getByTestId('input-telefono-representante').fill(telefonoRepresentante);
    await page.getByTestId('input-email').fill(`comercio.wizard.login.${suf}@bajonea.test`);
    await page.getByTestId('input-password').fill('Testing123');
    await page.getByTestId('input-confirmar-password').fill('Testing123');

    await page.getByTestId('btn-continuar-2').click();
    await expect(page.getByTestId('mensaje-error-razon-social')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-razon-social')).toContainText('La razón social es obligatoria');
    // Sigue en paso 2, no avanzó a horarios.
    await expect(page.getByTestId('lista-horarios')).toBeHidden();

    // Volver al paso 1 con el botón de "atrás" del wizard (no el back del navegador).
    await page.getByTestId('btn-volver').click();
    await expect(page.getByTestId('input-nombre')).toBeVisible();
    await expect(page.getByTestId('input-nombre')).toHaveValue(paso1.nombre);
    await expect(page.getByTestId('input-telefono')).toHaveValue(paso1.telefono);
    await expect(page.getByTestId('input-email-contacto')).toHaveValue(paso1.emailContacto);
    await expect(page.getByTestId('input-calle')).toHaveValue(paso1.calle);
    await expect(page.getByTestId('input-numero')).toHaveValue(paso1.numero);
    await expect(page.getByTestId('input-codigo-postal')).toHaveValue(paso1.codigoPostal);
    // La foto ya recortada tampoco se resetea -- avanza sin volver a pedirla.
    await page.getByTestId('btn-continuar').click();

    // De vuelta en paso 2: los datos que sí se habían completado (incluida la razón social,
    // que quedó vacía) siguen ahí, no se limpiaron al ir y volver.
    await expect(page.getByTestId('input-cuit')).toHaveValue(cuit);
    await expect(page.getByTestId('input-dni-representante')).toHaveValue(dniRepresentante);
    await expect(page.getByTestId('input-razon-social')).toHaveValue('');
  });

  test('paso 2: CUIT, DNI del representante y teléfono del representante bloquean letras y símbolos en tiempo real', async ({ page }) => {
    const suf = sufijoUnico();
    await page.goto('/registro-comercio.html');
    await completarPaso1(page, {
      nombre: `Comercio Wizard Teclado E2E ${suf}`,
      telefono: generarTelefono(),
      emailContacto: `comercio.wizard.teclado.${suf}@bajonea.test`,
      calle: 'Av. San Martín',
      numero: '100',
      codigoPostal: '9420',
    });
    await page.getByTestId('btn-continuar').click();
    await expect(page.getByTestId('input-razon-social')).toBeVisible();

    const cuitInput = page.getByTestId('input-cuit');
    await cuitInput.pressSequentially('ab30-12345678-9cd');
    // cuitInput filtra no-dígitos y trunca a 11 en cada keystroke (auth.js) -- de la cadena de
    // arriba solo sobreviven los dígitos "301234567 89", truncados a los primeros 11.
    await expect(cuitInput).toHaveValue('30123456789');

    const dniInput = page.getByTestId('input-dni-representante');
    await dniInput.pressSequentially('xy12.345-678zw90');
    // Mismo criterio: solo dígitos, truncado a 8 mientras se tipea.
    await expect(dniInput).toHaveValue('12345678');

    const telefonoRepInput = page.getByTestId('input-telefono-representante');
    await telefonoRepInput.pressSequentially('29-64 abc987654321');
    // Solo dígitos, truncado a 10 mientras se tipea.
    await expect(telefonoRepInput).toHaveValue('2964987654');
  });

  test('paso 1: el nombre del comercio no permite escribir más de 150 caracteres (maxlength nativo del input)', async ({ page }) => {
    await page.goto('/registro-comercio.html');

    const nombreInput = page.getByTestId('input-nombre');
    await nombreInput.pressSequentially('N'.repeat(160));
    await expect(nombreInput).toHaveValue('N'.repeat(150));
  });

  test('paso 2: la razón social no permite escribir más de 150 caracteres (maxlength nativo del input)', async ({ page }) => {
    const suf = sufijoUnico();
    await page.goto('/registro-comercio.html');
    await completarPaso1(page, {
      nombre: `Comercio Wizard Maxlength E2E ${suf}`,
      telefono: generarTelefono(),
      emailContacto: `comercio.wizard.maxlength.${suf}@bajonea.test`,
      calle: 'Av. San Martín',
      numero: '100',
      codigoPostal: '9420',
    });
    await page.getByTestId('btn-continuar').click();
    await expect(page.getByTestId('input-razon-social')).toBeVisible();

    const razonSocialInput = page.getByTestId('input-razon-social');
    await razonSocialInput.pressSequentially('R'.repeat(160));
    await expect(razonSocialInput).toHaveValue('R'.repeat(150));
  });

  test('paso 3 (horarios): una franja cargada en "Personalizado" y otra vía "franja rápida" (tab "Horario fijo") conviven en el mismo resumen -- cambiar de tab no pierde ninguna', async ({ page }) => {
    const suf = sufijoUnico();
    await page.goto('/registro-comercio.html');
    await completarPaso1(page, {
      nombre: `Comercio Wizard Horarios E2E ${suf}`,
      telefono: generarTelefono(),
      emailContacto: `comercio.wizard.horarios.${suf}@bajonea.test`,
      calle: 'Av. San Martín',
      numero: '100',
      codigoPostal: '9420',
    });
    await page.getByTestId('btn-continuar').click();
    await expect(page.getByTestId('input-razon-social')).toBeVisible();
    await completarPaso2(page, {
      razonSocial: `Razón Social Horarios E2E ${suf}`,
      cuit: generarCuit(),
      nombreRepresentante: 'Rodrigo',
      apellidoRepresentante: 'Fernández',
      dniRepresentante: generarDni(),
      telefonoRepresentante: generarTelefono(),
      email: `comercio.wizard.horarios.login.${suf}@bajonea.test`,
      password: 'Testing123',
    });
    await page.getByTestId('btn-continuar-2').click();

    // Arranca en el tab "Horario fijo" (activo por default). Ahí cargamos una franja rápida
    // para "hoy".
    await expect(page.getByTestId('panel-horario-fijo')).toBeVisible();
    await page.getByTestId(`chip-dia-franja-rapida-${diaDeHoy()}`).click();
    await page.getByTestId('input-franja-rapida-desde').fill('09:00');
    await page.getByTestId('input-franja-rapida-hasta').fill('13:00');
    await page.getByTestId('btn-aplicar-franja-rapida').click();
    await expect(page.getByTestId('fila-resumen-horario')).toHaveCount(1);

    // Cambiamos al tab "Personalizado" y cargamos una segunda franja a mano, para un día
    // distinto -- sobre el mismo array subyacente (horarioList) que ya tiene la fila de arriba.
    await page.getByTestId('tab-horario-personalizado').click();
    await expect(page.getByTestId('panel-horario-personalizado')).toBeVisible();
    // La fila que ya había cargado la franja rápida vive en el mismo <div id="horario-list">
    // que este tab muestra -- confirmamos que ya está ahí antes de agregar la segunda a mano.
    await expect(page.getByTestId('fila-horario')).toHaveCount(1);
    await page.getByTestId('btn-agregar-horario').click();
    await expect(page.getByTestId('fila-horario')).toHaveCount(2);
    const filas = page.getByTestId('fila-horario');
    await filas.nth(1).getByTestId('select-dia-horario').selectOption(diaDistintoDeHoy());
    await filas.nth(1).getByTestId('input-apertura-horario').fill('10:00');
    await filas.nth(1).getByTestId('input-cierre-horario').fill('20:00');

    // Volvemos al tab "Horario fijo": el resumen "Ya cargaste" tiene que mostrar las 2 franjas,
    // la de la franja rápida y la cargada recién a mano en "Personalizado".
    await page.getByTestId('tab-horario-fijo').click();
    await expect(page.getByTestId('panel-horario-fijo')).toBeVisible();
    await expect(page.getByTestId('fila-resumen-horario')).toHaveCount(2);
    await expect(page.getByTestId('resumen-horarios-cargados')).toContainText('09:00 a 13:00');
    await expect(page.getByTestId('resumen-horarios-cargados')).toContainText('10:00 a 20:00');
  });

  test('paso 3 (horarios): una franja que se superpone con otra ya cargada para el mismo día muestra el mensaje de conflicto en el DOM', async ({ page }) => {
    const suf = sufijoUnico();
    await page.goto('/registro-comercio.html');
    await completarPaso1(page, {
      nombre: `Comercio Wizard Solapado E2E ${suf}`,
      telefono: generarTelefono(),
      emailContacto: `comercio.wizard.solapado.${suf}@bajonea.test`,
      calle: 'Av. San Martín',
      numero: '100',
      codigoPostal: '9420',
    });
    await page.getByTestId('btn-continuar').click();
    await expect(page.getByTestId('input-razon-social')).toBeVisible();
    await completarPaso2(page, {
      razonSocial: `Razón Social Solapado E2E ${suf}`,
      cuit: generarCuit(),
      nombreRepresentante: 'Rodrigo',
      apellidoRepresentante: 'Fernández',
      dniRepresentante: generarDni(),
      telefonoRepresentante: generarTelefono(),
      email: `comercio.wizard.solapado.login.${suf}@bajonea.test`,
      password: 'Testing123',
    });
    await page.getByTestId('btn-continuar-2').click();
    await expect(page.getByTestId('panel-horario-fijo')).toBeVisible();

    const hoy = diaDeHoy();
    await page.getByTestId('tab-horario-personalizado').click();
    // "lista-horarios" (<div id="horario-list">) todavía está vacío en este punto -- un
    // contenedor sin filas colapsa a altura 0 y Playwright lo reporta "hidden" pese a que el
    // panel que lo envuelve sí está visible. Confirmamos el panel, no el contenedor vacío.
    await expect(page.getByTestId('panel-horario-personalizado')).toBeVisible();
    await page.getByTestId('btn-agregar-horario').click();
    const filas = page.getByTestId('fila-horario');
    await filas.nth(0).getByTestId('select-dia-horario').selectOption(hoy);
    await filas.nth(0).getByTestId('input-apertura-horario').fill('09:00');
    await filas.nth(0).getByTestId('input-cierre-horario').fill('13:00');

    // Segunda franja, mismo día, que se superpone con la anterior (12:00 cae dentro de 09-13).
    await page.getByTestId('btn-agregar-horario').click();
    await expect(filas).toHaveCount(2);
    await filas.nth(1).getByTestId('select-dia-horario').selectOption(hoy);
    await filas.nth(1).getByTestId('input-apertura-horario').fill('12:00');
    // El listener de "change" sobre horario-cierre dispara validarFilaHorario() apenas se
    // completa la fila -- no hace falta enviar el formulario para ver el mensaje en el DOM.
    await filas.nth(1).getByTestId('input-cierre-horario').fill('16:00');

    await expect(page.getByTestId('mensaje-error-horarios')).toBeVisible();
    await expect(page.getByTestId('mensaje-error-horarios')).toContainText('se superpone con este');
    await expect(page.getByTestId('mensaje-error-horarios')).toContainText('09:00 a 13:00');

    // El botón "Continuar" del paso 3 corre la misma validación sobre el conjunto completo y
    // bloquea el avance mientras el conflicto siga ahí.
    await page.getByTestId('btn-continuar-3').click();
    await expect(page.getByTestId('lista-redes-sociales')).toBeHidden();
    await expect(page.getByTestId('mensaje-banner')).toContainText('se superpone con este');
  });
});
