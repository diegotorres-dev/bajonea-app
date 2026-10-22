import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const ROUNDS = Number(process.env.ROUNDS || 10);
const ADMIN = { nombreUsuario: 'adminbajonea', password: process.env.ADMIN_PASSWORD };
const sqlUnaVez = (q) => execFileSync(process.env.MYSQL_BIN || 'C:/xampp/mysql/bin/mysql.exe', ['-u', 'root', '-N', '-B', 'bajonea_test', '-e', q]).toString().trim();
const sql = (q) => {
  let resultado = sqlUnaVez(q);
  for (let intento = 0; intento < 2 && resultado === '' && /^\s*SELECT/i.test(q); intento += 1) resultado = sqlUnaVez(q);
  return resultado;
};

if (!ADMIN.password) {
  console.error('Falta ADMIN_PASSWORD (contraseña actual de admin@bajonea.ar en bajonea_test)');
  process.exit(1);
}

let seq = Date.now() % 100000;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`.slice(-10);
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const aleatorio = (max) => Math.floor(Math.random() * max);
const clavePropia = () => `Pw${uniq()}Aa1`;

async function call(method, path, token, body, headers = {}) {
  const res = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function cuit() {
  const m = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  for (;;) {
    const base = '30' + String(Math.floor(10_000_000 + Math.random() * 89_999_999));
    let s = 0;
    for (let i = 0; i < 10; i++) s += Number(base[i]) * m[i];
    let dv = 11 - (s % 11);
    if (dv === 11) dv = 0;
    if (dv === 10) continue;
    return base + dv;
  }
}
let dniSeq = 40_000_000 + Math.floor(Math.random() * 30_000_000);
const dni = () => String(dniSeq++);
const tel = () => `+549296${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
const horariosTodosLosDias = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({
  diaSemana,
  horaApertura: '00:00',
  horaCierre: '23:59',
}));

let LOC;
async function resolverLocalidad() {
  const provincias = (await call('GET', '/geografia/provincias')).json.data;
  const provincia = provincias.find((p) => p.nombre.startsWith('Tierra del Fuego'));
  const localidades = (await call('GET', `/geografia/localidades?provinciaId=${encodeURIComponent(provincia.id)}`)).json.data;
  const localidad = localidades.find((l) => /r[ií]o grande/i.test(l.nombre));
  return localidad.id;
}

const direccion = () => ({ calle: 'Stress', numero: '1', pisoDepto: null, codigoPostal: '9420', localidadId: LOC, principal: true });

async function nuevoDueno() {
  const u = uniq();
  const email = `stresst3.${u}@bajonea.test`;
  const nombreUsuario = `sf${u}`.slice(0, 20);
  const password = clavePropia();
  const r = await call('POST', '/auth/registro/comercio', null, {
    aceptaTerminos: true,
    razonSocial: `StressT3 ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `StressT3 ${u}`,
    descripcion: 'x',
    telefono: tel(),
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: false,
    aceptaRetiro: true,
    nombreUsuario,
    email,
    password,
    direccion: { ...direccion(), principal: false },
    horarios: horariosTodosLosDias,
    nombreRepresentante: 'Rep',
    apellidoRepresentante: 'Stress',
    dniRepresentante: dni(),
    telefonoRepresentante: tel(),
    fechaNacimientoRepresentante: '1985-03-15',
    fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/v1/comercios/pre-registro/stress.png',
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/sf${u}` }],
  });
  if (r.status !== 201) throw new Error('registro dueno ' + JSON.stringify(r));
  const codigo = (await call('GET', `/test/token-verificacion?email=${email}`)).json.data;
  const v = await call('POST', '/auth/verificar', null, { email, codigo });
  if (v.status !== 200) throw new Error('verificar dueno ' + JSON.stringify(v));
  const login = await call('POST', '/auth/login', null, { nombreUsuario, password });
  if (login.status !== 200) throw new Error('login dueno ' + JSON.stringify(login));
  return { email, nombreUsuario, password, token: login.json.data.token, duenoId: login.json.data.usuario.id };
}

