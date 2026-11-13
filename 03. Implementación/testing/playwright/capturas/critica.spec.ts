import { test } from '@playwright/test';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ADMIN_PASSWORD_CONOCIDA,
  ADMIN_USUARIO,
  agregarItemCarrito,
  apiConHeaders,
  apiDelete,
  apiPut,
  confirmarPagoTest,
  crearCategoria,
  crearPedido,
  crearProducto,
  diaDeHoy,
  diaDistintoDeHoy,
  fijarPasswordAdminYLoguear,
  login,
  obtenerLocalidadRioGrande,
  registrarYVerificarCliente,
  resolverComercio,
  sqlTest,
  subirDocumentoTest,
  vincularMercadoPagoSimuladoTest,
} from '../tests/helpers/backend';
import { abrirComoUsuario, registrarPendiente } from '../tests/helpers/multicomercio';
import { abrirComoUsuarioConContexto } from '../tests/helpers/empleado';
import { cargarOCrearEscenario } from './escenario';
import type { EscenarioCompleto } from './escenario';

const DIR = process.env.DIR_CAPTURAS || path.resolve(__dirname, '../../../docs/capturas-critica');
const ARCHIVO_EXTRAS = path.join(process.env.TEMP || os.tmpdir(), 'bajonea-critica-extras.json');
const SOLO = process.env.SOLO ? process.env.SOLO.split(',') : null;
const AHORA = new Date();
AHORA.setSeconds(0, 0);

const ANCHOS_DISPONIBLES = [
  { ancho: 390, alto: 844, sfx: '390', movil: true },
  { ancho: 1440, alto: 900, sfx: '1440', movil: false },
  { ancho: 1024, alto: 800, sfx: '1024', movil: false },
  { ancho: 1280, alto: 800, sfx: '1280', movil: false },
];
const ANCHOS_PEDIDOS = (process.env.ANCHOS || '390,1440').split(',').map((v) => Number(v.trim()));
const ANCHOS = ANCHOS_DISPONIBLES.filter((a) => ANCHOS_PEDIDOS.includes(a.ancho));
const MEDIR_TIPOGRAFIA = process.env.MEDIR_TIPOGRAFIA === '1';
const medicionesTipografia: Array<{ archivo: string; ancho: number; menores12: Array<{ texto: string; px: number; tag: string; clase: string }>; secundarios12a13: Array<{ texto: string; px: number; tag: string; clase: string }>; desborde: number }> = [];

async function medirTipografia(page: Page) {
  return page.evaluate(() => {
    const NO_TEXTO = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH']);
    const resultado = { menores12: [] as any[], secundarios12a13: [] as any[] };
    const muted = getComputedStyle(document.documentElement).getPropertyValue('--color-text-muted').trim().toLowerCase();
    const placeholder = getComputedStyle(document.documentElement).getPropertyValue('--color-text-placeholder').trim().toLowerCase();
    function hexARgb(hex: string) {
      const h = hex.replace('#', '');
      if (h.length !== 6) return null;
      return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
    }
    const grises = [hexARgb(muted), hexARgb(placeholder)].filter(Boolean);
    const recorrer = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let nodo: Node | null;
    while ((nodo = recorrer.nextNode())) {
      const texto = (nodo.textContent || '').trim();
      if (!texto) continue;
      const el = nodo.parentElement;
      if (!el || NO_TEXTO.has(el.tagName.toUpperCase())) continue;
      const estilo = getComputedStyle(el);
      if (estilo.display === 'none' || estilo.visibility === 'hidden' || Number(estilo.opacity) === 0) continue;
      const caja = el.getBoundingClientRect();
      if (caja.width < 2 || caja.height < 2) continue;
      if (el.closest('[hidden], .is-hidden, .sr-only, [aria-hidden="true"]')) continue;
      let recortado = false;
      for (let a: Element | null = el; a && a !== document.body; a = a.parentElement) {
        const e = getComputedStyle(a);
        if (e.display === 'none' || e.visibility === 'hidden') { recortado = true; break; }
        if (e.clip && e.clip !== 'auto' && e.position === 'absolute') { recortado = true; break; }
      }
      if (recortado) continue;
      const px = parseFloat(estilo.fontSize);
      const esContadorDeInsignia = /^\d+\+?$/.test(texto) && texto.length <= 3;
      if (esContadorDeInsignia) continue;
      const clase = (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 60);
      const dato = { texto: texto.slice(0, 40), px, tag: el.tagName.toLowerCase(), clase };
      if (px < 12) resultado.menores12.push(dato);
      else if (px < 13 && grises.includes(estilo.color)) resultado.secundarios12a13.push(dato);
    }
    return resultado;
  });
}

type Rol = 'acceso' | 'cliente' | 'vacio' | 'dueno' | 'empleado' | 'admin';

interface Datos {
  esc: EscenarioCompleto;
  extras: Extras;
  vacio: { nombreUsuario: string; password: string };
}

interface Pantalla {
  rol: Rol;
  slug: string;
  ruta: string | ((ancho: number, d: Datos) => string);
  previo?: (token: string, d: Datos) => Promise<void>;
  antes?: (page: Page, ancho: number, d: Datos, token: string) => Promise<void>;
  viewport?: boolean;
  nota?: string;
}

interface Extras {
  comercios: Array<{ id: number; nombre: string }>;
}

