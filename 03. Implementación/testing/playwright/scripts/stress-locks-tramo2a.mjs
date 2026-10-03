import { execFileSync } from 'node:child_process';

const B = process.env.E2E_API_BASE_URL || 'http://localhost:8080/api/v1';
const LOC = process.env.LOC;
const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const ROUNDS = Number(process.env.ROUNDS || 15);
const ADMIN = { nombreUsuario: 'adminbajonea', password: 'PostmanAdmin123' };
const sql = (q) => execFileSync('C:/xampp/mysql/bin/mysql.exe', ['-u', 'root', '-N', '-B', 'bajonea_test', '-e', q]).toString().trim();

if (!LOC || !CLOUD) {
  console.error('Faltan LOC (id de localidad) y/o CLOUDINARY_CLOUD_NAME');
  process.exit(1);
}

let seq = Date.now() % 100000;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`.slice(-10);

async function call(method, path, token, body) {
  const res = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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

const cuerpoAlta = (duenoId, email, nombre, numero) => ({
  nombre,
  descripcion: 'x',
  telefono: tel(),
  emailContacto: email,
  tipoComercio: 'RESTAURANTE',
  aceptaDelivery: false,
  aceptaRetiro: true,
  fotoPerfilUrl: `https://res.cloudinary.com/${CLOUD}/image/upload/v1/duenos/${duenoId}/comercios-nuevos/s.png`,
  direccion: { calle: 'Stress', numero: String(numero), pisoDepto: null, codigoPostal: '9420', localidadId: LOC, principal: false },
  horarios: [{ diaSemana: 'LUNES', horaApertura: '09:00', horaCierre: '18:00' }],
  redesSociales: [{ tipo: 'INSTAGRAM', url: `https://instagram.com/st${numero}` }],
});

async function nuevoDueno() {
  const u = uniq();
  const email = `stress.${u}@bajonea.test`;
  const nombreUsuario = `st${u}`.slice(0, 20);
  const r = await call('POST', '/auth/registro/comercio', null, {
    razonSocial: `Stress ${u} SRL`,
    cuit: cuit(),
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: 'Av. Stress 1',
    fechaInicioActividades: '2020-01-01',
    nombre: `Stress ${u}`,
    descripcion: 'x',
    telefono: tel(),
    emailContacto: email,
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: false,
    aceptaRetiro: true,
    nombreUsuario,
    email,
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
  });
  if (r.status !== 201) throw new Error('registro ' + JSON.stringify(r));
  const codigo = (await call('GET', `/test/token-verificacion?email=${email}`)).json.data;
  const v = await call('POST', '/auth/verificar', null, { email, codigo });
  if (v.status !== 200) throw new Error('verificar ' + JSON.stringify(v));
  return { email, nombreUsuario, password: 'Testing123' };
}

