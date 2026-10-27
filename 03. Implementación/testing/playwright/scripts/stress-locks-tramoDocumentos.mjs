import { execFileSync } from 'node:child_process';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const LOC = process.env.LOC;
const ROUNDS = Number(process.env.ROUNDS || 6);
const ESCENARIO = process.env.ESCENARIO ? process.env.ESCENARIO.split(',').map(Number) : null;
const ADMIN = { nombreUsuario: process.env.ADMIN_USUARIO || 'adminbajonea', password: process.env.ADMIN_PASSWORD };
if (!ADMIN.password) {
  console.error('Falta ADMIN_PASSWORD (contraseña de admin@bajonea.ar en bajonea_test; ver testing/playwright/README.md)');
  process.exit(1);
}
if (!LOC) {
  console.error('Falta LOC (id de la localidad Río Grande)');
  process.exit(1);
}

const MYSQL = process.env.MYSQL_BIN || 'C:/xampp/mysql/bin/mysql.exe';
const sqlUnaVez = (q) => execFileSync(MYSQL, ['-u', 'root', '-N', '-B', '--default-character-set=utf8mb4', 'bajonea_test'], { input: q }).toString().trim();
const sql = (q) => {
  let resultado = sqlUnaVez(q);
  for (let intento = 0; intento < 2 && resultado === '' && /^\s*SELECT/i.test(q); intento += 1) resultado = sqlUnaVez(q);
  return resultado;
};

