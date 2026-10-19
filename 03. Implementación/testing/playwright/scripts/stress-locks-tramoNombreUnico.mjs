import { execFileSync } from 'node:child_process';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const LOC = process.env.LOC;
const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const ROUNDS = Number(process.env.ROUNDS || 8);
const ESCENARIO = process.env.ESCENARIO ? process.env.ESCENARIO.split(',').map(Number) : null;
const ADMIN = { nombreUsuario: process.env.ADMIN_USUARIO || 'adminbajonea', password: process.env.ADMIN_PASSWORD };
const MENSAJE = 'Ya existe un comercio con ese nombre. Elegí otro.';
const CORRIDA = Date.now().toString(36);
if (!ADMIN.password) {
  console.error('Falta ADMIN_PASSWORD (contraseña de admin@bajonea.ar en bajonea_test; ver testing/playwright/README.md)');
  process.exit(1);
}
if (!LOC || !CLOUD) {
  console.error('Faltan LOC (id de localidad) y/o CLOUDINARY_CLOUD_NAME');
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

function cuerpoRegistro(nombre) {
  const u = uniq();
  return {
    aceptaTerminos: true,
    cuit: cuit(),
    domicilioFiscal: 'Av. Stress 1',
    nombre,
    descripcion: 'x',
    telefono: tel(),
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: false,
    aceptaRetiro: true,
    nombreUsuario: `st${u}`.slice(0, 20),
    email: `stress.nombre.${u}@bajonea.test`,
    password: 'Testing123',
    direccion: { calle: 'Stress', numero: '1', pisoDepto: null, codigoPostal: '9420', localidadId: LOC, principal: false },
    horarios: [{ diaSemana: 'LUNES', horaApertura: '09:00', horaCierre: '18:00' }],
    nombreRepresentante: 'Rep',
    apellidoRepresentante: 'Stress',
    dniRepresentante: dni(),
    telefonoRepresentante: tel(),
    fechaNacimientoRepresentante: '1985-03-15',
    fotoPerfilUrl: `https://res.cloudinary.com/${CLOUD}/image/upload/v1/comercios/pre-registro/stress.png`,
    redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/st${u}` }],
  };
}

const registrar = (cuerpo) => call('POST', '/auth/registro/comercio', null, cuerpo);

async function nuevoDuenoAprobado(admin, nombre) {
  const cuerpo = cuerpoRegistro(nombre);
  const r = await registrar(cuerpo);
  if (r.status !== 201) throw new Error('registro ' + JSON.stringify(r));
  const codigo = (await call('GET', `/test/token-verificacion?email=${cuerpo.email}`)).json.data;
  const v = await call('POST', '/auth/verificar', null, { email: cuerpo.email, codigo });
  if (v.status !== 200) throw new Error('verificar ' + JSON.stringify(v));
  const pendiente = (await call('GET', '/administrador/comercios/pendientes', admin)).json.data.find((c) => c.emailCuenta === cuerpo.email);
  await call('PUT', `/administrador/comercios/${pendiente.id}/resolver`, admin, { aprobar: true });
  const login = (await call('POST', '/auth/login', null, { nombreUsuario: cuerpo.nombreUsuario, password: cuerpo.password })).json.data;
  return { cuerpo, token: login.token, duenoId: login.usuario.id, comercioId: pendiente.id };
}

const cuerpoAlta = (duenoId, nombre, numero) => ({
  nombre,
  descripcion: 'x',
  telefono: tel(),
  aceptaTerminos: true,
  tipoComercio: 'RESTAURANTE',
  aceptaDelivery: false,
  aceptaRetiro: true,
  fotoPerfilUrl: `https://res.cloudinary.com/${CLOUD}/image/upload/v1/duenos/${duenoId}/comercios-nuevos/s.png`,
  direccion: { calle: 'Stress', numero: String(numero), pisoDepto: null, codigoPostal: '9420', localidadId: LOC, principal: false },
  horarios: [{ diaSemana: 'LUNES', horaApertura: '09:00', horaCierre: '18:00' }],
  redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/st${numero}` }],
});

const renombrar = (dueno, nombre) =>
  call('PUT', '/comercios/perfil', dueno.token, {
    nombre,
    descripcion: 'x',
    telefono: '+5492964123456',
    aceptaDelivery: false,
    aceptaRetiro: true,
  }, { 'X-Comercio-Id': String(dueno.comercioId) });

const claveDe = (nombre) => `TRIM(REGEXP_REPLACE('${nombre.replace(/'/g, "''")}', '[[:space:]]+', ' '))`;
const comerciosConNombre = (nombre) => Number(sql(`SELECT COUNT(*) FROM comercio WHERE nombre_unico = ${claveDe(nombre)};`));

const problemas = [];
const registrar5xx = (etiqueta, r) => {
  if (r.status >= 500) problemas.push(`${etiqueta}: ${r.status} ${JSON.stringify(r.json)}`);
};
const exigir = (condicion, mensaje) => {
  if (!condicion) problemas.push(mensaje);
};
const resumen = new Map();
const anotar = (clave) => resumen.set(clave, (resumen.get(clave) || 0) + 1);

function evaluarCarrera(etiqueta, respuestas, esperadosGanadores = 1) {
  const estados = respuestas.map((r) => r.status);
  respuestas.forEach((r, i) => registrar5xx(`${etiqueta} #${i}`, r));
  const ganadores = respuestas.filter((r) => r.status === 201 || r.status === 200).length;
  const perdedores = respuestas.filter((r) => r.status === 409);
  exigir(ganadores === esperadosGanadores, `${etiqueta}: ${ganadores} ganadores (se esperaba ${esperadosGanadores}) con estados ${estados.join(',')}`);
  exigir(ganadores + perdedores.length === respuestas.length, `${etiqueta}: hubo respuestas distintas de 201/200/409: ${estados.join(',')}`);
  for (const p of perdedores) exigir(p.json && p.json.mensaje === MENSAJE, `${etiqueta}: una perdedora no trae el mensaje del nombre: ${JSON.stringify(p.json)}`);
  anotar(`${etiqueta.split(' ')[0]}: ${[...estados].sort().join('+')}`);
}

async function escenarioRegistrosSimultaneos(ronda) {
  for (const cantidad of [2, 3, 6, 12]) {
    const nombre = `Stress Nombre ${CORRIDA} ${ronda} R${cantidad} Ñandú`;
    const cuerpos = Array.from({ length: cantidad }, (_, i) => cuerpoRegistro(i % 3 === 0 ? nombre : i % 3 === 1 ? nombre.toUpperCase().replace('Ñ', 'N') : `  ${nombre.replace(' ', '   ')} `));
    const usuariosAntes = Number(sql('SELECT COUNT(*) FROM usuario;'));
    const respuestas = await Promise.all(cuerpos.map(registrar));
    evaluarCarrera(`registro-simultaneo x${cantidad} (ronda ${ronda})`, respuestas);
    exigir(comerciosConNombre(nombre) === 1, `registro x${cantidad} ronda ${ronda}: ${comerciosConNombre(nombre)} comercios con la misma clave`);
    const usuariosDespues = Number(sql('SELECT COUNT(*) FROM usuario;'));
    exigir(usuariosDespues === usuariosAntes + 1, `registro x${cantidad} ronda ${ronda}: usuarios ${usuariosAntes} -> ${usuariosDespues} (se esperaba +1, sin huerfanos)`);
    for (const [i, cuerpo] of cuerpos.entries()) {
      const existe = sql(`SELECT COUNT(*) FROM usuario WHERE email = '${cuerpo.email}';`);
      exigir(existe === (respuestas[i].status === 201 ? '1' : '0'), `registro x${cantidad} ronda ${ronda}: el cuerpo ${i} (${respuestas[i].status}) dejo ${existe} usuario(s)`);
    }
    const perdedora = respuestas.findIndex((r) => r.status === 409);
    if (perdedora >= 0) {
      const reintento = await registrar({ ...cuerpos[perdedora], nombre: `${nombre} Reintento ${perdedora}` });
      registrar5xx('reintento de la perdedora', reintento);
      exigir(reintento.status === 201, `registro x${cantidad} ronda ${ronda}: la perdedora no pudo registrarse con otro nombre (${reintento.status})`);
    }
  }
}

async function escenarioVariantesMezcladas(ronda) {
  const base = `Stress Variantes ${CORRIDA} ${ronda} Cafetería`;
  const variantes = [base, base.toUpperCase(), base.replace('í', 'i'), `${base}\t`.replace(' ', '\t'), `  ${base}  `, base.toLowerCase(), base.replace(/ /g, '  ')];
  const respuestas = await Promise.all(variantes.map((n) => registrar(cuerpoRegistro(n))));
  evaluarCarrera(`variantes-mezcladas (ronda ${ronda})`, respuestas);
  exigir(comerciosConNombre(base) === 1, `variantes ronda ${ronda}: ${comerciosConNombre(base)} comercios con la clave`);
}

async function escenarioAltasSimultaneas(admin, ronda) {
  const dueñoUno = await nuevoDuenoAprobado(admin, `Stress Alta Uno ${CORRIDA} ${ronda} ${uniq()}`);
  const dueñoDos = await nuevoDuenoAprobado(admin, `Stress Alta Dos ${CORRIDA} ${ronda} ${uniq()}`);

  const mismoDueno = `Stress Alta Mismo ${CORRIDA} ${ronda}`;
  const a = await Promise.all([
    call('POST', '/comercios', dueñoUno.token, cuerpoAlta(dueñoUno.duenoId, mismoDueno, 11)),
    call('POST', '/comercios', dueñoUno.token, cuerpoAlta(dueñoUno.duenoId, mismoDueno.toUpperCase(), 12)),
    call('POST', '/comercios', dueñoUno.token, cuerpoAlta(dueñoUno.duenoId, mismoDueno, 13)),
  ]);
  evaluarCarrera(`alta-mismo-dueno (ronda ${ronda})`, a);
  exigir(comerciosConNombre(mismoDueno) === 1, `alta del mismo Dueño ronda ${ronda}: ${comerciosConNombre(mismoDueno)} comercios`);

  const entreDuenos = `Stress Alta Cruzada ${CORRIDA} ${ronda}`;
  const b = await Promise.all([
    call('POST', '/comercios', dueñoUno.token, cuerpoAlta(dueñoUno.duenoId, entreDuenos, 21)),
    call('POST', '/comercios', dueñoDos.token, cuerpoAlta(dueñoDos.duenoId, entreDuenos.toLowerCase(), 22)),
  ]);
  evaluarCarrera(`alta-entre-duenos (ronda ${ronda})`, b);
  exigir(comerciosConNombre(entreDuenos) === 1, `alta entre Dueños ronda ${ronda}: ${comerciosConNombre(entreDuenos)} comercios`);
}

async function escenarioRenombres(admin, ronda) {
  const uno = await nuevoDuenoAprobado(admin, `Stress Renombre Uno ${CORRIDA} ${ronda} ${uniq()}`);
  const dos = await nuevoDuenoAprobado(admin, `Stress Renombre Dos ${CORRIDA} ${ronda} ${uniq()}`);
  const tres = await nuevoDuenoAprobado(admin, `Stress Renombre Tres ${CORRIDA} ${ronda} ${uniq()}`);

  const destino = `Stress Renombre Destino ${CORRIDA} ${ronda}`;
  const r1 = await Promise.all([renombrar(uno, destino), renombrar(dos, destino.toUpperCase()), renombrar(tres, destino.toLowerCase())]);
  evaluarCarrera(`renombres-simultaneos (ronda ${ronda})`, r1);
  exigir(comerciosConNombre(destino) === 1, `renombres ronda ${ronda}: ${comerciosConNombre(destino)} comercios con el destino`);

  const disputado = `Stress Renombre Contra Registro ${CORRIDA} ${ronda}`;
  const r2 = await Promise.all([renombrar(uno, disputado), registrar(cuerpoRegistro(disputado))]);
  evaluarCarrera(`renombre-contra-registro (ronda ${ronda})`, r2);
  exigir(comerciosConNombre(disputado) === 1, `renombre contra registro ronda ${ronda}: ${comerciosConNombre(disputado)} comercios`);

  const propio = sql(`SELECT nombre FROM comercio WHERE id = ${dos.comercioId};`);
  const r3 = await Promise.all([renombrar(dos, propio.toUpperCase()), renombrar(dos, propio.toLowerCase()), renombrar(dos, propio)]);
  r3.forEach((r, i) => registrar5xx(`renombre al propio nombre #${i}`, r));
  exigir(r3.every((r) => r.status === 200), `renombre al propio nombre ronda ${ronda}: ${r3.map((r) => r.status).join(',')} (se esperaba 200 en todos)`);
  anotar('renombre-al-propio: 200+200+200');
}

async function escenarioDisponibilidadEnParalelo(ronda) {
  const nombre = `Stress Disponibilidad ${CORRIDA} ${ronda} Ñandú`;
  const consultas = Array.from({ length: 20 }, () => call('GET', `/auth/comercio-nombre/disponibilidad?nombre=${encodeURIComponent(nombre)}`));
  const registros = Array.from({ length: 4 }, () => registrar(cuerpoRegistro(nombre)));
  const todas = await Promise.all([...consultas, ...registros]);
  todas.forEach((r, i) => registrar5xx(`disponibilidad/registro #${i}`, r));
  for (const consulta of todas.slice(0, consultas.length)) {
    exigir(consulta.status === 200 && typeof consulta.json?.data?.disponible === 'boolean', `disponibilidad ronda ${ronda}: respuesta inesperada ${consulta.status} ${JSON.stringify(consulta.json)}`);
  }
  evaluarCarrera(`disponibilidad-con-registros (ronda ${ronda})`, todas.slice(consultas.length));
  const despues = await call('GET', `/auth/comercio-nombre/disponibilidad?nombre=${encodeURIComponent(nombre)}`);
  exigir(despues.json?.data?.disponible === false, `disponibilidad ronda ${ronda}: tras confirmar el ganador responde ${JSON.stringify(despues.json)}`);
}

async function main() {
  const admin = (await call('POST', '/auth/login', null, ADMIN)).json.data.token;
  const correr = (n) => !ESCENARIO || ESCENARIO.includes(n);
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    if (correr(1)) await escenarioRegistrosSimultaneos(ronda);
    if (correr(2)) await escenarioVariantesMezcladas(ronda);
    if (correr(3)) await escenarioAltasSimultaneas(admin, ronda);
    if (correr(4)) await escenarioRenombres(admin, ronda);
    if (correr(5)) await escenarioDisponibilidadEnParalelo(ronda);
    console.log(`ronda ${ronda}: ${problemas.length === 0 ? 'ok' : `${problemas.length} problema(s) hasta ahora`}`);
  }
  console.log('Resumen de pares de respuestas:', Object.fromEntries([...resumen].sort()));
  if (problemas.length) {
    console.log('PROBLEMAS:\n' + problemas.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('SIN PROBLEMAS (sin 5xx, un solo ganador por carrera, sin usuarios huerfanos, una sola fila por clave de nombre)');
  }
}

main().catch((e) => {
  console.error('FALLO DEL SCRIPT', e);
  process.exit(1);
});