async function main() {
  const admin = (await call('POST', '/auth/login', null, ADMIN)).json.data.token;
  const problemas = [];
  const registrar5xx = (etiqueta, r) => {
    if (r.status >= 500) problemas.push(`${etiqueta}: ${r.status} ${JSON.stringify(r.json)}`);
  };

  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await nuevoDueno();
    const login = (await call('POST', '/auth/login', null, { nombreUsuario: d.nombreUsuario, password: d.password })).json.data;
    const duenoId = login.usuario.id;
    const pendiente = (await call('GET', '/administrador/comercios/pendientes', admin)).json.data.find((c) => c.emailCuenta === d.email);
    await call('PUT', `/administrador/comercios/${pendiente.id}/resolver`, admin, { aprobar: true });

    const altas = [];
    for (let i = 0; i < 6; i++) {
      const r = await call('POST', '/comercios', login.token, cuerpoAlta(duenoId, d.email, `Stress Alta ${ronda} ${i}`, 10 + i));
      if (r.status !== 201) throw new Error('alta ' + JSON.stringify(r));
      altas.push(r.json.data.id);
    }

    const conBloqueo = ronda % 3 === 0;
    const tareas = [];
    for (const id of altas) {
      tareas.push(call('PUT', `/administrador/comercios/${id}/resolver`, admin, { aprobar: true }).then((r) => registrar5xx(`aprobar ${id}`, r)));
    }
    tareas.push(
      call('POST', `/test/duenos/${duenoId}/mercadopago-simulada`)
        .then((r) => registrar5xx('vincular', r))
        .then(() => call('POST', `/test/duenos/${duenoId}/mercadopago-simulada`))
        .then((r) => registrar5xx('vincular 2', r))
        .then(() => (ronda % 2 === 0 ? call('DELETE', '/oauth/mercadopago/desvincular', login.token) : { status: 0 }))
        .then((r) => registrar5xx('desvincular tras vincular', r))
        .then(() => (ronda % 2 === 0 ? call('POST', `/test/duenos/${duenoId}/mercadopago-simulada`) : { status: 0 }))
        .then((r) => registrar5xx('vincular 3', r)),
    );
    if (!conBloqueo) {
      tareas.push(call('DELETE', '/oauth/mercadopago/desvincular', login.token).then((r) => registrar5xx('desvincular', r)));
      tareas.push(call('POST', '/comercios', login.token, cuerpoAlta(duenoId, d.email, `Stress Extra ${ronda}`, 99)).then((r) => registrar5xx('alta extra', r)));
    } else {
      for (let k = 0; k < 3; k++) {
        tareas.push(call('POST', '/auth/login', null, { nombreUsuario: d.nombreUsuario, password: 'Incorrecta1' }).then((r) => registrar5xx('login fallido', r)));
      }
    }
    await Promise.all(tareas);

    const cuentaActiva = sql(`SELECT activa FROM cuenta_mercado_pago WHERE dueno_id = ${duenoId};`) === '1';
    const estados = sql(`SELECT estado, COUNT(*) FROM comercio WHERE dueno_id = ${duenoId} GROUP BY estado;`).replace(/\t/g, '=').replace(/\n/g, ' ');
    const malos = Number(sql(`SELECT COUNT(*) FROM comercio WHERE dueno_id = ${duenoId} AND estado = '${cuentaActiva ? 'APROBADO' : 'APTO_VENTA'}';`));
    console.log(`ronda ${ronda}${conBloqueo ? ' (con bloqueo)' : ''}: cuenta activa=${cuentaActiva} estados: ${estados}${malos ? '  <-- INCONSISTENTE' : ''}`);
    if (malos) problemas.push(`ronda ${ronda}: ${malos} comercio(s) inconsistente(s) con la cuenta (activa=${cuentaActiva})`);
  }
  console.log(problemas.length ? 'PROBLEMAS:\n' + problemas.join('\n') : 'SIN PROBLEMAS (sin 5xx, sin inconsistencias)');
}

async function primeraVinculacion() {
  const admin = (await call('POST', '/auth/login', null, ADMIN)).json.data.token;
  const resumen = new Map();
  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await nuevoDueno();
    const login = (await call('POST', '/auth/login', null, { nombreUsuario: d.nombreUsuario, password: d.password })).json.data;
    const duenoId = login.usuario.id;
    const pendiente = (await call('GET', '/administrador/comercios/pendientes', admin)).json.data.find((c) => c.emailCuenta === d.email);
    await call('PUT', `/administrador/comercios/${pendiente.id}/resolver`, admin, { aprobar: true });
    const filasAntes = Number(sql(`SELECT COUNT(*) FROM cuenta_mercado_pago WHERE dueno_id = ${duenoId};`));

    const [a, b] = await Promise.all([
      call('POST', `/test/duenos/${duenoId}/mercadopago-simulada`),
      call('POST', `/test/duenos/${duenoId}/mercadopago-simulada`),
    ]);

    const filas = Number(sql(`SELECT COUNT(*) FROM cuenta_mercado_pago WHERE dueno_id = ${duenoId};`));
    const activa = sql(`SELECT activa FROM cuenta_mercado_pago WHERE dueno_id = ${duenoId} LIMIT 1;`);
    const estados = sql(`SELECT estado, COUNT(*) FROM comercio WHERE dueno_id = ${duenoId} GROUP BY estado;`).replace(/\t/g, '=').replace(/\n/g, ' ');
    const historial = sql(`SELECT COUNT(*) FROM historial_estado_comercio h JOIN comercio c ON c.id = h.comercio_id WHERE c.dueno_id = ${duenoId};`);
    const codigos = [a.status, b.status].sort().join('+');
    const detalle = [a, b].filter((r) => r.status >= 400).map((r) => `${r.status} ${JSON.stringify(r.json)}`).join(' | ');
    resumen.set(codigos, (resumen.get(codigos) || 0) + 1);
    console.log(`ronda ${ronda}: respuestas=${codigos} filas antes=${filasAntes} despues=${filas} activa=${activa} estados: ${estados} filas de historial=${historial}${detalle ? `  detalle: ${detalle}` : ''}`);
  }
  console.log('Resumen de pares de respuestas:', Object.fromEntries(resumen));
}