let seq = Date.now() % 100000;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`.slice(-10);

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

const PDF = new TextEncoder().encode('%PDF-1.4\n%estres de documentos\n%%EOF\n');

async function subir(dueno, nombre = 'doc.pdf') {
  const datos = new FormData();
  datos.append('tipo', 'LIBRETA_SANITARIA');
  datos.append('archivo', new Blob([PDF], { type: 'application/pdf' }), nombre);
  const res = await fetch(B + '/comercios/documentos', {
    method: 'POST',
    headers: { Authorization: `Bearer ${dueno.token}`, 'X-Comercio-Id': String(dueno.comercioId) },
    body: datos,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

const eliminar = (dueno, id) => call('DELETE', `/comercios/documentos/${id}`, dueno.token, undefined, { 'X-Comercio-Id': String(dueno.comercioId) });
const resolver = (admin, id, aprobar, motivo) => call('PUT', `/administrador/documentos/${id}/resolver`, admin, { aprobar, motivo });
const desvincular = (dueno) => call('DELETE', '/oauth/mercadopago/desvincular', dueno.token);
const vincular = (dueno) => call('POST', `/test/duenos/${dueno.id}/mercadopago-simulada`, null, {});
const fallarLogin = (dueno) => call('POST', '/auth/login', null, { nombreUsuario: dueno.nombreUsuario, password: 'ClaveIncorrecta1' });

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
const dni = () => String(Math.floor(20_000_000 + Math.random() * 20_000_000));
const tel = () => `+549296${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;

async function nuevoDueno(admin, { conMercadoPago }) {
  const u = uniq();
  const cuerpo = {
    aceptaTerminos: true,
    cuit: cuit(),
    domicilioFiscal: 'Av. Stress 1',
    nombre: `Stress Documentos ${u}`,
    descripcion: 'x',
    telefono: tel(),
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: true,
    aceptaRetiro: true,
    nombreUsuario: `sd${u}`.slice(0, 20),
    email: `stress.doc.${u}@bajonea.test`,
    password: 'Testing123',
    direccion: { calle: 'Stress', numero: '1', pisoDepto: null, codigoPostal: '9420', localidadId: LOC, principal: false },
    horarios: ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({ diaSemana, horaApertura: '00:00', horaCierre: '23:59' })),
    nombreRepresentante: 'Rep',
    apellidoRepresentante: 'Stress',
    dniRepresentante: dni(),
    telefonoRepresentante: tel(),
    fechaNacimientoRepresentante: '1985-03-15',
    fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/stress-doc.png',
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/sdoc${u}` }],
  };
  const r = await call('POST', '/auth/registro/comercio', null, cuerpo);
  if (r.status !== 201) throw new Error('registro comercio ' + JSON.stringify(r));
  const codigo = (await call('GET', `/test/token-verificacion?email=${cuerpo.email}`)).json.data;
  await call('POST', '/auth/verificar', null, { email: cuerpo.email, codigo });
  const pendiente = (await call('GET', '/administrador/comercios/pendientes', admin)).json.data.find((c) => c.emailCuenta === cuerpo.email);
  await call('PUT', `/administrador/comercios/${pendiente.id}/resolver`, admin, { aprobar: true });
  const login = (await call('POST', '/auth/login', null, { nombreUsuario: cuerpo.nombreUsuario, password: cuerpo.password })).json.data;
  const dueno = { id: login.usuario.id, token: login.token, comercioId: pendiente.id, nombreUsuario: cuerpo.nombreUsuario };
  if (conMercadoPago) {
    const v = await vincular(dueno);
    if (v.status !== 200) throw new Error('vincular ' + JSON.stringify(v));
  }
  return dueno;
}

const estadoComercio = (d) => sql(`SELECT estado FROM comercio WHERE id = ${d.comercioId};`);
const estadoUsuario = (d) => sql(`SELECT estado FROM usuario WHERE id = ${d.id};`);
const cuentaActiva = (d) => Number(sql(`SELECT COUNT(*) FROM cuenta_mercado_pago WHERE dueno_id = ${d.id} AND activa = 1;`)) > 0;
const contarDocs = (d, estado) => Number(sql(`SELECT COUNT(*) FROM documento_comercio WHERE comercio_id = ${d.comercioId}${estado ? ` AND estado = '${estado}'` : ''};`));
const avisos = (d, tipo) => Number(sql(`SELECT COUNT(*) FROM notificacion WHERE usuario_id = ${d.id} AND comercio_id = ${d.comercioId} AND tipo = '${tipo}';`));
const filasDeHistorial = (d) => Number(sql(`SELECT COUNT(*) FROM historial_estado_comercio WHERE comercio_id = ${d.comercioId};`));

const problemas = [];
const registrar5xx = (etiqueta, r) => {
  if (r.status >= 500) problemas.push(`${etiqueta}: ${r.status} ${JSON.stringify(r.json)}`);
};
const exigir = (condicion, mensaje) => {
  if (!condicion) problemas.push(mensaje);
};
const resumen = new Map();
const anotar = (clave) => resumen.set(clave, (resumen.get(clave) || 0) + 1);
const estadosDe = (respuestas) => [...respuestas.map((r) => r.status)].sort().join('+');

async function conPendientes(admin, cantidad, opciones) {
  const dueno = await nuevoDueno(admin, opciones);
  const ids = [];
  for (let i = 0; i < cantidad; i += 1) {
    const r = await subir(dueno);
    if (r.status !== 201) throw new Error('subida previa ' + JSON.stringify(r));
    ids.push(r.json.data.id);
  }
  return { dueno, ids };
}

async function escenarioCupo(admin, ronda) {
  for (const conMercadoPago of [true, false]) {
    const { dueno } = await conPendientes(admin, 4, { conMercadoPago });
    const respuestas = await Promise.all(Array.from({ length: 6 }, () => subir(dueno)));
    respuestas.forEach((r, i) => registrar5xx(`cupo #${i} (ronda ${ronda})`, r));
    const ganadoras = respuestas.filter((r) => r.status === 201).length;
    const perdedoras = respuestas.filter((r) => r.status === 409 && r.json?.data?.codigo === 'DOCUMENTO_CUPO_REVISION').length;
    exigir(ganadoras === 1 && perdedoras === 5, `cupo ronda ${ronda} (mp=${conMercadoPago}): ${estadosDe(respuestas)} (se esperaba una 201 y cinco 409 DOCUMENTO_CUPO_REVISION)`);
    exigir(contarDocs(dueno, 'PENDIENTE') === 5, `cupo ronda ${ronda}: ${contarDocs(dueno, 'PENDIENTE')} pendientes (se esperaban 5)`);
    anotar(`cupo(mp=${conMercadoPago}): ${estadosDe(respuestas)}`);
  }
}

async function escenarioEliminarContraAprobar(admin, ronda) {
  const { dueno, ids } = await conPendientes(admin, 1, { conMercadoPago: true });
  const respuestas = await Promise.all([eliminar(dueno, ids[0]), resolver(admin, ids[0], true)]);
  respuestas.forEach((r, i) => registrar5xx(`eliminar contra aprobar #${i} (ronda ${ronda})`, r));
  const existe = contarDocs(dueno) === 1;
  if (existe) {
    exigir(respuestas[0].status === 409 && respuestas[0].json?.data?.codigo === 'DOCUMENTO_NO_ELIMINABLE' && respuestas[1].status === 200,
      `eliminar contra aprobar ronda ${ronda}: ${estadosDe(respuestas)} con el documento vivo`);
    exigir(estadoComercio(dueno) === 'APTO_VENTA', `eliminar contra aprobar ronda ${ronda}: ${estadoComercio(dueno)} con el documento aprobado`);
    anotar('eliminar-contra-aprobar: gana la aprobación');
  } else {
    exigir(respuestas[0].status === 200 && respuestas[1].status === 404, `eliminar contra aprobar ronda ${ronda}: ${estadosDe(respuestas)} con el documento borrado`);
    exigir(estadoComercio(dueno) === 'APROBADO', `eliminar contra aprobar ronda ${ronda}: ${estadoComercio(dueno)} sin documentos`);
    exigir(avisos(dueno, 'DOCUMENTO_APROBADO') === 0, `eliminar contra aprobar ronda ${ronda}: aviso de aprobación de un documento que ya no existe`);
    anotar('eliminar-contra-aprobar: gana la baja');
  }
  const archivos = Number(sql(`SELECT COUNT(*) FROM documento_comercio_archivo a LEFT JOIN documento_comercio d ON d.id = a.documento_id WHERE d.id IS NULL;`));
  exigir(archivos === 0, `eliminar contra aprobar ronda ${ronda}: ${archivos} archivos huérfanos`);
}