async function duenoAprobado(admin) {
  const d = await nuevoDueno();
  const pendiente = (await call('GET', '/administrador/comercios/pendientes', admin)).json.data.find((c) => c.emailCuenta === d.email);
  const aprobado = await call('PUT', `/administrador/comercios/${pendiente.id}/resolver`, admin, { aprobar: true });
  if (aprobado.status !== 200) throw new Error('aprobar ' + JSON.stringify(aprobado));
  d.comercioId = pendiente.id;
  return d;
}

async function nuevoClienteVerificado() {
  const u = uniq();
  const email = `stresst3.cli.${u}@bajonea.test`;
  const nombreUsuario = `sg${u}`.slice(0, 20);
  const password = clavePropia();
  const r = await call('POST', '/auth/registro/cliente', null, {
    nombre: 'Cliente',
    apellido: 'Stress',
    dni: dni(),
    fechaNacimiento: '1995-05-20',
    telefono: tel(),
    nombreUsuario,
    email,
    password,
    aceptaTerminos: true,
    direccion: direccion(),
  });
  if (r.status !== 201) throw new Error('registro cliente ' + JSON.stringify(r));
  const codigo = (await call('GET', `/test/token-verificacion?email=${email}`)).json.data;
  const v = await call('POST', '/auth/verificar', null, { email, codigo });
  if (v.status !== 200) throw new Error('verificar cliente ' + JSON.stringify(v));
  return { email, nombreUsuario, password };
}

const clonar = async (comercioId, estado = 'APROBADO') => {
  const r = await call('POST', `/test/comercios/${comercioId}/clonar?nombre=${encodeURIComponent(`Clon ${uniq()}`)}&estado=${estado}`);
  if (r.status !== 201) throw new Error('clonar ' + JSON.stringify(r));
  return r.json.data;
};

const cabecera = (comercioId) => ({ 'X-Comercio-Id': String(comercioId) });

async function empleadoDe(dueno, comercioIds) {
  const cuenta = await nuevoClienteVerificado();
  for (const comercioId of comercioIds) {
    const inv = await call('POST', '/comercios/equipo/invitaciones', dueno.token, { email: cuenta.email }, cabecera(comercioId));
    if (inv.status !== 201) throw new Error('invitar ' + JSON.stringify(inv));
    const codigo = (await call('GET', `/test/invitaciones-empleado/codigo?email=${encodeURIComponent(cuenta.email)}&comercioId=${comercioId}`)).json.data;
    const acep = await call('POST', '/auth/invitaciones-empleado/aceptar', null, { email: cuenta.email, codigo });
    if (acep.status !== 200) throw new Error('aceptar ' + JSON.stringify(acep));
  }
  const login = await call('POST', '/auth/login', null, { nombreUsuario: cuenta.nombreUsuario, password: cuenta.password });
  if (login.status !== 200) throw new Error('login empleado ' + JSON.stringify(login));
  return { ...cuenta, token: login.json.data.token, id: login.json.data.usuario.id };
}

const LOG_BACKEND = process.env.BACKEND_LOG || `${process.env.TEMP || '/tmp'}/backend-test.log`;
const NO_DISPONIBLE = JSON.stringify({ mensaje: 'Comercio no encontrado', data: { codigo: 'COMERCIO_NO_DISPONIBLE' } });
const BASE_CATEGORIA = `StressT3 ${uniq()}`;

const mysql = process.env.MYSQL_BIN || 'C:/xampp/mysql/bin/mysql.exe';

let categoriaId;

async function comercioListo(admin) {
  const d = await duenoAprobado(admin);
  const apto = await call('PUT', `/test/comercios/${d.comercioId}/apto-venta`);
  if (apto.status !== 200) throw new Error('apto-venta ' + JSON.stringify(apto));
  const firma = await call('POST', '/comercios/perfil/foto/firma', d.token, {}, cabecera(d.comercioId));
  d.nube = firma.json.data.cloudName;
  const producto = await call('POST', '/productos', d.token, { nombre: `Producto ${uniq()}`, precio: 1500, categoriaId }, cabecera(d.comercioId));
  if (producto.status !== 201) throw new Error('producto ' + JSON.stringify(producto));
  d.productoId = producto.json.data.id;
  const imagen = await call('POST', `/productos/${d.productoId}/imagenes`, d.token,
    { url: `https://res.cloudinary.com/${d.nube}/image/upload/v1/productos/${d.comercioId}/${d.productoId}/s.png`, orden: 0, esPrincipal: true }, cabecera(d.comercioId));
  if (imagen.status !== 201) throw new Error('imagen ' + JSON.stringify(imagen));
  d.imagenId = imagen.json.data.id;
  return d;
}