const cuerpoDesdeCorreccion = (d, descripcion) => ({
  nombre: d.nombre,
  descripcion,
  telefono: d.telefono,
  emailContacto: d.emailContacto,
  tipoComercio: d.tipoComercio,
  aceptaDelivery: d.aceptaDelivery,
  aceptaRetiro: d.aceptaRetiro,
  fotoPerfilUrl: d.fotoPerfilUrl,
  direccion: {
    calle: d.direccion.calle,
    numero: d.direccion.numero,
    pisoDepto: d.direccion.pisoDepto,
    codigoPostal: d.direccion.codigoPostal,
    localidadId: d.direccion.localidadId,
    principal: false,
  },
  horarios: d.horarios.map((h) => ({ diaSemana: h.diaSemana, horaApertura: h.horaApertura, horaCierre: h.horaCierre })),
  redesSociales: d.redesSociales.map((r) => ({ tipo: r.tipo, url: r.url })),
  tokenVersion: d.tokenVersion,
});

async function clonarConRedes(comercioId, nombre, estado) {
  const r = await call('POST', `/test/comercios/${comercioId}/clonar?nombre=${encodeURIComponent(nombre)}&estado=${estado}`);
  if (r.status !== 201) throw new Error('clonar ' + JSON.stringify(r));
  const clonId = r.json.data;
  sql(
    `INSERT INTO red_social (comercio_id, tipo, url, fecha_creacion) SELECT ${clonId}, tipo, url, NOW() FROM red_social WHERE comercio_id = ${comercioId} AND fecha_baja IS NULL;`,
  );
  return clonId;
}