async function escenarioMercadoPagoContraAprobar(admin, ronda) {
  const { dueno, ids } = await conPendientes(admin, 1, { conMercadoPago: true });
  const respuestas = await Promise.all([desvincular(dueno), resolver(admin, ids[0], true)]);
  respuestas.forEach((r, i) => registrar5xx(`desvincular contra aprobar #${i} (ronda ${ronda})`, r));
  exigir(respuestas.every((r) => r.status === 200), `desvincular contra aprobar ronda ${ronda}: ${estadosDe(respuestas)}`);
  exigir(!cuentaActiva(dueno), `desvincular contra aprobar ronda ${ronda}: la cuenta sigue activa`);
  exigir(estadoComercio(dueno) === 'APROBADO', `desvincular contra aprobar ronda ${ronda}: ${estadoComercio(dueno)} sin cuenta de cobro`);
  anotar('desvincular-contra-aprobar: APROBADO');

  const sinCuenta = await conPendientes(admin, 1, { conMercadoPago: false });
  const vinculando = await Promise.all([vincular(sinCuenta.dueno), resolver(admin, sinCuenta.ids[0], true)]);
  vinculando.forEach((r, i) => registrar5xx(`vincular contra aprobar #${i} (ronda ${ronda})`, r));
  exigir(vinculando.every((r) => r.status === 200), `vincular contra aprobar ronda ${ronda}: ${estadosDe(vinculando)}`);
  exigir(estadoComercio(sinCuenta.dueno) === 'APTO_VENTA', `vincular contra aprobar ronda ${ronda}: ${estadoComercio(sinCuenta.dueno)} con cuenta y documento aprobado`);
  exigir(avisos(sinCuenta.dueno, 'COMERCIO_APTO_VENTA') === 1, `vincular contra aprobar ronda ${ronda}: ${avisos(sinCuenta.dueno, 'COMERCIO_APTO_VENTA')} avisos de aptitud`);
  anotar('vincular-contra-aprobar: APTO_VENTA');
}

async function escenarioBloqueoContraAprobar(admin, ronda) {
  const { dueno, ids } = await conPendientes(admin, 1, { conMercadoPago: true });
  const bloqueo = (async () => {
    const intentos = [];
    for (let i = 0; i < 3; i += 1) intentos.push(await fallarLogin(dueno));
    return intentos;
  })();
  const [intentos, aprobacion] = await Promise.all([bloqueo, resolver(admin, ids[0], true)]);
  intentos.forEach((r, i) => registrar5xx(`bloqueo contra aprobar, intento ${i} (ronda ${ronda})`, r));
  registrar5xx(`bloqueo contra aprobar, aprobación (ronda ${ronda})`, aprobacion);
  exigir(aprobacion.status === 200, `bloqueo contra aprobar ronda ${ronda}: la aprobación dio ${aprobacion.status}`);
  exigir(estadoUsuario(dueno) === 'BLOQUEADO', `bloqueo contra aprobar ronda ${ronda}: la cuenta quedó ${estadoUsuario(dueno)}`);
  const estado = estadoComercio(dueno);
  exigir(estado === 'CERRADO_TEMPORALMENTE', `bloqueo contra aprobar ronda ${ronda}: el comercio quedó ${estado} con la cuenta bloqueada`);
  exigir(estado !== 'APTO_VENTA', `bloqueo contra aprobar ronda ${ronda}: APTO_VENTA con el Dueño bloqueado`);
  anotar(`bloqueo-contra-aprobar: ${estado}`);
}