async function comprador() {
  const cuenta = await nuevoClienteVerificado();
  const login = await call('POST', '/auth/login', null, { nombreUsuario: cuenta.nombreUsuario, password: cuenta.password });
  if (login.status !== 200) throw new Error('login comprador ' + JSON.stringify(login));
  return { ...cuenta, token: login.json.data.token };
}

async function pedidoPendiente(cliente, productoId) {
  const agregado = await call('POST', '/carrito/items', cliente.token, { productoId, cantidad: 1 });
  if (agregado.status !== 201) throw new Error('carrito ' + JSON.stringify(agregado));
  const pedido = await call('POST', '/pedidos/cliente', cliente.token, { tipoEntrega: 'RETIRO', direccionId: null });
  if (pedido.status !== 201) throw new Error('pedido ' + JSON.stringify(pedido));
  const id = pedido.json.data.id;
  const pago = await call('PUT', `/test/pedidos/${id}/pago-aprobado?registrarPago=true`);
  if (pago.status !== 200) throw new Error('pago ' + JSON.stringify(pago));
  return id;
}

const datosOperativos = (actor, comercioId) => call('PUT', '/comercios/perfil/datos-operativos', actor.token, { descripcion: `Stress ${uniq()}`, telefono: tel() }, cabecera(comercioId));
const estadoProducto = (actor, d, estado) => call('PATCH', `/productos/${d.productoId}/estado`, actor.token, { estado }, cabecera(d.comercioId));
const reordenar = (actor, d) => call('PATCH', `/productos/${d.productoId}/imagenes/${d.imagenId}/orden`, actor.token, { orden: aleatorio(3) }, cabecera(d.comercioId));
const editarProducto = (actor, d) => call('PUT', `/productos/${d.productoId}`, actor.token, { nombre: `Producto ${uniq()}`, precio: 1000 + aleatorio(9000), categoriaId }, cabecera(d.comercioId));
const cerrar = (actor, comercioId) => call('PUT', '/comercios/cerrar', actor.token, {}, cabecera(comercioId));
const abrir = (actor, comercioId) => call('PUT', '/comercios/abrir', actor.token, {}, cabecera(comercioId));
const accionPedido = (actor, comercioId, pedidoId, accion) =>
  call('PUT', `/pedidos/comercio/${pedidoId}/${accion}`, actor.token,
    accion === 'rechazar' || accion === 'anular' ? { motivo: 'SIN_STOCK' } : {}, cabecera(comercioId));
const loginIncorrecto = (d) => call('POST', '/auth/login', null, { nombreUsuario: d.nombreUsuario, password: 'ClaveIncorrecta1' });