async function tramo3a() {
  const admin = (await call('POST', '/auth/login', null, ADMIN)).json.data.token;
  const problemas = [];
  const registrar5xx = (etiqueta, r) => {
    if (r.status >= 500) problemas.push(`${etiqueta}: ${r.status} ${JSON.stringify(r.json)}`);
  };
  const exigir = (condicion, mensaje) => {
    if (!condicion) problemas.push(mensaje);
  };

  for (let ronda = 1; ronda <= ROUNDS; ronda++) {
    const d = await nuevoDueno();
    const login = (await call('POST', '/auth/login', null, { nombreUsuario: d.nombreUsuario, password: d.password })).json.data;
    const duenoId = login.usuario.id;
    const pendiente = (await call('GET', '/administrador/comercios/pendientes', admin)).json.data.find((c) => c.emailCuenta === d.email);
    await call('PUT', `/administrador/comercios/${pendiente.id}/resolver`, admin, { aprobar: true });

    const rechazados = [];
    for (let i = 0; i < 4; i++) rechazados.push(await clonarConRedes(pendiente.id, `Stress Rechazado ${ronda} ${i}`, 'RECHAZADO'));
    const duplaPendiente = await clonarConRedes(pendiente.id, `Stress Dupla ${ronda}`, 'PENDIENTE');
    const aAprobar = [];
    for (let i = 0; i < 2; i++) aAprobar.push(await clonarConRedes(pendiente.id, `Stress Aprobar ${ronda} ${i}`, 'PENDIENTE'));

    const cuerpos = new Map();
    for (const id of rechazados) {
      const g = await call('GET', `/comercios/${id}/correccion`, login.token);
      if (g.status !== 200) throw new Error('correccion ' + JSON.stringify(g));
      cuerpos.set(id, cuerpoDesdeCorreccion(g.json.data, `Reenvio de la ronda ${ronda} comercio ${id}`));
    }

    const conBloqueo = ronda % 3 === 0;
    const respuestasPares = new Map(rechazados.map((id) => [id, []]));
    const resolucionDoble = [];
    const tareas = [];
    for (const id of rechazados) {
      for (let k = 0; k < 2; k++) {
        tareas.push(
          call('PUT', `/comercios/${id}/resolicitud`, login.token, cuerpos.get(id)).then((r) => {
            registrar5xx(`reenvio ${id}`, r);
            respuestasPares.get(id).push(r.status);
          }),
        );
      }
    }
    tareas.push(
      call('PUT', `/administrador/comercios/${duplaPendiente}/resolver`, admin, { aprobar: true }).then((r) => {
        registrar5xx('doble aprobar', r);
        resolucionDoble.push(r.status);
      }),
    );
    tareas.push(
      call('PUT', `/administrador/comercios/${duplaPendiente}/resolver`, admin, { aprobar: false, motivo: 'Rechazo concurrente' }).then((r) => {
        registrar5xx('doble rechazar', r);
        resolucionDoble.push(r.status);
      }),
    );
    for (const id of aAprobar) {
      tareas.push(call('PUT', `/administrador/comercios/${id}/resolver`, admin, { aprobar: true }).then((r) => registrar5xx(`aprobar ${id}`, r)));
    }
    tareas.push(
      call('POST', `/test/duenos/${duenoId}/mercadopago-simulada`)
        .then((r) => registrar5xx('vincular', r))
        .then(() => (ronda % 2 === 0 ? call('DELETE', '/oauth/mercadopago/desvincular', login.token) : { status: 0 }))
        .then((r) => registrar5xx('desvincular', r)),
    );
    if (!conBloqueo) {
      tareas.push(call('POST', '/comercios', login.token, cuerpoAlta(duenoId, d.email, `Stress Alta3a ${ronda}`, 77)).then((r) => registrar5xx('alta adicional', r)));
    } else {
      for (let k = 0; k < 3; k++) {
        tareas.push(call('POST', '/auth/login', null, { nombreUsuario: d.nombreUsuario, password: 'Incorrecta1' }).then((r) => registrar5xx('login fallido', r)));
      }
    }
    await Promise.all(tareas);

    for (const [id, estados] of respuestasPares) {
      exigir([...estados].sort().join('+') === '200+409', `ronda ${ronda}: los dos reenvios de ${id} dieron ${estados.join('+')} (se esperaba 200+409)`);
      exigir(sql(`SELECT estado FROM comercio WHERE id = ${id};`) === 'PENDIENTE', `ronda ${ronda}: ${id} no quedo PENDIENTE`);
      exigir(sql(`SELECT cantidad_resolicitudes FROM comercio WHERE id = ${id};`) === '1', `ronda ${ronda}: cantidad_resolicitudes de ${id} no es 1`);
      exigir(
        sql(`SELECT COUNT(*) FROM historial_estado_comercio WHERE comercio_id = ${id} AND estado_origen = 'RECHAZADO' AND estado_destino = 'PENDIENTE';`) === '1',
        `ronda ${ronda}: ${id} no tiene exactamente una fila RECHAZADO>PENDIENTE`,
      );
    }
    exigir([...resolucionDoble].sort().join('+') === '200+409', `ronda ${ronda}: resolucion doble dio ${resolucionDoble.join('+')} (se esperaba 200+409)`);
    exigir(
      sql(`SELECT COUNT(*) FROM historial_estado_comercio WHERE comercio_id = ${duplaPendiente} AND estado_origen = 'PENDIENTE';`) === '1',
      `ronda ${ronda}: la resolucion doble dejo mas de una fila de historial`,
    );

    const segunda = [];
    const tareas2 = [];
    for (const id of rechazados) {
      tareas2.push(call('PUT', `/administrador/comercios/${id}/resolver`, admin, { aprobar: false, motivo: 'Segundo rechazo' }).then((r) => registrar5xx(`rechazo ${id}`, r)));
      tareas2.push(
        call('PUT', `/comercios/${id}/resolicitud`, login.token, { ...cuerpos.get(id), descripcion: 'Con token viejo' }).then((r) => {
          registrar5xx(`reenvio con token viejo ${id}`, r);
          segunda.push([id, r.status]);
        }),
      );
    }
    await Promise.all(tareas2);
    for (const [id, st] of segunda) {
      exigir(st !== 200, `ronda ${ronda}: el reenvio con token viejo de ${id} dio 200`);
    }
    for (const id of rechazados) {
      const cantidad = sql(`SELECT cantidad_resolicitudes FROM comercio WHERE id = ${id};`);
      const filas = sql(`SELECT COUNT(*) FROM historial_estado_comercio WHERE comercio_id = ${id} AND estado_origen = 'RECHAZADO' AND estado_destino = 'PENDIENTE';`);
      exigir(cantidad === filas, `ronda ${ronda}: ${id} cantidad_resolicitudes=${cantidad} pero tiene ${filas} filas RECHAZADO>PENDIENTE`);
    }

    const cuentaActiva = sql(`SELECT activa FROM cuenta_mercado_pago WHERE dueno_id = ${duenoId};`) === '1';
    const estados = sql(`SELECT estado, COUNT(*) FROM comercio WHERE dueno_id = ${duenoId} GROUP BY estado;`).replace(/\t/g, '=').replace(/\n/g, ' ');
    const malos = Number(sql(`SELECT COUNT(*) FROM comercio WHERE dueno_id = ${duenoId} AND estado = '${cuentaActiva ? 'APROBADO' : 'APTO_VENTA'}';`));
    console.log(`ronda ${ronda}${conBloqueo ? ' (con bloqueo)' : ''}: cuenta activa=${cuentaActiva} estados: ${estados}${malos ? '  <-- INCONSISTENTE' : ''}`);
    if (malos && !conBloqueo) problemas.push(`ronda ${ronda}: ${malos} comercio(s) inconsistente(s) con la cuenta (activa=${cuentaActiva})`);
  }
  console.log(problemas.length ? 'PROBLEMAS:\n' + problemas.join('\n') : 'SIN PROBLEMAS (sin 5xx, un solo ganador por carrera, contadores consistentes)');
}

const CASOS = { 'primera-vinculacion': primeraVinculacion, tramo3a };
(CASOS[process.env.CASO] || main)().catch((e) => {
  console.error('FALLO DEL SCRIPT', e);
  process.exit(1);
});