async function escenarioRevocarContraSubir(admin, ronda) {
  const { dueno, ids } = await conPendientes(admin, 1, { conMercadoPago: true });
  const aprobada = await resolver(admin, ids[0], true);
  exigir(aprobada.status === 200 && estadoComercio(dueno) === 'APTO_VENTA', `revocar contra subir ronda ${ronda}: no quedó a la venta antes de la carrera`);
  const respuestas = await Promise.all([subir(dueno), resolver(admin, ids[0], false, 'Venció')]);
  respuestas.forEach((r, i) => registrar5xx(`revocar contra subir #${i} (ronda ${ronda})`, r));
  exigir(respuestas.every((r) => [200, 201].includes(r.status)), `revocar contra subir ronda ${ronda}: ${estadosDe(respuestas)}`);
  exigir(estadoComercio(dueno) === 'APROBADO', `revocar contra subir ronda ${ronda}: ${estadoComercio(dueno)} sin documentos aprobados`);
  exigir(avisos(dueno, 'COMERCIO_SIN_APTITUD') === 1, `revocar contra subir ronda ${ronda}: ${avisos(dueno, 'COMERCIO_SIN_APTITUD')} avisos de pérdida de aptitud`);
  exigir(contarDocs(dueno, 'PENDIENTE') === 1 && contarDocs(dueno, 'RECHAZADO') === 1, `revocar contra subir ronda ${ronda}: documentos inesperados`);
  anotar('revocar-contra-subir: APROBADO');
}

async function escenarioInvariante(admin) {
  const intrusos = Number(sql(`SELECT COUNT(*) FROM comercio c WHERE c.nombre LIKE 'Stress Documentos %' AND c.estado = 'APTO_VENTA' AND NOT EXISTS (SELECT 1 FROM cuenta_mercado_pago m WHERE m.dueno_id = c.dueno_id AND m.activa = 1);`));
  exigir(intrusos === 0, `invariante: ${intrusos} comercios APTO_VENTA sin cuenta de Mercado Pago activa`);
  const sinDocumento = Number(sql(`SELECT COUNT(*) FROM comercio c WHERE c.nombre LIKE 'Stress Documentos %' AND c.estado = 'APTO_VENTA' AND NOT EXISTS (SELECT 1 FROM documento_comercio d WHERE d.comercio_id = c.id AND d.estado = 'APROBADO');`));
  exigir(sinDocumento === 0, `invariante: ${sinDocumento} comercios APTO_VENTA sin ningún documento aprobado`);
  const bloqueados = Number(sql(`SELECT COUNT(*) FROM comercio c JOIN usuario u ON u.id = c.dueno_id WHERE c.nombre LIKE 'Stress Documentos %' AND c.estado = 'APTO_VENTA' AND u.estado = 'BLOQUEADO';`));
  exigir(bloqueados === 0, `invariante: ${bloqueados} comercios APTO_VENTA con el Dueño bloqueado`);
  const sobrepasados = Number(sql(`SELECT COUNT(*) FROM (SELECT comercio_id FROM documento_comercio WHERE estado = 'PENDIENTE' GROUP BY comercio_id HAVING COUNT(*) > 5) t;`));
  exigir(sobrepasados === 0, `invariante: ${sobrepasados} comercios con más de 5 documentos en revisión`);
  const huerfanos = Number(sql(`SELECT COUNT(*) FROM documento_comercio d LEFT JOIN documento_comercio_archivo a ON a.documento_id = d.id WHERE a.documento_id IS NULL;`));
  exigir(huerfanos === 0, `invariante: ${huerfanos} documentos sin su archivo`);
}

async function main() {
  const admin = (await call('POST', '/auth/login', null, ADMIN)).json.data.token;
  const correr = (n) => !ESCENARIO || ESCENARIO.includes(n);
  await call('PUT', '/test/documentacion-requerida?habilitado=true', null, {});
  try {
    for (let ronda = 1; ronda <= ROUNDS; ronda++) {
      if (correr(1)) await escenarioCupo(admin, ronda);
      if (correr(2)) await escenarioEliminarContraAprobar(admin, ronda);
      if (correr(3)) await escenarioMercadoPagoContraAprobar(admin, ronda);
      if (correr(4)) await escenarioBloqueoContraAprobar(admin, ronda);
      if (correr(5)) await escenarioRevocarContraSubir(admin, ronda);
      console.log(`ronda ${ronda}: ${problemas.length === 0 ? 'ok' : `${problemas.length} problema(s) hasta ahora`}`);
    }
    await escenarioInvariante(admin);
  } finally {
    await call('PUT', '/test/documentacion-requerida?habilitado=false', null, {});
  }
  console.log('Resumen de pares de respuestas:', Object.fromEntries([...resumen].sort()));
  if (problemas.length) {
    console.log('PROBLEMAS:\n' + problemas.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('SIN PROBLEMAS (sin 5xx, cupo de cinco, nunca APTO_VENTA sin cuenta ni sin documento aprobado ni con el Dueño bloqueado, sin archivos huérfanos)');
  }
}

main().catch((e) => {
  console.error('FALLO DEL SCRIPT', e);
  process.exit(1);
});
