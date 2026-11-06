import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '92 - ';
const NOMBRE_CARPETA = '92 - Inactivacion S6 entrega B (login con la lista de comercios, vista previa de reactivar para el Administrador)';

const v = (clave) => `in6b_${clave}`;
const ADMIN = '/administrador';
const TOKEN_ADMIN = 'token_admin';

function req(method, urlPath, { body, token, query } = {}) {
  const header = [];
  if (token) header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  if (body !== undefined) header.push({ key: 'Content-Type', value: 'application/json' });
  const segments = urlPath.replace(/^\//, '').split('/');
  const raw = `{{base_url}}/${segments.join('/')}${query ? `?${query}` : ''}`;
  const url = { raw, host: ['{{base_url}}'], path: segments };
  if (query) {
    url.query = query.split('&').map((par) => {
      const [key, ...resto] = par.split('=');
      return { key, value: resto.join('=') };
    });
  }
  const request = { method, header, url };
  if (body !== undefined) {
    request.body = { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } };
  }
  return request;
}

function item(name, request, testLines = [], preLines = []) {
  const event = [];
  if (preLines.length) event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: preLines } });
  if (testLines.length) event.push({ listen: 'test', script: { type: 'text/javascript', exec: testLines } });
  return { name, request, response: [], event };
}

const status = (codigo) => `pm.test('Status code es ${codigo}', () => pm.response.to.have.status(${codigo}));`;
const guardar = (variable, expr) => `pm.environment.set('${variable}', ${expr});`;
const entorno = (variable) => `pm.environment.get('${variable}')`;
const prueba = (texto, cuerpo) => `pm.test(${JSON.stringify(texto)}, () => { ${cuerpo} });`;

function identidad(clave) {
  return [
    `const s = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);`,
    guardar(v(`${clave}_email`), `'in6b.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('in6b${clave}' + s).slice(0, 20)`),
    guardar(v(`${clave}_password`), "'Pm9x' + Math.random().toString(36).slice(2, 12)"),
    guardar(v(`${clave}_dni`), 'String(30000000 + Math.floor(Math.random() * 60000000))'),
  ];
}

const datosDueno = (clave) => [
  'const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];',
  'let cuit = null;',
  'while (cuit === null) {',
  "  const base = '30' + String(Math.floor(10000000 + Math.random() * 89999999));",
  '  let suma = 0;',
  '  for (let i = 0; i < 10; i += 1) suma += Number(base[i]) * mult[i];',
  '  let dv = 11 - (suma % 11);',
  '  if (dv === 11) dv = 0;',
  '  if (dv !== 10) cuit = base + dv;',
  '}',
  guardar(v('cuit_tmp'), 'cuit'),
  guardar(v('dni_rep_tmp'), 'String(30000000 + Math.floor(Math.random() * 60000000))'),
  guardar(v(`nombre_${clave}`), "'Local Inactividad S6 ' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)"),
];

const horariosTodosLosDias = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({
  diaSemana,
  horaApertura: '00:00:00',
  horaCierre: '23:59:00',
}));

const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

const loginReq = (clave, passwordExpr) => req('POST', '/auth/login', {
  body: { nombreUsuario: `{{${v(`${clave}_usuario`)}}}`, password: passwordExpr ?? `{{${v(`${clave}_password`)}}}` },
});
const reactivarReq = (clave, passwordExpr) => req('POST', '/auth/reactivar-cuenta/con-credenciales', {
  body: { nombreUsuario: `{{${v(`${clave}_usuario`)}}}`, password: passwordExpr ?? `{{${v(`${clave}_password`)}}}` },
});
const estadoUsuario = (nombre, idVar, esperado) =>
  item(nombre, req('GET', `${ADMIN}/clientes`, { token: TOKEN_ADMIN }), [
    status(200),
    prueba(`El estado es ${esperado}`, `const f = pm.response.json().data.find((c) => String(c.id) === String(${entorno(idVar)})); pm.expect(f.estado).to.eql('${esperado}');`),
  ]);