const EMOJI_POR_PALABRA: Array<[RegExp, string]> = [
  [/hamburguesa|burger/i, '🍔'],
  [/papas/i, '🍟'],
  [/gaseosa|cerveza|limonada|jugo/i, '🥤'],
  [/pizza|muzza|fugazza/i, '🍕'],
  [/empanada/i, '🥟'],
  [/caf[eé]|capuchino|latte/i, '☕'],
  [/helado|brownie|torta|postre|flan/i, '🍰'],
  [/sushi|roll|salm[oó]n/i, '🍣'],
  [/parrilla|bife|asado|chorip[aá]n/i, '🥩'],
  [/pan|medialuna|factura/i, '🥖'],
  [/ensalada|veggie/i, '🥗'],
];
const EMOJI_GENERICOS = ['🍔', '🍕', '🥟', '☕', '🍣', '🍦', '🥩', '🥖', '🍰'];

const u = (texto: string) => `CONVERT(0x${Buffer.from(texto, 'utf8').toString('hex')} USING utf8mb4)`;

const NOMBRES = ['Lucas', 'Valentina', 'Mateo', 'Julieta', 'Joaquín', 'Florencia', 'Nicolás', 'Agustina', 'Tomás', 'Carolina', 'Bruno', 'Milagros', 'Santiago', 'Antonella'];
const APELLIDOS = ['Álvarez', 'Benítez', 'Cabrera', 'Domínguez', 'Escobar', 'Figueroa', 'González', 'Herrera', 'Ibáñez', 'Juárez', 'Luna', 'Molina', 'Navarro', 'Ojeda'];

async function generarDocumentos(browser: any): Promise<Record<string, string>> {
  const ctx = await browser.newContext({ viewport: { width: 794, height: 1123 } });
  const pg = await ctx.newPage();
  const salida: Record<string, string> = {};
  for (const [clave, titulo, detalle] of [['libreta', 'Libreta sanitaria', 'Vigente hasta 2027'], ['carnet', 'Carnet de manipulación de alimentos', 'Municipalidad de Río Grande'], ['habilitacion', 'Habilitación comercial', 'Expediente 4521/2026']]) {
    await pg.setContent(`<body style="margin:0;background:#fff;font-family:Georgia,serif;color:#222"><div style="margin:50px;border:6px double #345;height:960px;padding:60px;box-sizing:border-box"><h1 style="text-align:center;font-size:44px;margin:60px 0 20px">${titulo}</h1><p style="text-align:center;font-size:26px;color:#555">${detalle}</p><div style="margin:80px auto;width:80%;height:2px;background:#bbb"></div><p style="font-size:22px;line-height:2">Titular: Representante legal<br>Documento: 30.123.456<br>Emitido: 12/03/2026<br>Sello y firma: ______________</p></div></body>`);
    const archivo = path.join(process.env.TEMP || os.tmpdir(), `bajonea-doc-${clave}.png`);
    await pg.screenshot({ path: archivo });
    salida[clave] = archivo;
  }
  await ctx.close();
  return salida;
}

function hash(texto: string): number {
  let h = 7;
  for (let i = 0; i < texto.length; i += 1) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
  return h;
}