const contar = (resumen, clave) => {
  resumen[clave] = (resumen[clave] ?? 0) + 1;
};
const resumir = (resumen) => Object.entries(resumen).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k}=${n}`).join(' ');

function nuevoRegistro() {
  const problemas = [];
  return {
    problemas,
    registrar: (etiqueta, r, permitidos) => {
      if (r.status >= 500) problemas.push(`${etiqueta}: ${r.status} ${JSON.stringify(r.json)}`);
      else if (!permitidos.includes(r.status)) problemas.push(`${etiqueta}: estado inesperado ${r.status} ${JSON.stringify(r.json)}`);
      if (r.status === 404 && JSON.stringify(r.json) !== NO_DISPONIBLE && !/no encontrado/i.test(r.json?.mensaje ?? '')) {
        problemas.push(`${etiqueta}: 404 con cuerpo inesperado ${JSON.stringify(r.json)}`);
      }
    },
  };
}



async function pedidoSinPagar(cliente, productoId) {
  const agregado = await call('POST', '/carrito/items', cliente.token, { productoId, cantidad: 1 });
  if (agregado.status !== 201) throw new Error('carrito ' + JSON.stringify(agregado));
  const pedido = await call('POST', '/pedidos/cliente', cliente.token, { tipoEntrega: 'RETIRO', direccionId: null });
  if (pedido.status !== 201) throw new Error('pedido ' + JSON.stringify(pedido));
  return pedido.json.data.id;
}

const cuenta = (consulta) => Number(sql(consulta));
const PRECIO_INICIAL = 1500;
const bloqueoDePrecio = (habilitado) => call('PUT', `/test/precio-bloqueo?habilitado=${habilitado}`);
const pagar = (pedidoId) => call('PUT', `/test/pedidos/${pedidoId}/pago-aprobado?registrarPago=true`);
const aceptar = (actor, comercioId, pedidoId) => call('PUT', `/pedidos/comercio/${pedidoId}/aceptar`, actor.token, {}, cabecera(comercioId));
const resumenTurno = (actor, comercioId) => call('GET', '/pedidos/comercio/resumen-turno', actor.token, undefined, cabecera(comercioId));
const editarPrecio = (actor, d, precio) => call('PUT', `/productos/${d.productoId}`, actor.token, { nombre: `Producto ${uniq()}`, precio, categoriaId }, cabecera(d.comercioId));
const precioDelProducto = (d) => Number(sql(`SELECT precio FROM producto WHERE id = ${d.productoId};`));
const horarios = (comercioId, filas) => {
  sql(`DELETE FROM horario WHERE comercio_id = ${comercioId};`);
  for (const fila of filas) {
    sql(`INSERT INTO horario (comercio_id, dia_semana, hora_apertura, hora_cierre) VALUES (${comercioId}, '${fila.dia}', '${fila.apertura}', '${fila.cierre}');`);
  }
};

const mezclar = (lista) => {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = aleatorio(i + 1);
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
};
const MINUTO = 60_000;
const DIAS_ZONA = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const enUshuaia = (desplazamientoMin) => new Date(Date.now() - 3 * 3600_000 + desplazamientoMin * MINUTO);
const franja = (desde, hasta) => {
  const inicio = enUshuaia(desde);
  const fin = enUshuaia(hasta);
  const hora = (fecha) => `${String(fecha.getUTCHours()).padStart(2, '0')}:${String(fecha.getUTCMinutes()).padStart(2, '0')}`;
  return [{ dia: DIAS_ZONA[inicio.getUTCDay()], apertura: hora(inicio), cierre: hora(fin) }];
};

async function compradorConId() {
  const cuentaNueva = await nuevoClienteVerificado();
  const login = await call('POST', '/auth/login', null, { nombreUsuario: cuentaNueva.nombreUsuario, password: cuentaNueva.password });
  if (login.status !== 200) throw new Error('login comprador ' + JSON.stringify(login));
  return { ...cuentaNueva, token: login.json.data.token, id: login.json.data.usuario.id };
}

async function conBloqueo(habilitado, accion) {
  const encendido = await bloqueoDePrecio(habilitado);
  if (encendido.status !== 200) throw new Error('atajo de bloqueo ' + JSON.stringify(encendido));
  try {
    return await accion();
  } finally {
    await bloqueoDePrecio(false);
  }
}

async function escenario1(admin) {
  console.log('--- (1) ediciones de precio contra agregar al carrito, cambiar la cantidad y ver el carrito ---');
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const empleado = await empleadoDe(d, [d.comercioId]);
    const clientes = await Promise.all(Array.from({ length: 3 }, () => compradorConId()));
    const precios = Array.from({ length: 6 }, () => 2000 + aleatorio(7000));
    const tareas = [];
    precios.forEach((precio, i) => {
      tareas.push(editarPrecio(i % 2 === 0 ? d : empleado, d, precio).then((r) => ({ tipo: 'editar', r, precio })));
    });
    for (const cliente of clientes) {
      tareas.push(call('POST', '/carrito/items', cliente.token, { productoId: d.productoId, cantidad: 1 }).then((r) => ({ tipo: 'agregar', r })));
      tareas.push(call('GET', '/carrito', cliente.token).then((r) => ({ tipo: 'ver', r })));
      tareas.push(call('POST', '/carrito/items', cliente.token, { productoId: d.productoId, cantidad: 1 }).then((r) => ({ tipo: 'agregar', r })));
    }
    const resultados = await Promise.all(tareas);
    const escritos = new Set([PRECIO_INICIAL]);
    for (const { tipo, r, precio } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      registrar(`ronda ${ronda} ${tipo}`, r, tipo === 'editar' ? [200] : tipo === 'ver' ? [200] : [200, 201]);
      if (tipo === 'editar' && r.status === 200) escritos.add(precio);
    }
    const final = precioDelProducto(d);
    if (!escritos.has(final)) problemas.push(`ronda ${ronda}: el precio final ${final} no es ninguno de los escritos`);
    for (const cliente of clientes) {
      const visto = sql(`SELECT ic.precio_visto FROM item_carrito ic JOIN carrito c ON c.id = ic.carrito_id WHERE c.cliente_id = ${cliente.id} AND ic.producto_id = ${d.productoId};`);
      if (visto === '' || visto === 'NULL') {
        problemas.push(`ronda ${ronda}: cliente ${cliente.id} sin precio_visto`);
      } else if (!escritos.has(Number(visto))) {
        problemas.push(`ronda ${ronda}: cliente ${cliente.id} tiene precio_visto ${visto}, un precio que el producto nunca tuvo`);
      }
      const carrito = await call('GET', '/carrito', cliente.token);
      const fila = carrito.json?.data?.items?.[0];
      if (!fila || Number(fila.precioUnitario) !== final) problemas.push(`ronda ${ronda}: el carrito del cliente ${cliente.id} no muestra el precio vigente ${final}`);
      if (fila && fila.precioCambio !== (Number(fila.precioVisto) !== final)) problemas.push(`ronda ${ronda}: precioCambio inconsistente en el carrito del cliente ${cliente.id}`);
    }
  }
  console.log('Resumen (1):', resumir(resumen));
  return problemas;
}

async function escenario2(admin) {
  console.log('--- (2) ediciones de precio contra la creacion del pedido con total esperado ---');
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const clientes = await Promise.all(Array.from({ length: 4 }, () => compradorConId()));
    const esperados = [];
    for (const cliente of clientes) {
      const agregado = await call('POST', '/carrito/items', cliente.token, { productoId: d.productoId, cantidad: 1 });
      if (agregado.status !== 201) throw new Error('carrito ' + JSON.stringify(agregado));
      esperados.push(Number((await call('GET', '/carrito', cliente.token)).json.data.total));
    }
    const tareas = [];
    for (let i = 0; i < 5; i++) {
      tareas.push(() => editarPrecio(d, d, 2000 + aleatorio(7000)).then((r) => ({ tipo: 'editar', r })));
    }
    clientes.forEach((cliente, i) => {
      tareas.push(() =>
        call('POST', '/pedidos/cliente', cliente.token, { tipoEntrega: 'RETIRO', direccionId: null, totalEsperado: esperados[i] }).then((r) => ({ tipo: 'pedido', r, i })),
      );
    });
    const resultados = await Promise.all(mezclar(tareas).map(async (lanzar) => {
      await esperar(aleatorio(60));
      return lanzar();
    }));
    for (const { tipo, r, i } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      registrar(`ronda ${ronda} ${tipo}`, r, tipo === 'editar' ? [200] : [201, 409]);
      if (tipo !== 'pedido') continue;
      if (r.status === 201) {
        const total = Number(sql(`SELECT total FROM pedido WHERE id = ${r.json.data.id};`));
        if (total !== esperados[i]) problemas.push(`ronda ${ronda}: el pedido ${r.json.data.id} se creo con total ${total} y el cliente esperaba ${esperados[i]}`);
        const suma = Number(sql(`SELECT SUM(subtotal) FROM detalle_pedido WHERE pedido_id = ${r.json.data.id};`));
        const subtotal = Number(sql(`SELECT subtotal FROM pedido WHERE id = ${r.json.data.id};`));
        if (suma !== subtotal) problemas.push(`ronda ${ronda}: el pedido ${r.json.data.id} tiene subtotal ${subtotal} y detalles por ${suma}`);
      } else if (r.json?.data?.codigo !== 'PRECIO_CAMBIO') {
        problemas.push(`ronda ${ronda}: el 409 del pedido no es PRECIO_CAMBIO: ${JSON.stringify(r.json)}`);
      } else if (cuenta(`SELECT COUNT(*) FROM pedido WHERE cliente_id = ${clientes[i].id};`) !== 0) {
        problemas.push(`ronda ${ronda}: el cliente ${clientes[i].id} recibio PRECIO_CAMBIO y de todos modos tiene un pedido`);
      }
    }
  }
  console.log('Resumen (2):', resumir(resumen));
  return problemas;
}

async function escenario3(admin) {
  console.log('--- (3) con el bloqueo encendido: ediciones de precio contra cierre, apertura, datos operativos y ediciones de horarios ---');
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const dentro = await comercioListo(admin);
    horarios(dentro.comercioId, franja(-30, 30));
    const empleadoDentro = await empleadoDe(dentro, [dentro.comercioId]);
    const fuera = await comercioListo(admin);
    horarios(fuera.comercioId, franja(120, 180));
    const empleadoFuera = await empleadoDe(fuera, [fuera.comercioId]);
    const resultados = await conBloqueo(true, () => {
      const tareas = [];
      for (let i = 0; i < 6; i++) {
        tareas.push(editarPrecio(i % 2 === 0 ? dentro : empleadoDentro, dentro, 2000 + aleatorio(7000)).then((r) => ({ tipo: 'precio-dentro', r })));
        tareas.push(editarPrecio(i % 2 === 0 ? fuera : empleadoFuera, fuera, 2000 + aleatorio(7000)).then((r) => ({ tipo: 'precio-fuera', r })));
      }
      for (let i = 0; i < 3; i++) {
        tareas.push(cerrar(dentro, dentro.comercioId).then((r) => ({ tipo: 'cerrar', r })));
        tareas.push(abrir(empleadoDentro, dentro.comercioId).then((r) => ({ tipo: 'abrir', r })));
        tareas.push(datosOperativos(dentro, dentro.comercioId).then((r) => ({ tipo: 'datos', r })));
        tareas.push(call('PUT', '/comercios/perfil/horarios', fuera.token, { horarios: [{ diaSemana: DIAS_ZONA[(i + 1) % 7].toUpperCase(), horaApertura: '09:00', horaCierre: '12:00' }] }, cabecera(fuera.comercioId))
          .then((r) => ({ tipo: 'horarios-fuera', r })));
        tareas.push(call('GET', '/productos', dentro.token, undefined, cabecera(dentro.comercioId)).then((r) => ({ tipo: 'lista', r })));
      }
      return Promise.all(tareas);
    });
    for (const { tipo, r } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      const permitidos = {
        'precio-dentro': [409],
        'precio-fuera': [200],
        cerrar: [200],
        abrir: [200, 409],
        datos: [200],
        'horarios-fuera': [200, 400, 409],
        lista: [200],
      }[tipo];
      registrar(`ronda ${ronda} ${tipo}`, r, permitidos);
      if (tipo === 'precio-dentro' && r.status === 409 && r.json?.data?.codigo !== 'PRECIO_BLOQUEADO_EN_FRANJA') {
        problemas.push(`ronda ${ronda}: el 409 del precio no lleva el codigo del bloqueo: ${JSON.stringify(r.json)}`);
      }
    }
    if (precioDelProducto(dentro) !== PRECIO_INICIAL) problemas.push(`ronda ${ronda}: el precio dentro de la franja cambio a ${precioDelProducto(dentro)}`);
  }
  console.log('Resumen (3):', resumir(resumen));
  return problemas;
}

async function escenario4(admin) {
  console.log('--- (4) pagos, aceptaciones y lecturas del resumen del turno contra ediciones de precio ---');
  const { problemas, registrar } = nuevoRegistro();
  const resumen = {};
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await comercioListo(admin);
    const clientes = await Promise.all(Array.from({ length: 4 }, () => compradorConId()));
    const pedidos = [];
    for (const cliente of clientes) pedidos.push(await pedidoSinPagar(cliente, d.productoId));
    const tareas = [];
    for (let i = 0; i < 5; i++) {
      tareas.push(editarPrecio(d, d, 2000 + aleatorio(7000)).then((r) => ({ tipo: 'editar', r })));
      tareas.push(resumenTurno(d, d.comercioId).then((r) => ({ tipo: 'resumen', r })));
    }
    for (const pedidoId of pedidos) tareas.push(pagar(pedidoId).then((r) => ({ tipo: 'pago', r })));
    const resultados = await Promise.all(tareas);
    for (const { tipo, r } of resultados) {
      contar(resumen, `${tipo}:${r.status}`);
      registrar(`ronda ${ronda} ${tipo}`, r, [200]);
    }
    for (const pedidoId of pedidos) {
      const aceptado = await aceptar(d, d.comercioId, pedidoId);
      registrar(`ronda ${ronda} aceptar`, aceptado, [200]);
      const unitario = Number(sql(`SELECT precio_unitario FROM detalle_pedido WHERE pedido_id = ${pedidoId};`));
      if (unitario !== PRECIO_INICIAL) problemas.push(`ronda ${ronda}: el pedido ${pedidoId} quedo con precio unitario ${unitario} y se creo a ${PRECIO_INICIAL}`);
    }
    const final = await resumenTurno(d, d.comercioId);
    registrar(`ronda ${ronda} resumen final`, final, [200]);
    const esperado = cuenta(`SELECT IFNULL(SUM(subtotal), 0) FROM pedido WHERE comercio_id = ${d.comercioId} AND estado = 'EN_PREPARACION';`);
    if (Number(final.json?.data?.vendido) !== esperado) problemas.push(`ronda ${ronda}: el resumen dice ${final.json?.data?.vendido} y la base suma ${esperado}`);
  }
  console.log('Resumen (4):', resumir(resumen));
  return problemas;
}

const bytesDelLog = () => (existsSync(LOG_BACKEND) ? statSync(LOG_BACKEND).size : 0);

function revisarElLog(desde) {
  if (!existsSync(LOG_BACKEND)) return [`no se encontro el log del backend en ${LOG_BACKEND}: revisar a mano que no tenga "Deadlock found" ni "Lock wait timeout"`];
  const texto = readFileSync(LOG_BACKEND).subarray(desde).toString('utf8');
  const problemas = [];
  const deadlocks = (texto.match(/Deadlock found/g) || []).length;
  const timeouts = (texto.match(/Lock wait timeout/g) || []).length;
  if (deadlocks) problemas.push(`el log del backend tiene ${deadlocks} "Deadlock found"`);
  if (timeouts) problemas.push(`el log del backend tiene ${timeouts} "Lock wait timeout"`);
  return problemas;
}

async function main() {
  const inicioLog = bytesDelLog();
  LOC = await resolverLocalidad();
  const admin = (await call('POST', '/auth/login', null, ADMIN)).json.data.token;
  const categoria = await call('POST', '/categorias', admin, { nombre: BASE_CATEGORIA });
  if (categoria.status !== 201) throw new Error('categoria ' + JSON.stringify(categoria));
  categoriaId = categoria.json.data.id;
  await bloqueoDePrecio(false);
  const solo = process.env.ESCENARIO;
  const escenarios = [escenario1, escenario2, escenario3, escenario4];
  const todos = [];
  try {
    for (let i = 0; i < escenarios.length; i++) {
      if (!solo || solo === String(i + 1)) todos.push(...(await escenarios[i](admin)));
    }
  } finally {
    await bloqueoDePrecio(false);
  }
  todos.push(...revisarElLog(inicioLog));
  console.log(todos.length ? 'PROBLEMAS:\n' + todos.join('\n') : 'SIN PROBLEMAS (sin 5xx, sin inconsistencias, sin Deadlock ni Lock wait timeout en el log)');
  if (todos.length) process.exitCode = 1;
}

main().catch(async (e) => {
  console.error(e);
  try {
    await bloqueoDePrecio(false);
  } catch {
  }
  process.exit(1);
});