const correrJob = (nombre) => item(nombre, req('POST', '/test/jobs/inactivacion-cuentas', { body: {} }), [
  status(200),
  prueba('Devuelve los contadores de la corrida', "const d = pm.response.json().data; pm.expect(d).to.have.property('inactivadas'); pm.expect(d).to.have.property('omitidas'); pm.expect(d).to.have.property('conFalla'); pm.expect(d.conFalla).to.eql(0);"),
]);
const envejecer = (nombre, idVar, meses, dias = 0) =>
  item(nombre, req('PUT', `/test/usuarios/{{${idVar}}}/ultimo-acceso`, { query: `meses=${meses}&dias=${dias}`, body: {} }), [status(200)]);

function clienteNuevo(clave, nombre) {
  return [
    item(
      `Registro ${nombre}`,
      req('POST', '/auth/registro/cliente', {
        body: {
          nombre,
          apellido: 'Inactividad',
          dni: `{{${v(`${clave}_dni`)}}}`,
          fechaNacimiento: '1995-05-20',
          telefono: '+5492964551240',
          nombreUsuario: `{{${v(`${clave}_usuario`)}}}`,
          email: `{{${v(`${clave}_email`)}}}`,
          password: `{{${v(`${clave}_password`)}}}`,
          aceptaTerminos: true,
          direccion: { calle: 'Calle Siempre Viva', numero: '123', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: true },
        },
      }),
      [status(201)],
      identidad(clave),
    ),
    item(`Bypass test - codigo de verificacion ${nombre}`, req('GET', '/test/token-verificacion', { query: `email={{${v(`${clave}_email`)}}}` }), [
      status(200),
      guardar(v(`${clave}_codigo`), 'pm.response.json().data'),
    ]),
    item(`Verificar cuenta ${nombre}`, req('POST', '/auth/verificar', { body: { email: `{{${v(`${clave}_email`)}}}`, codigo: `{{${v(`${clave}_codigo`)}}}` } }), [status(200)]),
    item(`Login ${nombre}`, loginReq(clave), [
      status(200),
      guardar(v(`${clave}_token`), 'pm.response.json().data.token'),
      guardar(v(`${clave}_id`), 'pm.response.json().data.usuario.id'),
    ]),
  ];
}