function arteParaUrl(url: string): string {
  const slug = decodeURIComponent(url.split('/').pop() || '');
  const h = hash(url);
  const matchEmoji = EMOJI_POR_PALABRA.find(([re]) => re.test(slug));
  const emoji = matchEmoji ? matchEmoji[1] : EMOJI_GENERICOS[h % EMOJI_GENERICOS.length];
  const hue = h % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,86%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},65%,72%)"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><circle cx="400" cy="300" r="210" fill="rgba(255,255,255,0.55)"/><text x="400" y="300" font-size="250" text-anchor="middle" dominant-baseline="central" font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif">${emoji}</text></svg>`;
}

async function acciones(request: APIRequestContext, tokenDueno: string, comercioId: number, pedidoId: number, nombre: string, cuerpo?: unknown) {
  return apiConHeaders(request, 'PUT', `/pedidos/comercio/${pedidoId}/${nombre}`, tokenDueno, { 'X-Comercio-Id': String(comercioId) }, cuerpo);
}

function imagenSql(productoId: number, slug: string, cantidad = 1) {
  for (let k = 0; k < cantidad; k += 1) {
    sqlTest(`INSERT INTO imagen_producto (producto_id, url, orden, es_principal) VALUES (${productoId}, 'https://res.cloudinary.com/bajonea-demo/image/upload/v1/productos/${productoId}-${k}-${slug}.jpg', ${k}, ${k === 0 ? 1 : 0});`);
  }
}

async function sembrarExtras(request: APIRequestContext, esc: EscenarioCompleto, browser: any): Promise<Extras> {
  if (existsSync(ARCHIVO_EXTRAS) && !process.env.ESCENARIO_NUEVO) {
    return JSON.parse(readFileSync(ARCHIVO_EXTRAS, 'utf8'));
  }
  const c = esc.cliente;
  const a = esc.admin;
  const admin = await fijarPasswordAdminYLoguear(request);
  const localidadId = await obtenerLocalidadRioGrande(request);
  const comercioId = c.dueno.comercioId;

  const idsCat = sqlTest(`SELECT id FROM categoria WHERE nombre LIKE 'Cat E1%' ORDER BY id;`).split(/\s+/).map(Number);
  sqlTest(`UPDATE categoria SET nombre = 'Hamburguesas' WHERE id = ${idsCat[0]};`);
  if (idsCat[1]) sqlTest(`UPDATE categoria SET nombre = ${u('Rotisería')} WHERE id = ${idsCat[1]};`);
  const cats: Record<string, number> = { Hamburguesas: idsCat[0] };
  for (const nombre of ['Acompañamientos', 'Bebidas', 'Postres', 'Pizzas', 'Empanadas', 'Cafetería', 'Sushi', 'Parrilla', 'Panadería']) {
    cats[nombre] = await crearCategoria(request, admin.token, nombre);
  }

  sqlTest(`UPDATE comercio SET nombre = ${u('Hamburguesería Don Facundo')}, descripcion = ${u('Hamburguesas caseras, papas rústicas y bebidas bien frías. Todo preparado al momento.')} WHERE id = ${comercioId};`);
  const otroComercioId = a.comercioBaseId;
  sqlTest(`UPDATE comercio SET nombre = ${u('Rotisería Los Andes')}, descripcion = 'Pollo al spiedo, guarniciones y postres caseros para llevar.' WHERE id = ${otroComercioId};`);
  const idsOtro = sqlTest(`SELECT id FROM producto WHERE comercio_id = ${otroComercioId} ORDER BY id;`).split(/\s+/).map(Number);
  const nombresOtro: Array<[string, string]> = [['Pollo al spiedo', 'pollo'], ['Papas rústicas', 'papas'], ['Flan casero', 'flan']];
  idsOtro.forEach((id, i) => {
    if (!nombresOtro[i]) return;
    sqlTest(`UPDATE producto SET nombre = ${u(nombresOtro[i][0])}, descripcion = 'Cocina casera, listo para llevar.' WHERE id = ${id};`);
    imagenSql(id, nombresOtro[i][1], 1);
  });
  const idResol = esc.admin.resolicitudId;
  sqlTest(`UPDATE comercio SET nombre = ${u('Kiosco Tres Marías')} WHERE id = ${idResol};`);
  const productosBase = c.productoIds;
  const nombresBase: Array<[string, string, number]> = [['Hamburguesa clásica', 'burger', cats.Hamburguesas], ['Papas fritas', 'papas', cats['Acompañamientos']], ['Gaseosa 500 ml', 'gaseosa', cats.Bebidas]];
  productosBase.forEach((id, i) => {
    sqlTest(`UPDATE producto SET nombre = ${u(nombresBase[i][0])}, categoria_id = ${nombresBase[i][2]}, descripcion = ${u('Elaborada en el día, con ingredientes frescos y de primera calidad.')} WHERE id = ${id};`);
    imagenSql(id, nombresBase[i][1], i === 0 ? 3 : 1);
  });

  const duenoSesion = await login(request, c.dueno.nombreUsuario, c.dueno.password);
  const nuevos: Array<[string, number, string, number, string, number]> = [
    ['Hamburguesa doble con cheddar', 8900, 'Doble carne, cheddar fundido, panceta crocante y salsa de la casa.', cats.Hamburguesas, 'burger', 2],
    ['Hamburguesa veggie', 7400, 'Medallón de lentejas y garbanzos, rúcula y tomate.', cats.Hamburguesas, 'veggie', 1],
    ['Papas con cheddar y panceta', 5200, 'Porción para compartir, con cheddar caliente y panceta.', cats['Acompañamientos'], 'papas', 1],
    ['Cerveza artesanal IPA 500 ml', 3900, 'Cerveza de productores locales.', cats.Bebidas, 'cerveza', 1],
    ['Brownie con helado', 4600, 'Brownie tibio con una bocha de helado de crema.', cats.Postres, 'brownie', 1],
  ];
  const idsNuevos: number[] = [];
  for (const [nombre, precio, descripcion, categoriaId, slug, fotos] of nuevos) {
    const id = await crearProducto(request, duenoSesion.token, { nombre, precio, categoriaId, descripcion });
    imagenSql(id, slug, fotos);
    idsNuevos.push(id);
  }
  sqlTest(`UPDATE producto SET estado = 'AGOTADO' WHERE id = ${idsNuevos[4]};`);

  const idPersona = (nombreUsuario: string) => Number(sqlTest(`SELECT id FROM usuario WHERE nombre_usuario = '${nombreUsuario}' LIMIT 1;`));
  const renombrar = (nombreUsuario: string, nombre: string, apellido: string) => sqlTest(`UPDATE persona_fisica SET nombre = ${u(nombre)}, apellido = ${u(apellido)} WHERE id = ${idPersona(nombreUsuario)};`);
  renombrar(c.cliente.nombreUsuario, 'Lucía', 'Fernández');
  renombrar(c.dueno.nombreUsuario, 'Martín', 'Gómez');
  renombrar(c.empleado.nombreUsuario, 'Camila', 'Soto');

  const catalogoExtra: Array<{ nombre: string; delivery: boolean; cerrado?: boolean; productos: Array<[string, number, string, string]> }> = [
    { nombre: 'Pizzería La Esquina Austral', delivery: true, productos: [['Pizza de muzzarella', 9800, 'pizza', 'Pizzas'], ['Pizza fugazzeta', 11200, 'pizza', 'Pizzas'], ['Empanadas de carne x6', 6800, 'empanada', 'Empanadas'], ['Fainá', 2400, 'pan', 'Pizzas']] },
    { nombre: 'Café del Puerto', delivery: false, productos: [['Café con leche', 2300, 'cafe', 'Cafetería'], ['Medialunas x3', 2800, 'medialuna', 'Panadería'], ['Tostado de jamón y queso', 4800, 'pan', 'Cafetería'], ['Torta de ricota', 3600, 'torta', 'Postres']] },
    { nombre: 'Sushi Fueguino', delivery: true, productos: [['Roll de salmón x8', 12400, 'sushi', 'Sushi'], ['Combo mixto x24', 29800, 'sushi', 'Sushi'], ['Gyozas x6', 6900, 'empanada', 'Sushi']] },
    { nombre: 'Heladería Patagonia', delivery: true, productos: [['Helado 1 kg', 11800, 'helado', 'Postres'], ['Cuarto de helado', 5200, 'helado', 'Postres'], ['Copa especial', 4900, 'helado', 'Postres']] },
    { nombre: 'Parrilla El Fogón', delivery: true, productos: [['Bife de chorizo', 14900, 'bife', 'Parrilla'], ['Choripán', 4500, 'choripan', 'Parrilla'], ['Ensalada mixta', 3800, 'ensalada', 'Acompañamientos']] },
    { nombre: 'Panadería San Jorge', delivery: false, cerrado: true, productos: [['Pan de campo', 2600, 'pan', 'Panadería'], ['Facturas x12', 7400, 'medialuna', 'Panadería'], ['Torta de chocolate', 8400, 'torta', 'Postres']] },
    { nombre: 'Empanadas La Abuela', delivery: true, productos: [['Empanadas de pollo x12', 13200, 'empanada', 'Empanadas'], ['Empanadas de humita x6', 6600, 'empanada', 'Empanadas']] },
  ];
  const creados: Array<{ id: number; nombre: string }> = [];
  const cierre = catalogoExtra.length;
  for (let i = 0; i < cierre; i += 1) {
    const def = catalogoExtra[i];
    const horarios = def.cerrado
      ? [{ diaSemana: diaDistintoDeHoy(), horaApertura: '08:00', horaCierre: '20:00' }]
      : [{ diaSemana: diaDeHoy(), horaApertura: '00:00', horaCierre: '23:59' }];
    const dueno = await registrarPendiente(request, admin.token, localidadId, def.nombre, horarios);
    sqlTest(`UPDATE comercio SET acepta_delivery = ${def.delivery ? 1 : 0}, descripcion = ${u('Cocina casera de Río Grande. Pedí online y retirá o recibí en tu casa.')} WHERE id = ${dueno.comercioId};`);
    await vincularMercadoPagoSimuladoTest(request, dueno.duenoId);
    await resolverComercio(request, admin.token, dueno.comercioId, true);
    for (const [nombre, precio, slug, categoria] of def.productos) {
      const id = await crearProducto(request, dueno.token, { nombre, precio, categoriaId: cats[categoria], descripcion: 'Preparado al momento con ingredientes frescos.' });
      imagenSql(id, slug, 1);
    }
    creados.push({ id: dueno.comercioId, nombre: def.nombre });
  }

  const tokenDueno = (await login(request, c.dueno.nombreUsuario, c.dueno.password)).token;
  const sesionCliente = await login(request, c.cliente.nombreUsuario, c.cliente.password);
  const productosVenta = [productosBase[0], productosBase[1], productosBase[2], idsNuevos[0], idsNuevos[1], idsNuevos[2]];
  const dias = [1, 1, 2, 3, 4, 5, 6, 8, 9, 11, 12, 14, 16, 19, 22];
  for (let i = 0; i < dias.length; i += 1) {
    await agregarItemCarrito(request, sesionCliente.token, productosVenta[i % productosVenta.length], 1 + (i % 3));
    await agregarItemCarrito(request, sesionCliente.token, productosVenta[(i + 2) % productosVenta.length], 1);
    const id = await crearPedido(request, sesionCliente.token, 'RETIRO');
    await confirmarPagoTest(request, id);
    if (i % 7 === 4) {
      await acciones(request, tokenDueno, comercioId, id, 'rechazar', { motivo: 'SIN_STOCK' });
    } else {
      await acciones(request, tokenDueno, comercioId, id, 'aceptar');
      await acciones(request, tokenDueno, comercioId, id, 'despachar');
      await acciones(request, tokenDueno, comercioId, id, 'entregar');
    }
    const d = dias[i];
    sqlTest(`UPDATE pedido SET fecha_creacion = DATE_SUB(fecha_creacion, INTERVAL ${d} DAY), fecha_pago_confirmado = DATE_SUB(fecha_pago_confirmado, INTERVAL ${d} DAY), fecha_entrega = DATE_SUB(fecha_entrega, INTERVAL ${d} DAY), turno_fecha = DATE_SUB(turno_fecha, INTERVAL ${d} DAY) WHERE id = ${id};`);
    sqlTest(`UPDATE historial_estado_pedido SET fecha_hora = DATE_SUB(fecha_hora, INTERVAL ${d} DAY) WHERE pedido_id = ${id};`);
  }
  await apiDelete(request, '/carrito', sesionCliente.token);

  const sesionDueno = await login(request, c.dueno.nombreUsuario, c.dueno.password);
  const docs = await generarDocumentos(browser);
  const subidos: number[] = [];
  for (const [tipo, clave, nombre, descripcion] of [['LIBRETA_SANITARIA', 'libreta', 'libreta-sanitaria.png', undefined], ['CARNET_MANIPULACION_ALIMENTOS', 'carnet', 'carnet-manipulacion.png', undefined], ['HABILITACION_COMERCIAL', 'habilitacion', 'habilitacion-comercial.png', undefined], ['OTRO', 'habilitacion', 'seguro-del-local.png', 'Seguro del local']] as const) {
    const r = await subirDocumentoTest(request, sesionDueno.token, comercioId, { tipo, descripcion, nombre, mime: 'image/png', contenido: readFileSync(docs[clave]) });
    subidos.push(r.body.data?.id);
  }
  const adminSesion = await login(request, ADMIN_USUARIO, ADMIN_PASSWORD_CONOCIDA);
  await apiPut(request, `/administrador/documentos/${subidos[0]}/resolver`, { aprobar: true }, adminSesion.token);
  await apiPut(request, `/administrador/documentos/${subidos[1]}/resolver`, { aprobar: false, motivo: 'La imagen del documento está borrosa, subilo de nuevo con más luz.' }, adminSesion.token);
  const rutaDoc = docs.habilitacion.split(path.sep).join('/');
  sqlTest(`UPDATE documento_comercio_archivo ar JOIN documento_comercio d ON d.id = ar.documento_id SET ar.contenido = LOAD_FILE('${rutaDoc}') WHERE d.comercio_id = ${a.comercioBaseId};`);
  sqlTest(`UPDATE documento_comercio d SET d.tipo_mime = 'image/png', d.nombre_original = REPLACE(d.nombre_original, '.pdf', '.png'), d.tamano_bytes = (SELECT LENGTH(ar.contenido) FROM documento_comercio_archivo ar WHERE ar.documento_id = d.id) WHERE d.comercio_id = ${a.comercioBaseId};`);

  sqlTest(`UPDATE nota_credito SET ultimo_error = ${u('Mercado Pago no pudo procesar la devolución: saldo insuficiente en la cuenta del comercio.')} WHERE ultimo_error LIKE 'error tecnico%';`);
  const sinNombre = sqlTest(`SELECT pf.id FROM persona_fisica pf JOIN usuario us ON us.id = pf.id WHERE us.rol IN ('DUENO','CLIENTE') AND (pf.nombre LIKE 'Client%' OR pf.nombre LIKE 'Representante%') ORDER BY pf.id;`).split(/\s+/).filter(Boolean).map(Number);
  sinNombre.forEach((id, k) => {
    sqlTest(`UPDATE persona_fisica SET nombre = ${u(NOMBRES[k % NOMBRES.length])}, apellido = ${u(APELLIDOS[(k * 5 + 3) % APELLIDOS.length])} WHERE id = ${id};`);
  });

  const extras: Extras = { comercios: creados };
  writeFileSync(ARCHIVO_EXTRAS, JSON.stringify(extras, null, 1));
  return extras;
}

async function clic(page: Page, ...testids: string[]) {
  for (const testid of testids) {
    const l = page.locator(`[data-testid="${testid}"]`).locator('visible=true').first();
    if (await l.count()) {
      await l.click();
      return;
    }
  }
  throw new Error(`Ninguno de ${testids.join(', ')} está visible`);
}

async function estabilizar(page: Page): Promise<void> {
  await page.waitForLoadState('load');
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll('img[loading="lazy"]').forEach((i) => ((i as HTMLImageElement).loading = 'eager'));
  });
  for (let i = 0; i < 8; i += 1) {
    const ok = await page.evaluate(async () => {
      await document.fonts.ready;
      const visible = (el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
      };
      const cargando = [...document.querySelectorAll('.skeleton, [class*="skeleton"], [class*="spinner"], [aria-busy="true"]')].filter(visible).length;
      const imgsPendientes = [...document.querySelectorAll('img')].filter((img) => visible(img) && (!(img as HTMLImageElement).complete || (img as HTMLImageElement).naturalWidth === 0)).length;
      const toasts = [...document.querySelectorAll('.toast')].filter(visible).length;
      return cargando === 0 && imgsPendientes === 0 && toasts === 0;
    });
    if (ok) break;
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(400);
}

async function diagnostico(page: Page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
    };
    const cargando = [...document.querySelectorAll('.skeleton, [class*="skeleton"], [class*="spinner"], [aria-busy="true"]')].filter(visible).length;
    const imgsRotas = [...document.querySelectorAll('img')].filter((img) => visible(img) && (!(img as HTMLImageElement).complete || (img as HTMLImageElement).naturalWidth === 0)).length;
    const scrollers = [...document.querySelectorAll('body *')].filter((el) => {
      const st = getComputedStyle(el);
      return (st.overflowY === 'auto' || st.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 150 && visible(el);
    });
    const extra = scrollers.reduce((m, el) => Math.max(m, el.scrollHeight - el.clientHeight), 0);
    const w = window.innerWidth;
    return {
      cargando,
      imgsRotas,
      extraScroll: extra,
      desborde: document.documentElement.scrollWidth - w,
      fuenteNunito: document.fonts.check('800 16px Nunito', 'Bajoneá ñ') && document.fonts.check('400 16px Inter', 'Bajoneá ñ'),
      alto: document.documentElement.scrollHeight,
    };
  });
}

interface Fila {
  archivo: string;
  rol: string;
  pantalla: string;
  ancho: number;
  url: string;
  bytes: number;
  notas: string;
}

function numerar(pantallas: Pantalla[]): Map<Pantalla, string> {
  const m = new Map<Pantalla, string>();
  pantallas.forEach((p, i) => m.set(p, String(i + 1).padStart(2, '0')));
  return m;
}

test('capturas para la crítica de diseño', async ({ browser, request }) => {
  test.setTimeout(3_600_000);
  mkdirSync(DIR, { recursive: true });
  const esc = await cargarOCrearEscenario(request);
  const extras = await sembrarExtras(request, esc, browser);
  const c = esc.cliente;
  const a = esc.admin;

  let vacio: { nombreUsuario: string; password: string };
  const archivoVacio = path.join(process.env.TEMP || os.tmpdir(), 'bajonea-critica-vacio.json');
  if (existsSync(archivoVacio) && !process.env.ESCENARIO_NUEVO) {
    vacio = JSON.parse(readFileSync(archivoVacio, 'utf8'));
  } else {
    const localidadId = await obtenerLocalidadRioGrande(request);
    const nuevo = await registrarYVerificarCliente(request, localidadId);
    sqlTest(`UPDATE persona_fisica SET nombre = ${u('Sofía')}, apellido = ${u('Ramírez')} WHERE id = (SELECT id FROM usuario WHERE nombre_usuario = '${nuevo.nombreUsuario}');`);
    vacio = { nombreUsuario: nuevo.nombreUsuario, password: nuevo.password };
    writeFileSync(archivoVacio, JSON.stringify(vacio));
  }
  const datos: Datos = { esc, extras, vacio };
  const idCom = c.dueno.comercioId;

  const pantallas: Pantalla[] = [
    { rol: 'acceso', slug: 'login', ruta: 'login.html' },
    { rol: 'acceso', slug: 'bienvenida', ruta: 'bienvenida.html' },
    { rol: 'acceso', slug: 'registro-tipo-cuenta', ruta: 'registro-tipo-cuenta.html' },
    { rol: 'acceso', slug: 'registro-cliente-paso1', ruta: 'registro-cliente.html' },
    { rol: 'acceso', slug: 'registro-comercio-paso1', ruta: 'registro-comercio.html' },
    { rol: 'acceso', slug: 'verificar-email', ruta: 'verificar-email.html?email=lucia.fernandez%40ejemplo.com' },
    { rol: 'acceso', slug: 'recuperar-password', ruta: 'recuperar-password.html' },

    { rol: 'cliente', slug: 'catalogo', ruta: 'index.html' },
    { rol: 'cliente', slug: 'explorar-filtros', ruta: 'explorar.html', antes: async (p) => { await p.locator('[data-testid="fila-chips-categorias"] .chip').nth(2).click(); await p.waitForTimeout(1000); }, nota: 'con una categoría seleccionada' },
    { rol: 'cliente', slug: 'ficha-comercio', ruta: `comercio-detalle.html?id=${idCom}` },
    { rol: 'cliente', slug: 'producto-hoja', ruta: `comercio-detalle.html?id=${idCom}`, viewport: true, antes: async (p) => { await p.locator(`[data-testid="producto-item-${c.productoIds[0]}"]`).click(); await p.waitForTimeout(900); }, nota: 'hoja o diálogo del producto abierto (captura del viewport)' },
    { rol: 'cliente', slug: 'carrito', ruta: 'carrito.html', previo: async (t) => { await prepararCarrito(request, t, c.productoIds); }, nota: 'con 3 productos en el carrito' },
    { rol: 'cliente', slug: 'pedidos', ruta: 'pedidos.html' },
    { rol: 'cliente', slug: 'pedido-detalle-en-curso', ruta: `pedido-detalle.html?id=${c.pedidoEnCamino}` },
    { rol: 'cliente', slug: 'pedido-detalle-entregado', ruta: `pedido-detalle.html?id=${c.pedidoReclamable}` },
    { rol: 'cliente', slug: 'perfil', ruta: 'perfil.html' },
    { rol: 'cliente', slug: 'direcciones', ruta: (an) => (an >= 1024 ? 'perfil.html?seccion=direcciones' : 'perfil.html?vista=direcciones') },
    { rol: 'cliente', slug: 'avisos', ruta: 'notificaciones.html' },
    { rol: 'cliente', slug: 'checkout-1-modalidad', ruta: 'checkout.html', previo: async (t) => { await prepararCarrito(request, t, c.productoIds); } },
    { rol: 'cliente', slug: 'checkout-2-direccion', ruta: 'checkout.html', previo: async (t) => { await prepararCarrito(request, t, c.productoIds); }, antes: async (p) => { await clic(p, 'btn-modalidad-domicilio'); await p.waitForTimeout(700); } },
    { rol: 'cliente', slug: 'checkout-3-resumen', ruta: 'checkout.html', previo: async (t) => { await prepararCarrito(request, t, c.productoIds); }, antes: async (p) => { await clic(p, 'btn-modalidad-domicilio'); await p.waitForTimeout(700); await clic(p, 'btn-resumen-accion', 'btn-confirmar-direccion'); await p.waitForTimeout(900); } },
    { rol: 'cliente', slug: 'checkout-4-pago', ruta: 'checkout.html', previo: async (t) => { await prepararCarrito(request, t, c.productoIds); }, antes: async (p) => { await clic(p, 'btn-modalidad-domicilio'); await p.waitForTimeout(700); await clic(p, 'btn-resumen-accion', 'btn-confirmar-direccion'); await p.waitForTimeout(900); await clic(p, 'btn-resumen-accion', 'btn-confirmar-pedido'); await p.waitForSelector('[data-testid="btn-ir-a-pagar"]', { timeout: 10000, state: 'attached' }); await p.waitForTimeout(700); }, nota: 'crea el pedido y queda en el paso de pago' },

    { rol: 'dueno', slug: 'panel', ruta: 'comercio-dashboard.html' },
    { rol: 'dueno', slug: 'pedidos', ruta: (an) => (an >= 1024 ? `comercio-pedidos.html?id=${c.pedidos.pendiente}` : 'comercio-pedidos.html'), nota: 'en escritorio con un pedido seleccionado' },
    { rol: 'dueno', slug: 'pedido-detalle', ruta: (an) => (an >= 1024 ? `comercio-pedidos.html?id=${c.pedidos.preparacion}` : `comercio-pedido-detalle.html?id=${c.pedidos.preparacion}`) },
    { rol: 'dueno', slug: 'productos', ruta: 'comercio-productos.html' },
    { rol: 'dueno', slug: 'producto-form', ruta: `comercio-producto-form.html?id=${c.productoIds[0]}`, nota: 'edición de un producto con imágenes' },
    { rol: 'dueno', slug: 'estadisticas', ruta: 'comercio-estadisticas.html' },
    { rol: 'dueno', slug: 'equipo', ruta: (an) => (an >= 1024 ? 'comercio-perfil.html?seccion=equipo' : 'comercio-perfil.html'), antes: async (p, an) => { if (an < 1024) { await p.waitForSelector('[data-testid="btn-ver-equipo"]:not([disabled])'); await clic(p, 'btn-ver-equipo'); await p.waitForTimeout(900); } } },
    { rol: 'dueno', slug: 'documentacion', ruta: 'comercio-documentacion.html' },
    { rol: 'dueno', slug: 'perfil', ruta: 'comercio-perfil.html' },

    { rol: 'empleado', slug: 'panel', ruta: 'comercio-dashboard.html' },
    { rol: 'empleado', slug: 'pedidos', ruta: 'comercio-pedidos.html' },

    { rol: 'admin', slug: 'panel', ruta: 'admin-dashboard.html' },
    { rol: 'admin', slug: 'comercios-pendientes', ruta: 'admin-comercios-pendientes.html' },
    { rol: 'admin', slug: 'comercios', ruta: 'admin-comercios.html' },
    { rol: 'admin', slug: 'documento-revision', ruta: `admin-documento-revision.html?comercioId=${a.comercioBaseId}&id=${a.documentoId}` },
    { rol: 'admin', slug: 'soporte-ticket-abierto', ruta: 'admin-soporte.html', antes: async (p) => { await p.locator(`[data-testid="soporte-item-${a.consultaId}"]`).click(); await p.waitForTimeout(1200); }, nota: 'con una consulta abierta' },
    { rol: 'admin', slug: 'reclamos', ruta: 'admin-reclamos.html' },
    { rol: 'admin', slug: 'reembolsos', ruta: 'admin-reembolsos.html' },
    { rol: 'admin', slug: 'clientes', ruta: 'admin-clientes.html' },
    { rol: 'admin', slug: 'duenos', ruta: 'admin-duenos.html' },
    { rol: 'admin', slug: 'tarifas', ruta: 'admin-tarifas.html' },

    { rol: 'dueno', slug: 'estado-hoja-anular-pedido', ruta: (an) => (an >= 1024 ? `comercio-pedidos.html?id=${c.pedidos.preparacion}` : `comercio-pedido-detalle.html?id=${c.pedidos.preparacion}`), viewport: true, antes: async (p) => { await clic(p, 'btn-anular-pedido'); await p.waitForTimeout(900); }, nota: 'hoja de anulación abierta (captura del viewport)' },
    { rol: 'acceso', slug: 'estado-error-de-campo', ruta: 'registro-cliente.html', antes: async (p) => { await clic(p, 'btn-continuar'); await p.waitForTimeout(700); }, nota: 'Continuar sin completar el paso 1' },
    { rol: 'vacio', slug: 'estado-vacio-sin-pedidos', ruta: 'pedidos.html' },
    { rol: 'acceso', slug: 'estado-error-404', ruta: 'errores/404.html' },
  ];

  const nn = numerar(pantallas);
  const sesiones: Record<Rol, () => Promise<Awaited<ReturnType<typeof login>> | null>> = {
    acceso: async () => null,
    cliente: () => login(request, c.cliente.nombreUsuario, c.cliente.password),
    vacio: () => login(request, vacio.nombreUsuario, vacio.password),
    dueno: () => login(request, c.dueno.nombreUsuario, c.dueno.password),
    empleado: () => login(request, c.empleado.nombreUsuario, c.empleado.password),
    admin: () => login(request, ADMIN_USUARIO, ADMIN_PASSWORD_CONOCIDA),
  };

  const filas: Fila[] = [];
  const faltan: string[] = [];
  const archivoFilas = path.join(DIR, '_filas.json');
  const previas: Fila[] = existsSync(archivoFilas) && SOLO ? JSON.parse(readFileSync(archivoFilas, 'utf8')) : [];

  for (const rol of Object.keys(sesiones) as Rol[]) {
    const delRol = pantallas.filter((p) => p.rol === rol && (!SOLO || SOLO.some((s) => p.slug.includes(s) || nn.get(p) === s)));
    if (delRol.length === 0) continue;
    const sesion = await sesiones[rol]();
    for (const cfg of ANCHOS) {
      const contexto: BrowserContext = await browser.newContext({
        viewport: { width: cfg.ancho, height: cfg.alto },
        deviceScaleFactor: 2,
        isMobile: cfg.movil,
        hasTouch: cfg.movil,
        reducedMotion: 'reduce',
        locale: 'es-AR',
        timezoneId: 'America/Argentina/Ushuaia',
      });
      await contexto.route(/^https:\/\/res\.cloudinary\.com\//, (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: arteParaUrl(r.request().url()) }));
      await contexto.route('**/api/v1/catalogo/**', async (ruta) => {
        if (ruta.request().method() !== 'GET') return ruta.continue();
        const respuesta = await ruta.fetch();
        let json: any;
        try {
          json = await respuesta.json();
        } catch {
          return ruta.fulfill({ response: respuesta });
        }
        const ordenar = (lista: any[]) => lista.sort((x: any, y: any) => (x.id ?? 0) - (y.id ?? 0));
        if (json && Array.isArray(json.data)) ordenar(json.data);
        else if (json?.data && typeof json.data === 'object') Object.values(json.data).forEach((v) => Array.isArray(v) && ordenar(v));
        return ruta.fulfill({ response: respuesta, json });
      });
      const page = await contexto.newPage();
      await page.clock.install({ time: AHORA });
      await page.clock.setFixedTime(AHORA);
      if (sesion && rol === 'empleado') {
        await abrirComoUsuarioConContexto(page, sesion, { contexto: { tipo: 'EMPLEADO', comercioId: idCom }, ultimoContexto: `EMPLEADO:${idCom}` });
      } else if (sesion && rol === 'dueno') {
        await abrirComoUsuarioConContexto(page, sesion, { contexto: { tipo: 'DUENO', comercioId: idCom }, ultimoContexto: `DUENO:${idCom}` });
      } else if (sesion) {
        await abrirComoUsuario(page, sesion);
      }
      for (const p of delRol) {
        const ruta = typeof p.ruta === 'function' ? p.ruta(cfg.ancho, datos) : p.ruta;
        const archivo = `${nn.get(p)}-${p.rol === 'vacio' ? 'cliente' : p.rol}-${p.slug}-${cfg.sfx}.png`;
        let notas: string[] = [];
        let capturado = false;
        for (let intento = 1; intento <= 3 && !capturado; intento += 1) {
          notas = [];
          try {
            await page.setViewportSize({ width: cfg.ancho, height: cfg.alto });
            if (p.previo) await p.previo(sesion?.token ?? '', datos);
            await page.goto(`/${ruta}`, { waitUntil: 'load' });
            await estabilizar(page);
            if (p.antes) {
              await p.antes(page, cfg.ancho, datos, sesion?.token ?? '');
              await estabilizar(page);
            }
            let d = await diagnostico(page);
            if (!p.viewport && d.extraScroll > 0) {
              const alto = Math.min(cfg.alto + d.extraScroll + 40, 7000);
              await page.setViewportSize({ width: cfg.ancho, height: alto });
              await page.waitForTimeout(800);
              await estabilizar(page);
              d = await diagnostico(page);
              notas.push(`alto de ventana ampliado a ${alto} px para no recortar un panel con scroll interno`);
            }
            if (MEDIR_TIPOGRAFIA) {
              const m = await medirTipografia(page);
              medicionesTipografia.push({ archivo, ancho: cfg.ancho, menores12: m.menores12, secundarios12a13: m.secundarios12a13, desborde: d.desborde });
            }
            if (d.cargando > 0) notas.push(`${d.cargando} esqueleto(s) o spinner(s) visibles`);
            if (d.imgsRotas > 0) notas.push(`${d.imgsRotas} imagen(es) sin cargar`);
            if (d.desborde > 1) notas.push(`desborde horizontal de ${d.desborde} px`);
            if (!d.fuenteNunito) notas.push('Nunito no cargó');
            const problemas = notas.filter((n) => !n.startsWith('alto de ventana'));
            if (problemas.length > 0 && intento < 3) continue;
            await page.mouse.move(0, 0);
            await page.waitForTimeout(300);
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: path.join(DIR, archivo), fullPage: !p.viewport, animations: 'disabled', caret: 'hide' });
            capturado = true;
          } catch (e) {
            notas.push(`fallo: ${String(e).split('\n')[0].slice(0, 160)}`);
            if (intento === 3) faltan.push(`${archivo}: ${notas.join('; ')}`);
          }
        }
        if (capturado) {
          const u = new URL(page.url());
          if (p.nota) notas.unshift(p.nota);
          filas.push({ archivo, rol: p.rol === 'vacio' ? 'cliente (sin pedidos)' : p.rol, pantalla: p.slug, ancho: cfg.ancho, url: u.pathname.replace(/^\//, '') + u.search, bytes: statSync(path.join(DIR, archivo)).size, notas: notas.join('; ') });
        }
      }
      await contexto.close();
    }
  }
  const todas = [...previas.filter((f) => !filas.some((n) => n.archivo === f.archivo)), ...filas].sort((x, y) => x.archivo.localeCompare(y.archivo));
  writeFileSync(archivoFilas, JSON.stringify(todas, null, 1));
  writeFileSync(path.join(DIR, '_faltan.json'), JSON.stringify(faltan, null, 1));
  if (MEDIR_TIPOGRAFIA) {
    writeFileSync(path.join(DIR, '_tipografia.json'), JSON.stringify(medicionesTipografia, null, 1));
    const total12 = medicionesTipografia.reduce((n, m) => n + m.menores12.length, 0);
    const total13 = medicionesTipografia.reduce((n, m) => n + m.secundarios12a13.length, 0);
    console.log(`TIPOGRAFIA menores de 12 px: ${total12}; secundarios (gris) entre 12 y 13 px: ${total13}`);
  }
  console.log(`CAPTURADAS ${filas.length}; con problemas o faltantes ${faltan.length}`);
  faltan.forEach((f) => console.log('FALTA', f));
});

async function prepararCarrito(request: APIRequestContext, token: string, productoIds: number[]) {
  await apiDelete(request, '/carrito', token);
  await agregarItemCarrito(request, token, productoIds[0], 2);
  await agregarItemCarrito(request, token, productoIds[1], 1);
  await agregarItemCarrito(request, token, productoIds[2], 2);
}
