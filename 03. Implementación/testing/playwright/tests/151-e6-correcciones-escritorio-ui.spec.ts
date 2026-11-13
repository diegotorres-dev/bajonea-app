import { test, expect } from './helpers/prueba';
import type { Page } from '@playwright/test';
import { abrirComoCliente, dejarCarritoConItems } from './helpers/escritorio-cliente';
import { abrirComoDueno } from './helpers/escritorio-comercio';
import { prepararEscenarioAdmin } from './helpers/admin-escritorio';
import type { EscenarioAdmin } from './helpers/admin-escritorio';
import { abrirComoUsuario } from './helpers/multicomercio';
import { caja } from './helpers/layout';

async function medirTipografia(page: Page) {
  return page.evaluate(() => {
    const salida = { menores12: [] as string[], secundarios: [] as string[] };
    const raiz = getComputedStyle(document.documentElement);
    const aRgb = (hex: string) => {
      const h = hex.trim().replace('#', '');
      return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
    };
    const grises = [aRgb(raiz.getPropertyValue('--color-text-muted')), aRgb(raiz.getPropertyValue('--color-text-placeholder'))];
    const recorrido = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let nodo: Node | null;
    while ((nodo = recorrido.nextNode())) {
      const texto = (nodo.textContent || '').trim();
      const el = nodo.parentElement;
      if (!texto || !el || ['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
      const estilo = getComputedStyle(el);
      const caja = el.getBoundingClientRect();
      if (estilo.display === 'none' || estilo.visibility === 'hidden' || caja.width < 2 || caja.height < 2) continue;
      if (el.closest('[hidden], .is-hidden, .sr-only, .titulo-pagina-escritorio, .titulo-visible-solo-movil')) continue;
      if (/^\d+\+?$/.test(texto) && texto.length <= 3) continue;
      const px = parseFloat(estilo.fontSize);
      if (px < 12) salida.menores12.push(`${px}px ${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} "${texto.slice(0, 30)}"`);
      else if (px < 13 && grises.includes(estilo.color)) salida.secundarios.push(`${px}px ${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} "${texto.slice(0, 30)}"`);
    }
    return salida;
  });
}

test.describe('Tramo E6: correcciones de la crítica de diseño (escritorio)', () => {
  test.describe.configure({ timeout: 300_000 });
  let a: EscenarioAdmin;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(420_000);
    a = await prepararEscenarioAdmin(request);
  });

  test('el checkout tiene un solo botón principal por paso, el del resumen, y «Volver» al pie a la izquierda @escritorio', async ({ page, request }) => {
    const sesion = await abrirComoCliente(page, request, a.base);
    await dejarCarritoConItems(request, a.base, sesion.token);
    await page.goto('/checkout.html');
    await expect(page.getByTestId('checkout-resumen')).toBeVisible();
    if (await page.getByTestId('btn-modalidad-retiro').isVisible()) {
      await page.getByTestId('btn-modalidad-retiro').click();
    }
    await expect(page.getByTestId('btn-confirmar-retiro')).toBeAttached();
    await expect(page.getByTestId('btn-confirmar-retiro')).toBeHidden();
    const resumen = page.getByTestId('btn-resumen-accion');
    await expect(resumen).toBeVisible();
    const principalesVisibles = await page.locator('.app-main .btn-primary').evaluateAll((nodos) => nodos.filter((n) => {
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden';
    }).length);
    expect(principalesVisibles).toBe(0);

    await page.mouse.move(5, 5);
    const colorResumen = await resumen.evaluate((n) => getComputedStyle(n).backgroundColor);
    const colorPrimario = await page.evaluate(() => {
      const hex = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim().replace('#', '');
      return `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`;
    });
    expect(colorResumen).toBe(colorPrimario);

    const volver = await caja(page.getByTestId('btn-checkout-volver'));
    const tarjeta = await caja(page.locator('.app-main'));
    expect(volver.x - tarjeta.x).toBeLessThan(80);
    expect(tarjeta.y + tarjeta.height - (volver.y + volver.height)).toBeLessThan(80);
  });

  test('en las páginas de primer nivel del Cliente no hay botón «‹» redundante y en las de detalle sí @escritorio', async ({ page, request }) => {
    await abrirComoCliente(page, request, a.base);
    for (const ruta of ['/pedidos.html', '/carrito.html', '/notificaciones.html']) {
      await page.goto(ruta);
      await expect(page.getByTestId('barra-buscador-input')).toBeVisible();
      await expect(page.getByTestId('btn-volver')).toBeHidden();
    }
    await page.goto(`/comercio-detalle.html?id=${a.base.dueno.comercioId}`);
    await expect(page.getByTestId('nombre-comercio')).toBeVisible();
    await expect(page.getByTestId('btn-volver')).toBeVisible();
  });

  test('hay un solo buscador: el de la barra, que filtra Explorar sin recargar @escritorio', async ({ page, request }) => {
    await abrirComoCliente(page, request, a.base);
    await page.goto('/explorar.html');
    const contador = page.getByTestId('contador-resultados-explorar');
    await expect(contador).toHaveText(/^\d+ resultados?$/);
    await expect(page.getByTestId('input-buscar-producto-explorar')).toBeHidden();
    const total = await contador.innerText();
    await page.getByTestId('barra-buscador-input').fill('zzzz-no-existe');
    await expect(contador).toHaveText('0 resultados');
    await page.getByTestId('barra-buscador-input').fill('');
    await expect(contador).toHaveText(total);
  });

  test('la tarjeta de producto tiene foto 4:3, precio destacado y acción compacta junto al precio @escritorio', async ({ page, request }) => {
    await abrirComoCliente(page, request, a.base);
    await page.goto(`/comercio-detalle.html?id=${a.base.dueno.comercioId}`);
    const fila = page.locator('.product-row').first();
    await expect(fila).toBeVisible();
    const tarjeta = await caja(fila);
    const foto = await caja(fila.locator('.product-row__thumb'));
    expect(Math.abs(foto.width / foto.height - 4 / 3)).toBeLessThan(0.02);
    const agregar = await caja(fila.locator('.product-row__agregar'));
    expect(agregar.width).toBeLessThan(tarjeta.width * 0.6);
    const precio = await caja(fila.locator('.product-row__price'));
    expect(Math.abs((precio.y + precio.height / 2) - (agregar.y + agregar.height / 2))).toBeLessThan(12);
    const tamanos = await fila.evaluate((nodo) => ({
      precio: parseFloat(getComputedStyle(nodo.querySelector('.product-row__price') as Element).fontSize),
      pesoPrecio: Number(getComputedStyle(nodo.querySelector('.product-row__price') as Element).fontWeight),
      descripcion: parseFloat(getComputedStyle(nodo.querySelector('.product-row__info p') as Element).fontSize),
    }));
    expect(tamanos.precio).toBeGreaterThan(tamanos.descripcion);
    expect(tamanos.pesoPrecio).toBeGreaterThanOrEqual(700);
    const columnas = await page.locator('.product-section').first().evaluate((n) => getComputedStyle(n).gridTemplateColumns.split(' ').length);
    expect(columnas).toBe(4);
  });

  test('en el panel del Dueño el sonido es una fila compacta junto al interruptor de pedidos @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, a.base);
    await page.goto('/comercio-dashboard.html');
    const sonido = page.getByTestId('sonido-avisos');
    await expect(sonido).toBeVisible();
    const cajaSonido = await caja(sonido.locator('.sonido-avisos__tarjeta'));
    expect(cajaSonido.width).toBeLessThanOrEqual(260);
    expect(cajaSonido.height).toBeLessThanOrEqual(48);
    const cierre = await caja(page.locator('#cierre-comercio-slot .cierre-card').first());
    expect(Math.abs(cajaSonido.y - cierre.y)).toBeLessThan(40);
    expect(cajaSonido.x).toBeGreaterThan(cierre.x + cierre.width - 1);
  });

  test('el riel del perfil del Cliente mide 280 px, corta el email y lleva el sonido arriba @escritorio', async ({ page, request }) => {
    await abrirComoCliente(page, request, a.base);
    await page.goto('/perfil.html');
    await expect(page.getByTestId('btn-cerrar-sesion')).toBeVisible();
    const riel = await caja(page.locator('#view-principal'));
    expect(Math.round(riel.width)).toBe(280);
    const correo = page.getByTestId('email-cliente-perfil');
    await expect(correo).toHaveAttribute('title', /@/);
    const corte = await correo.evaluate((n) => ({ overflow: getComputedStyle(n).textOverflow, ws: getComputedStyle(n).whiteSpace }));
    expect(corte).toEqual({ overflow: 'ellipsis', ws: 'nowrap' });
    const sonido = await caja(page.getByTestId('sonido-avisos'));
    const menu = await caja(page.getByTestId('lista-perfil'));
    expect(sonido.y).toBeLessThan(menu.y);
    expect(sonido.height).toBeLessThanOrEqual(60);
  });

  test('en el panel del Administrador «Requieren atención» pinta durazno solo las tarjetas con pendientes @escritorio', async ({ page }) => {
    await abrirComoUsuario(page, a.admin);
    await page.goto('/admin-dashboard.html');
    await expect(page.getByText('Requieren atención')).toBeVisible();
    const durazno = await page.evaluate(() => {
      const hex = getComputedStyle(document.documentElement).getPropertyValue('--color-primary-soft').trim().replace('#', '');
      return `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`;
    });
    for (const id of ['btn-comercios-pendientes', 'btn-resolicitudes', 'btn-documentos-por-revisar']) {
      const tarjeta = page.getByTestId(id);
      await expect(tarjeta).toHaveClass(/alert-card--con-pendientes/);
      expect(await tarjeta.evaluate((nodo) => getComputedStyle(nodo).backgroundColor)).toBe(durazno);
    }
  });

  test('Soporte tiene título y Reclamos muestra «Ver detalle ›» en cada fila @escritorio', async ({ page }) => {
    await abrirComoUsuario(page, a.admin);
    await page.goto('/admin-soporte.html');
    await expect(page.getByTestId('titulo-admin-soporte')).toBeVisible();
    await page.goto('/admin-reclamos.html');
    await expect(page.getByTestId('titulo-admin-reclamos')).toBeVisible();
    await expect(page.getByTestId('reclamo-item-ver-detalle').first()).toBeVisible();
    await expect(page.getByTestId('reclamo-item-ver-detalle').first()).toContainText('Ver detalle');
  });

  test('Comercios muestra la localidad en lugar del tipo y toda la fila abre el detalle @escritorio', async ({ page }) => {
    await abrirComoUsuario(page, a.admin);
    await page.goto('/admin-comercios.html');
    const fila = page.getByTestId(`comercio-admin-item-${a.base.dueno.comercioId}`);
    await expect(fila).toBeVisible();
    await expect(page.getByTestId('encabezado-comercios')).toContainText('Localidad');
    await expect(page.getByTestId(`comercio-admin-localidad-${a.base.dueno.comercioId}`)).toContainText('Río Grande');
    await fila.locator('h3').click();
    await expect(page.getByTestId('btn-cerrar-modal-detalle-comercio')).toBeVisible();
  });

  test('Comercios pendientes muestra el contador junto al título @escritorio', async ({ page }) => {
    await abrirComoUsuario(page, a.admin);
    await page.goto('/admin-comercios-pendientes.html');
    const titulo = await caja(page.locator('.app-header__title'));
    const contador = await caja(page.getByTestId('contador-pendientes'));
    expect(contador.x - (titulo.x + titulo.width)).toBeLessThan(40);
  });

  test('Clientes y Dueños ocultan la columna Novedades cuando ninguna fila tiene datos @escritorio', async ({ page }) => {
    await abrirComoUsuario(page, a.admin);
    await page.goto('/admin-clientes.html');
    await expect(page.getByTestId('clientes-lista').locator('.cliente-admin-row').first()).toBeVisible();
    await expect(page.getByTestId('clientes-lista')).toHaveClass(/tabla--sin-novedades/);
    await expect(page.getByTestId('encabezado-clientes').locator('.tabla-encabezado__celda').nth(3)).toBeHidden();
  });

  test('«Reintentar reembolso» entra en una sola línea @escritorio', async ({ page }) => {
    await abrirComoUsuario(page, a.admin);
    await page.goto('/admin-reembolsos.html');
    const boton = page.locator('.reembolso-row .btn').first();
    await expect(boton).toBeVisible();
    const alto = (await caja(boton)).height;
    expect(alto).toBeLessThanOrEqual(60);
    const textoUnaLinea = await boton.evaluate((n) => n.scrollWidth <= n.clientWidth + 1);
    expect(textoUnaLinea).toBe(true);
  });

  test('la bienvenida muestra un solo titular visible y los registros usan «Cancelar» como enlace @escritorio', async ({ page }) => {
    await page.goto('/bienvenida.html');
    await expect(page.getByTestId('panel-marca-titular')).toBeVisible();
    const visibles = await page.evaluate(() => [...document.querySelectorAll('h1')].filter((h) => {
      const r = h.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    }).length);
    expect(visibles).toBe(0);

    await page.goto('/registro-comercio.html');
    const cancelar = page.getByTestId('btn-cancelar-registro');
    await expect(cancelar).toBeVisible();
    const estilo = await cancelar.evaluate((n) => ({ borde: getComputedStyle(n).borderTopWidth, fondo: getComputedStyle(n).backgroundColor }));
    expect(estilo.borde).toBe('0px');
    expect(estilo.fondo).toBe('rgba(0, 0, 0, 0)');
  });

  test('el formulario de producto deja las fotos en una fila completa y sin casillas cortadas @escritorio', async ({ page, request }) => {
    await abrirComoDueno(page, request, a.base);
    await page.goto('/comercio-producto-form.html');
    const galeria = page.getByTestId('galeria-fotos-producto');
    await expect(galeria.locator('.photo-gallery__add').first()).toBeVisible();
    const cajaGaleria = await caja(galeria);
    const hijos = await galeria.locator('> *').evaluateAll((nodos) => nodos.map((n) => { const r = n.getBoundingClientRect(); return { x: r.x, derecha: r.x + r.width }; }));
    for (const hijo of hijos) {
      expect(hijo.derecha).toBeLessThanOrEqual(cajaGaleria.x + cajaGaleria.width + 1);
    }
  });

  test('la documentación del Dueño muestra los títulos de grupo y limita «Subir uno nuevo» @escritorio', async ({ page, request }) => {
    const { subirDocumentoTest, login, apiPut, sqlTest } = await import('./helpers/backend');
    const token = (await login(request, a.base.dueno.nombreUsuario, a.base.dueno.password)).token;
    const subida = await subirDocumentoTest(request, token, a.base.dueno.comercioId, { tipo: 'HABILITACION_COMERCIAL', nombre: 'habilitacion-e6.pdf' });
    void apiPut;
    const id = (subida.body && subida.body.data && subida.body.data.id) as number | undefined;
    if (id) {
      sqlTest(`UPDATE documento_comercio SET estado = 'RECHAZADO', motivo_rechazo = 'La imagen está borrosa, subí otra con más luz' WHERE id = ${id};`);
    }
    await abrirComoDueno(page, request, a.base);
    await page.goto('/comercio-documentacion.html');
    await expect(page.locator('.doc-seccion__titulo').first()).toBeVisible();
    if (id) {
      const subirNuevo = page.getByTestId(`btn-subir-nuevo-${id}`);
      await expect(subirNuevo).toBeVisible();
      const medida = await caja(subirNuevo);
      const padre = await caja(page.getByTestId(`doc-fila-${id}`));
      expect(medida.width).toBeLessThan(padre.width * 0.6);
    }
  });

  test('ningún texto visible baja de 12 px y el secundario no baja de 13 px en las páginas de los cuatro roles @escritorio', async ({ page, request }) => {
    test.setTimeout(420_000);
    const paginas: Array<{ rol: 'cliente' | 'dueno' | 'admin'; ruta: string }> = [
      { rol: 'cliente', ruta: '/index.html' },
      { rol: 'cliente', ruta: `/comercio-detalle.html?id=${a.base.dueno.comercioId}` },
      { rol: 'cliente', ruta: '/explorar.html' },
      { rol: 'cliente', ruta: '/carrito.html' },
      { rol: 'cliente', ruta: '/pedidos.html' },
      { rol: 'cliente', ruta: '/perfil.html' },
      { rol: 'cliente', ruta: '/notificaciones.html' },
      { rol: 'dueno', ruta: '/comercio-dashboard.html' },
      { rol: 'dueno', ruta: '/comercio-pedidos.html' },
      { rol: 'dueno', ruta: '/comercio-productos.html' },
      { rol: 'dueno', ruta: '/comercio-perfil.html' },
      { rol: 'admin', ruta: '/admin-dashboard.html' },
      { rol: 'admin', ruta: '/admin-comercios.html' },
      { rol: 'admin', ruta: '/admin-reclamos.html' },
      { rol: 'admin', ruta: '/admin-soporte.html' },
    ];
    const hallazgos: string[] = [];
    for (const rol of ['cliente', 'dueno', 'admin'] as const) {
      const contexto = await page.context().browser()!.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-AR' });
      const hoja = await contexto.newPage();
      if (rol === 'cliente') await abrirComoCliente(hoja, request, a.base);
      if (rol === 'dueno') await abrirComoDueno(hoja, request, a.base);
      if (rol === 'admin') await abrirComoUsuario(hoja, a.admin);
      for (const pagina of paginas.filter((p) => p.rol === rol)) {
        await hoja.goto(pagina.ruta);
        await hoja.waitForLoadState('networkidle');
        await hoja.waitForTimeout(600);
        const medida = await medirTipografia(hoja);
        [...medida.menores12, ...medida.secundarios].forEach((m) => hallazgos.push(`${pagina.ruta}: ${m}`));
      }
      await contexto.close();
    }
    expect(hallazgos, hallazgos.join('\n')).toEqual([]);
  });
});