function duenoNuevo(clave, nombre, comVar) {
  return [
    item(
      `Registro ${nombre}`,
      req('POST', '/auth/registro/comercio', {
        body: {
          aceptaTerminos: true,
          razonSocial: 'Inactividad S6 SRL',
          cuit: `{{${v('cuit_tmp')}}}`,
          condicionIva: 'RESPONSABLE_INSCRIPTO',
          tipoSociedad: 'SRL',
          domicilioFiscal: 'Direccion fiscal S6 100',
          fechaInicioActividades: '2020-01-01',
          nombre: `{{${v(`nombre_${clave}`)}}}`,
          descripcion: 'Comercio generado por la coleccion de Postman (inactividad, S6)',
          telefono: '+5492964555448',
          tipoComercio: 'RESTAURANTE',
          aceptaDelivery: true,
          aceptaRetiro: true,
          nombreUsuario: `{{${v(`${clave}_usuario`)}}}`,
          email: `{{${v(`${clave}_email`)}}}`,
          password: `{{${v(`${clave}_password`)}}}`,
          direccion: { calle: 'Belgrano', numero: '804', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
          horarios: horariosTodosLosDias,
          nombreRepresentante: 'Carlos',
          apellidoRepresentante: 'Sanchez',
          dniRepresentante: `{{${v('dni_rep_tmp')}}}`,
          telefonoRepresentante: '+5492964701107',
          fechaNacimientoRepresentante: '1988-04-04',
          fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-inactividad-s6.jpg',
          redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/inactividads6' }],
        },
      }),
      [status(201)],
      [...identidad(clave), ...datosDueno(clave)],
    ),
    item(`Bypass test - codigo de verificacion ${nombre}`, req('GET', '/test/token-verificacion', { query: `email={{${v(`${clave}_email`)}}}` }), [
      status(200),
      guardar(v(`${clave}_codigo`), 'pm.response.json().data'),
    ]),
    item(`Verificar cuenta ${nombre}`, req('POST', '/auth/verificar', { body: { email: `{{${v(`${clave}_email`)}}}`, codigo: `{{${v(`${clave}_codigo`)}}}` } }), [status(200)]),
    item(`Login ${nombre}`, loginReq(clave), [
      status(200),
      guardar(v(`${clave}_token`), 'pm.response.json().data.token'),
      guardar(v(`${clave}_id`), 'pm.response.json().data.usuario.id'),
    ]),
    item(`Administrador busca el comercio pendiente de ${nombre}`, req('GET', `${ADMIN}/comercios/pendientes`, { token: TOKEN_ADMIN }), [
      status(200),
      `const c = pm.response.json().data.find((x) => x.emailCuenta === ${entorno(v(`${clave}_email`))}.toLowerCase());`,
      "pm.test('El comercio esta pendiente', () => pm.expect(c).to.exist);",
      guardar(comVar, 'c.id'),
    ]),
    item(`Administrador aprueba el comercio de ${nombre}`, req('PUT', `${ADMIN}/comercios/{{${comVar}}}/resolver`, { token: TOKEN_ADMIN, body: { aprobar: true } }), [status(200)]),
    item(`Atajo de test: cuenta de Mercado Pago simulada de ${nombre}`, req('POST', `/test/duenos/{{${v(`${clave}_id`)}}}/mercadopago-simulada`, { body: {} }), [status(200)]),
  ];
}

const comercioEnListado = (nombre, comVar, estado) =>
  item(nombre, req('GET', `${ADMIN}/comercios`, { token: TOKEN_ADMIN }), [
    status(200),
    prueba(`El comercio esta ${estado}`, `const c = pm.response.json().data.find((x) => String(x.id) === String(${entorno(comVar)})); pm.expect(c).to.exist; pm.expect(c.estado).to.eql('${estado}');`),
  ]);
const enCatalogo = (nombre, comVar, esta) =>
  item(nombre, req('GET', '/catalogo/comercios'), [
    status(200),
    prueba(`${esta ? 'Aparece' : 'No aparece'} en el catalogo`, `const c = pm.response.json().data.find((x) => String(x.id) === String(${entorno(comVar)})); pm.expect(Boolean(c)).to.eql(${esta});`),
  ]);

agregar(
  item('El Administrador obtiene su propio id', req('GET', `${ADMIN}/perfil`, { token: TOKEN_ADMIN }), [
    status(200),
    guardar(v('admin_id'), 'pm.response.json().data.id'),
  ]),
  ...clienteNuevo('g', 'Cliente G'),
  ...clienteNuevo('h', 'Cliente H'),
  ...duenoNuevo('f', 'Dueno F', v('com_f')),
  item('Atajo de test: un segundo comercio del Dueno F, suspendido aparte', req('POST', `/test/comercios/{{${v('com_f')}}}/clonar`, { query: 'nombre=Anexo Postman Sur S6B&estado=SUSPENDIDO', body: {} }), [
    status(201),
    guardar(v('com_f_susp'), 'pm.response.json().data'),
  ]),
  envejecer('El Dueno F queda a 4 meses sin entrar', v('f_id'), 4),
  envejecer('El Cliente G queda a 4 meses sin entrar', v('g_id'), 4),
  correrJob('Corre la inactivacion'),
  estadoUsuario('G quedo inactiva', v('g_id'), 'INACTIVO'),
  estadoUsuario('H, que entro hoy, sigue activa', v('h_id'), 'ACTIVO'),

  item('Login del Dueno F con la contrasena correcta: 409 con la lista de comercios', loginReq('f'), [
    status(409),
    prueba('Trae el codigo estable', "pm.expect(pm.response.json().data.codigo).to.eql('CUENTA_INACTIVA');"),
    prueba('Trae los dos comercios', "pm.expect(pm.response.json().data.comercios.length).to.eql(2);"),
    prueba('El comercio inactivado vuelve', `const c = pm.response.json().data.comercios.find((x) => String(x.comercioId) === String(${entorno(v('com_f'))})); pm.expect(c.resultado).to.eql('VUELVE'); pm.expect(c.nombre).to.be.a('string');`),
    prueba('El suspendido aparte sigue suspendido', `const c = pm.response.json().data.comercios.find((x) => String(x.comercioId) === String(${entorno(v('com_f_susp'))})); pm.expect(c.resultado).to.eql('SIGUE_SUSPENDIDO');`),
  ]),
  item('Login del Dueno F con una contrasena incorrecta: 401 sin lista de comercios', loginReq('f', 'Incorrecta1x'), [
    status(401),
    prueba('No revela ningun comercio ni el codigo', "const d = pm.response.json().data; pm.expect(d).to.not.have.property('comercios'); pm.expect(d).to.not.have.property('codigo');"),
  ]),
  item('Login del Cliente G con la contrasena correcta: 409 con la lista vacia', loginReq('g'), [
    status(409),
    prueba('Trae el codigo estable y ningun comercio', "const d = pm.response.json().data; pm.expect(d.codigo).to.eql('CUENTA_INACTIVA'); pm.expect(d.comercios).to.eql([]);"),
  ]),

  item('El Administrador consulta la vista previa de reactivar al Dueno F', req('GET', `${ADMIN}/cuentas/{{${v('f_id')}}}/reactivar/previa`, { token: TOKEN_ADMIN }), [
    status(200),
    prueba('Estado y rol', "const d = pm.response.json().data; pm.expect(d.estadoActual).to.eql('INACTIVO'); pm.expect(d.rol).to.eql('DUENO');"),
    prueba('Un comercio vuelve y otro sigue suspendido', `const cs = pm.response.json().data.comercios; pm.expect(cs.length).to.eql(2); pm.expect(cs.find((c) => String(c.comercioId) === String(${entorno(v('com_f'))})).resultado).to.eql('VUELVE'); pm.expect(cs.find((c) => String(c.comercioId) === String(${entorno(v('com_f_susp'))})).resultado).to.eql('SIGUE_SUSPENDIDO');`),
  ]),
  item('La vista previa del Cliente G no trae comercios', req('GET', `${ADMIN}/cuentas/{{${v('g_id')}}}/reactivar/previa`, { token: TOKEN_ADMIN }), [
    status(200),
    prueba('Lista vacia', "const d = pm.response.json().data; pm.expect(d.rol).to.eql('CLIENTE'); pm.expect(d.comercios).to.eql([]);"),
  ]),
  item('La vista previa de un Administrador: 409', req('GET', `${ADMIN}/cuentas/{{${v('admin_id')}}}/reactivar/previa`, { token: TOKEN_ADMIN }), [status(409)]),
  item('La vista previa de una cuenta inexistente: 404', req('GET', `${ADMIN}/cuentas/2000000000/reactivar/previa`, { token: TOKEN_ADMIN }), [status(404)]),
  item('Un Cliente no puede ver la vista previa: 403', req('GET', `${ADMIN}/cuentas/{{${v('f_id')}}}/reactivar/previa`, { token: v('h_token') }), [status(403)]),
  item('Sin sesion: 401', req('GET', `${ADMIN}/cuentas/{{${v('f_id')}}}/reactivar/previa`), [status(401)]),

  item('El Administrador reactiva al Dueno F', req('PUT', `${ADMIN}/cuentas/{{${v('f_id')}}}/reactivar`, { token: TOKEN_ADMIN, body: {} }), [status(200)]),
  comercioEnListado('Su comercio vuelve a estar apto para vender', v('com_f'), 'APTO_VENTA'),
  comercioEnListado('El comercio suspendido aparte sigue suspendido', v('com_f_susp'), 'SUSPENDIDO'),
);

const carpeta = { name: NOMBRE_CARPETA, item: items };
const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
const idx = collection.item.findIndex((f) => f.name.startsWith(PREFIJO_CARPETA));
if (idx >= 0) {
  collection.item.splice(idx, 1, carpeta);
} else {
  collection.item.push(carpeta);
}
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n', 'utf8');

const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const claves = [...new Set(JSON.stringify(items).match(/in6b_[a-z0-9_]+/g))];
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
