import path from 'node:path';
import { readFileSync } from 'node:fs';
import { test, expect } from './helpers/prueba';
import type { APIRequestContext, Page } from '@playwright/test';
import {
  obtenerLocalidadRioGrande,
  registrarYVerificarComercio,
  fijarPasswordAdminYLoguear,
  buscarComercioPendientePorEmail,
  resolverComercio,
  sufijoUnico,
  nombreUsuarioUnico,
  generarDni,
  generarTelefono,
  generarCuit,
  diaDeHoy,
  nombreArchivoFixture,
  esperarImagenCargadaEnRecorte,
} from './helpers/backend';
import { abrirComoUsuario, loginUi, prepararAprobado, prepararRechazado } from './helpers/multicomercio';
import { abrirDatosAdicionales } from './helpers/datos-adicionales';
import { sinScrollHorizontal } from './helpers/layout';

const FIXTURE_BUFFER = readFileSync(path.resolve(__dirname, '../fixtures/bajonea-e2e-producto.png'));
const MENSAJE_TERMINOS = 'Tenés que aceptar los Términos y Condiciones';
const LOCALIDADES_ESPERADAS = ['Seleccioná una localidad', 'Río Grande', 'Tolhuin', 'Ushuaia'];

test.describe('Registro de Comercio, Fase 1: datos legales opcionales, términos, provincia fija y perfil (UI)', () => {
  let localidadId: string;

  test.beforeAll(async ({ request }) => {
    localidadId = await obtenerLocalidadRioGrande(request);
  });

  async function subirFotoComercioUi(page: Page) {
    await page.getByTestId('input-foto-comercio').setInputFiles({ name: nombreArchivoFixture(), mimeType: 'image/png', buffer: FIXTURE_BUFFER });
    await expect(page.getByTestId('modal-recorte-imagen')).toBeVisible();
    await esperarImagenCargadaEnRecorte(page);
    await page.getByTestId('btn-confirmar-recorte').click();
    await expect(page.getByTestId('modal-recorte-imagen')).toHaveCount(0);
  }

  async function completarPaso1(page: Page, suf: string) {
    await page.getByTestId('input-nombre').fill(`Comercio Fase Uno UI ${suf}`);
    await page.getByTestId('input-telefono').fill(generarTelefono());
    await page.getByTestId('select-tipo-comercio').selectOption('RESTAURANTE');
    await page.getByTestId('input-calle').fill('Av. San Martín');
    await page.getByTestId('input-numero').fill('100');
    await page.getByTestId('input-codigo-postal').fill('9420');
    await expect(page.getByTestId('select-localidad')).toBeEnabled();
    await page.getByTestId('select-localidad').selectOption(localidadId);
    await subirFotoComercioUi(page);
    await page.getByTestId('btn-continuar').click();
  }

  async function completarPaso2SinOpcionales(page: Page) {
    await page.getByTestId('input-cuit').fill(generarCuit());
    await page.getByTestId('input-domicilio-fiscal').fill('Av. San Martín 100');
    await page.getByTestId('input-nombre-representante').fill('Rodrigo');
    await page.getByTestId('input-apellido-representante').fill('Fernández');
    await page.getByTestId('input-dni-representante').fill(generarDni());
    await page.getByTestId('input-fecha-nacimiento-representante').fill('1985-03-15');
    await page.getByTestId('input-telefono-representante').fill(generarTelefono());
    await page.getByTestId('input-nombre-usuario').fill(nombreUsuarioUnico('com'));
    await page.getByTestId('input-email').fill(`comercio.fase1.${sufijoUnico()}@bajonea.test`);
    await page.getByTestId('input-password').fill('Testing123');
    await page.getByTestId('input-confirmar-password').fill('Testing123');
    await page.getByTestId('btn-continuar-2').click();
  }

  async function completarPaso3(page: Page) {
    await page.getByTestId('tab-horario-personalizado').click();
    await page.getByTestId('btn-agregar-horario').click();
    const fila = page.getByTestId('fila-horario').nth(0);
    await fila.getByTestId('select-dia-horario').selectOption(diaDeHoy());
    await fila.getByTestId('input-apertura-horario').fill('09:00');
    await fila.getByTestId('input-cierre-horario').fill('18:00');
    await page.getByTestId('btn-continuar-3').click();
  }

  async function llegarAlPaso4(page: Page, suf: string) {
    await page.goto('/registro-comercio.html');
    await completarPaso1(page, suf);
    await completarPaso2SinOpcionales(page);
    await completarPaso3(page);
    await expect(page.getByTestId('lista-redes-sociales')).toBeVisible();
    await page.getByTestId('select-tipo-red-social').selectOption('INSTAGRAM');
    await page.getByTestId('input-url-red-social').fill(`instagram.com/fase1.${suf}`);
  }

  async function registrarComercioAprobadoYLoguear(page: Page, request: APIRequestContext, nombre: string) {
    const adminSesion = await fijarPasswordAdminYLoguear(request);
    const comercio = await registrarYVerificarComercio(request, localidadId, {
      nombre,
      horarios: [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }],
      aceptaDelivery: true,
      aceptaRetiro: false,
    });
    const pendiente = await buscarComercioPendientePorEmail(request, adminSesion.token, comercio.email);
    await resolverComercio(request, adminSesion.token, pendiente.id, true);
    await loginUi(page, comercio.nombreUsuario, comercio.password);
    await page.waitForURL('**/comercio-dashboard.html');
    return comercio;
  }

  test.describe('páginas legales', () => {
    for (const pagina of [
      { archivo: 'terminos.html', titulo: 'titulo-terminos', texto: 'Términos y Condiciones' },
      { archivo: 'privacidad.html', titulo: 'titulo-privacidad', texto: 'Política de Privacidad' },
    ]) {
      test(`${pagina.archivo} carga con su título y la línea de texto provisorio, sin scroll horizontal a 375 px`, async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        await page.goto(`/${pagina.archivo}`);
        await expect(page.getByTestId(pagina.titulo)).toHaveText(pagina.texto);
        await expect(page.getByTestId('aviso-texto-provisorio')).toContainText('Texto provisorio');
        await expect(page.getByTestId('aviso-texto-provisorio')).toContainText('se reemplaza por la versión definitiva');
        await sinScrollHorizontal(page);
      });
    }
  });

  test.describe('provincia fija y localidades', () => {
    test('el registro de Cliente muestra la provincia como campo de solo lectura con candado y solo tres localidades', async ({ page }) => {
      await page.goto('/registro-cliente.html');
      await page.getByTestId('input-nombre').fill('Valentina');
      await page.getByTestId('input-apellido').fill('Domínguez');
      await page.getByTestId('input-dni').fill(generarDni());
      await page.getByTestId('input-fecha-nacimiento').fill('1995-05-20');
      await page.getByTestId('input-telefono').fill(generarTelefono());
      await page.getByTestId('input-nombre-usuario').fill(nombreUsuarioUnico('cli'));
      await page.getByTestId('input-email').fill(`cliente.fase1.${sufijoUnico()}@bajonea.test`);
      await page.getByTestId('input-password').fill('Testing123');
      await page.getByTestId('input-confirmar-password').fill('Testing123');
      await page.getByTestId('input-acepta-terminos').check();
      await page.getByTestId('btn-continuar').click();

      await expect(page.getByTestId('input-calle')).toBeVisible();
      await expect(page.getByTestId('input-provincia-fija')).toHaveValue('Tierra del Fuego');
      await expect(page.getByTestId('input-provincia-fija')).toHaveAttribute('readonly', '');
      await expect(page.getByTestId('campo-provincia-fija').locator('svg')).toHaveCount(1);
      await expect(page.getByTestId('texto-provincia-fija')).toHaveText('Solo Tierra del Fuego por ahora');
      await expect(page.getByTestId('select-provincia')).toBeHidden();
      await expect(page.getByTestId('select-localidad')).toBeEnabled();
      await expect(page.getByTestId('select-localidad').locator('option')).toHaveText(LOCALIDADES_ESPERADAS);
    });

    test('el registro de Comercio muestra la misma provincia fija y las tres localidades en el paso 1', async ({ page }) => {
      await page.goto('/registro-comercio.html');
      await expect(page.getByTestId('input-provincia-fija')).toHaveValue('Tierra del Fuego');
      await expect(page.getByTestId('input-provincia-fija')).toHaveAttribute('readonly', '');
      await expect(page.getByTestId('texto-provincia-fija')).toHaveText('Solo Tierra del Fuego por ahora');
      await expect(page.getByTestId('select-provincia')).toBeHidden();
      await expect(page.getByTestId('select-localidad')).toBeEnabled();
      await expect(page.getByTestId('select-localidad').locator('option')).toHaveText(LOCALIDADES_ESPERADAS);
    });
  });

  test.describe('Términos y Condiciones', () => {
    async function verificarEnlaces(page: Page) {
      const terminos = page.getByTestId('enlace-terminos');
      const privacidad = page.getByTestId('enlace-privacidad');
      await expect(terminos).toHaveText('Términos y Condiciones');
      await expect(terminos).toHaveAttribute('href', 'terminos.html');
      await expect(terminos).toHaveAttribute('target', '_blank');
      await expect(terminos).toHaveAttribute('rel', 'noopener');
      await expect(privacidad).toHaveText('Política de Privacidad');
      await expect(privacidad).toHaveAttribute('href', 'privacidad.html');
      await expect(privacidad).toHaveAttribute('target', '_blank');
      await expect(privacidad).toHaveAttribute('rel', 'noopener');
    }

    test('el registro de Cliente tiene la línea de aceptación con los dos enlaces reales, y cada uno abre su página', async ({ page, context }) => {
      await page.goto('/registro-cliente.html');
      await verificarEnlaces(page);
      const nueva = context.waitForEvent('page');
      await page.getByTestId('enlace-terminos').click();
      const paginaTerminos = await nueva;
      await expect(paginaTerminos.getByTestId('titulo-terminos')).toBeVisible();
      await paginaTerminos.close();
      const otra = context.waitForEvent('page');
      await page.getByTestId('enlace-privacidad').click();
      const paginaPrivacidad = await otra;
      await expect(paginaPrivacidad.getByTestId('titulo-privacidad')).toBeVisible();
      await paginaPrivacidad.close();
    });

    test('la cuenta nueva por invitación muestra la misma línea con los mismos enlaces', async ({ page }) => {
      await page.route('**/auth/invitaciones-empleado/validar', async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mensaje: 'ok', data: { cuentaExistente: false, comercioNombre: 'Comercio Mock' } }) });
      });
      await page.goto('/invitacion-empleado.html');
      await page.getByTestId('input-email-invitacion').fill('invitada.fase1@bajonea.test');
      for (let i = 0; i < 6; i += 1) {
        await page.getByTestId(`input-codigo-digito-${i + 1}`).fill(String(i + 1));
      }
      await page.getByTestId('btn-continuar-invitacion').click();
      await expect(page.getByTestId('vista-invitacion-cuenta-nueva')).toBeVisible();
      await verificarEnlaces(page);
    });

    test('el último paso del registro de Comercio tiene la línea con enlaces y sin aceptarla no envía nada ni cambia de paso', async ({ page }) => {
      const suf = sufijoUnico();
      await llegarAlPaso4(page, suf);
      await verificarEnlaces(page);
      let envios = 0;
      page.on('request', (r) => {
        if (r.url().endsWith('/auth/registro/comercio') && r.method() === 'POST') envios += 1;
      });
      await page.getByTestId('btn-registrar-comercio').click();
      await expect(page.getByTestId('mensaje-error-terminos')).toHaveText(MENSAJE_TERMINOS);
      await expect(page.getByTestId('lista-redes-sociales')).toBeVisible();
      expect(envios).toBe(0);

      await page.getByTestId('input-acepta-terminos').check();
      await expect(page.getByTestId('mensaje-error-terminos')).toBeHidden();
    });
  });

  test.describe('datos legales opcionales', () => {
    test('en el paso 2, CUIT y domicilio fiscal van visibles y la sección "Datos adicionales (opcional)" arranca cerrada', async ({ page }) => {
      await page.goto('/registro-comercio.html');
      await completarPaso1(page, sufijoUnico());
      await expect(page.getByTestId('input-cuit')).toBeVisible();
      await expect(page.getByTestId('input-domicilio-fiscal')).toBeVisible();
      await expect(page.getByTestId('resumen-datos-adicionales')).toContainText('Datos adicionales (opcional)');
      await expect(page.getByTestId('seccion-datos-adicionales')).toHaveJSProperty('open', false);
      await expect(page.getByTestId('input-razon-social')).toBeHidden();
      await expect(page.getByTestId('select-tipo-sociedad')).toBeHidden();

      await page.getByTestId('resumen-datos-adicionales').click();
      await expect(page.getByTestId('input-razon-social')).toBeVisible();
      await expect(page.getByTestId('select-tipo-sociedad')).toBeVisible();
      await expect(page.getByTestId('select-condicion-iva')).toBeVisible();
      await expect(page.getByTestId('input-fecha-inicio-actividades')).toBeVisible();
      await expect(page.locator('#datos-adicionales label')).not.toContainText(['(opcional)']);
    });

    test('CUIT y domicilio fiscal siguen siendo obligatorios y la sección no se abre por eso', async ({ page }) => {
      await page.goto('/registro-comercio.html');
      await completarPaso1(page, sufijoUnico());
      await page.getByTestId('btn-continuar-2').click();
      await expect(page.getByTestId('mensaje-error-cuit')).toHaveText('El CUIT es obligatorio');
      await expect(page.getByTestId('mensaje-error-domicilio-fiscal')).toHaveText('El domicilio fiscal es obligatorio');
      await expect(page.getByTestId('seccion-datos-adicionales')).toHaveJSProperty('open', false);
    });

    test('un error en un campo adicional abre la sección sola aunque esté cerrada', async ({ page }) => {
      await page.goto('/registro-comercio.html');
      await completarPaso1(page, sufijoUnico());
      await abrirDatosAdicionales(page);
      await page.getByTestId('input-razon-social').fill('####');
      await page.getByTestId('resumen-datos-adicionales').click();
      await expect(page.getByTestId('seccion-datos-adicionales')).toHaveJSProperty('open', false);
      await page.getByTestId('btn-continuar-2').click();
      await expect(page.getByTestId('seccion-datos-adicionales')).toHaveJSProperty('open', true);
      await expect(page.getByTestId('mensaje-error-razon-social')).toContainText('La razón social no puede contener solo caracteres especiales');
    });

    test('se puede registrar un comercio sin completar ningún dato adicional: el envío lleva nulos, los términos y no lleva email de contacto', async ({ page }) => {
      const suf = sufijoUnico();
      await llegarAlPaso4(page, suf);
      await page.getByTestId('input-acepta-terminos').check();
      const peticion = page.waitForRequest((r) => r.url().endsWith('/auth/registro/comercio') && r.method() === 'POST');
      const respuesta = page.waitForResponse((r) => r.url().endsWith('/auth/registro/comercio') && r.request().method() === 'POST');
      await page.getByTestId('btn-registrar-comercio').click();
      const cuerpo = (await peticion).postDataJSON();
      expect(cuerpo.razonSocial).toBeNull();
      expect(cuerpo.tipoSociedad).toBeNull();
      expect(cuerpo.condicionIva).toBeNull();
      expect(cuerpo.fechaInicioActividades).toBeNull();
      expect(cuerpo.aceptaTerminos).toBe(true);
      expect(Object.keys(cuerpo)).not.toContain('emailContacto');
      expect((await respuesta).status()).toBe(201);
      await expect(page.getByTestId('btn-ir-a-verificar')).toBeVisible();
    });
  });

  test.describe('alta adicional y corrección', () => {
    let adminToken: string;

    test.beforeAll(async ({ request }) => {
      adminToken = (await fijarPasswordAdminYLoguear(request)).token;
    });

    test('el alta adicional lleva provincia fija y la línea de aceptación de términos en su último paso, sin email de contacto', async ({ page, request }) => {
      const dueno = await prepararAprobado(request, adminToken, localidadId);
      await abrirComoUsuario(page, dueno.sesion);
      await page.goto('/agregar-comercio.html');
      await expect(page.getByTestId('btn-continuar')).toBeVisible();
      await expect(page.getByTestId('input-provincia-fija')).toHaveValue('Tierra del Fuego');
      await expect(page.getByTestId('texto-provincia-fija')).toHaveText('Solo Tierra del Fuego por ahora');
      await expect(page.getByTestId('select-localidad').locator('option')).toHaveText(LOCALIDADES_ESPERADAS);
      await expect(page.getByTestId('input-email-contacto')).toHaveCount(0);
      await expect(page.getByTestId('bloque-terminos')).toHaveCount(1);
      await expect(page.getByTestId('enlace-terminos')).toHaveAttribute('href', 'terminos.html');
      await expect(page.getByTestId('enlace-privacidad')).toHaveAttribute('href', 'privacidad.html');
    });

    test('la corrección no pide términos, lleva la provincia fija y abre los datos adicionales solos porque ya tienen valores', async ({ page, request }) => {
      const dueno = await prepararRechazado(request, adminToken, localidadId);
      await abrirComoUsuario(page, dueno.sesion);
      await page.goto(`/comercio-corregir.html?id=${dueno.comercioId}`);
      await expect(page.getByTestId('input-nombre')).toBeVisible();
      await expect(page.getByTestId('select-localidad')).toBeEnabled();
      await expect(page.getByTestId('bloque-terminos')).toHaveCount(0);
      await expect(page.getByTestId('input-acepta-terminos')).toHaveCount(0);
      await expect(page.getByTestId('input-email-contacto')).toHaveCount(0);
      await expect(page.getByTestId('input-provincia-fija')).toHaveValue('Tierra del Fuego');
      await expect(page.getByTestId('select-localidad')).toHaveValue(localidadId);
      await page.getByTestId('btn-continuar').click();
      await expect(page.getByTestId('input-cuit')).toBeVisible();
      await expect(page.getByTestId('seccion-datos-adicionales')).toHaveJSProperty('open', true);
      await expect(page.getByTestId('input-razon-social')).not.toHaveValue('');
    });

    test('en la corrección, si no hay ningún dato adicional cargado, la sección queda cerrada', async ({ page, request }) => {
      const dueno = await prepararRechazado(request, adminToken, localidadId);
      await abrirComoUsuario(page, dueno.sesion);
      await page.route('**/comercios/*/correccion', async (route) => {
        if (route.request().method() !== 'GET') {
          await route.continue();
          return;
        }
        const original = await route.fetch();
        const cuerpo = await original.json();
        Object.assign(cuerpo.data.legales, { razonSocial: null, tipoSociedad: null, condicionIva: null, fechaInicioActividades: null });
        await route.fulfill({ response: original, json: cuerpo });
      });
      await page.goto(`/comercio-corregir.html?id=${dueno.comercioId}`);
      await expect(page.getByTestId('select-localidad')).toBeEnabled();
      await page.getByTestId('btn-continuar').click();
      await expect(page.getByTestId('input-cuit')).toBeVisible();
      await expect(page.getByTestId('seccion-datos-adicionales')).toHaveJSProperty('open', false);
      await expect(page.getByTestId('input-razon-social')).toBeHidden();
    });
  });

  test.describe('perfil del Dueño', () => {
    test('el header muestra avatar, nombre, teléfono con ícono y una segunda línea con el estado y la localidad, sin email', async ({ page, request }) => {
      const suf = sufijoUnico();
      await registrarComercioAprobadoYLoguear(page, request, `Comercio Perfil Fase1 ${suf}`);
      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('nombre-comercio-perfil')).not.toBeEmpty();
      await expect(page.getByTestId('btn-foto-perfil-comercio')).toBeVisible();
      const telefono = page.getByTestId('telefono-comercio-perfil');
      await expect(telefono).toBeVisible();
      await expect(telefono).toContainText(/\d{6,}/);
      await expect(telefono.locator('svg')).toHaveCount(1);
      const segunda = page.getByTestId('estado-localidad-comercio-perfil');
      await expect(segunda).toContainText('Río Grande');
      await expect(segunda).toContainText(/Abierto ahora|Cerrado en este momento|Pedidos pausados/);
      await expect(segunda).not.toContainText(/APROBADO|APTO_VENTA|CERRADO_TEMPORALMENTE/);
      await expect(page.getByTestId('email-comercio-perfil')).toHaveCount(0);

      await page.getByTestId('btn-editar-perfil-comercio').click();
      await expect(page.getByTestId('input-telefono')).toBeVisible();
      await expect(page.getByTestId('input-email-contacto')).toHaveCount(0);
    });

    test('sin teléfono no se muestra esa línea y sin localidad la segunda línea trae solo el estado', async ({ page, request }) => {
      const suf = sufijoUnico();
      await registrarComercioAprobadoYLoguear(page, request, `Comercio Perfil Vacio Fase1 ${suf}`);
      await page.route('**/comercios/perfil', async (route) => {
        if (route.request().method() !== 'GET') {
          await route.continue();
          return;
        }
        const original = await route.fetch();
        const cuerpo = await original.json();
        cuerpo.data.telefono = '';
        cuerpo.data.direccion.nombreLocalidad = '';
        await route.fulfill({ response: original, json: cuerpo });
      });
      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('estado-localidad-comercio-perfil')).toBeVisible();
      await expect(page.getByTestId('telefono-comercio-perfil')).toBeHidden();
      await expect(page.getByTestId('estado-localidad-comercio-perfil')).toHaveText(/^(Abierto ahora|Cerrado en este momento|Pedidos pausados)$/);
    });

    test('los datos legales que faltan se muestran con un guion y no rompen la pantalla', async ({ page, request }) => {
      const suf = sufijoUnico();
      await registrarComercioAprobadoYLoguear(page, request, `Comercio Legales Fase1 ${suf}`);
      await page.route('**/comercios/perfil', async (route) => {
        if (route.request().method() !== 'GET') {
          await route.continue();
          return;
        }
        const original = await route.fetch();
        const cuerpo = await original.json();
        cuerpo.data.razonSocial = null;
        cuerpo.data.condicionIva = null;
        cuerpo.data.tipoSociedad = null;
        cuerpo.data.fechaInicioActividades = null;
        await route.fulfill({ response: original, json: cuerpo });
      });
      await page.goto('/comercio-perfil.html');
      await expect(page.getByTestId('nombre-comercio-perfil')).not.toBeEmpty();
      await page.getByTestId('btn-ver-legales').click();
      await expect(page.getByTestId('legal-razon-social')).toHaveText('—');
      await expect(page.getByTestId('legal-condicion-iva')).toHaveText('—');
      await expect(page.getByTestId('legal-tipo-sociedad')).toHaveText('—');
      await expect(page.getByTestId('legal-fecha-inicio')).toHaveText('—');
      await expect(page.getByTestId('legal-cuit')).not.toBeEmpty();
    });
  });
});
