import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '83 - ';
const NOMBRE_CARPETA = '83 - Suspension de comercio Fase 5 S2 cierre (el Dueño sube documentos con el comercio suspendido, ni subir ni aprobar ni rechazar ni eliminar mueven la suspension, al levantarla el comercio queda segun los documentos vigentes)';

const v = (clave) => `scd_${clave}`;
const ADMIN = '/administrador';
const TOKEN_ADMIN = 'token_admin';
const MOTIVO = 'Documentacion vencida y quejas reiteradas de clientes';
const TEXTO_SIN_PEDIDOS = 'Este comercio no está recibiendo pedidos por ahora. Probá con otro comercio.';

function req(method, urlPath, { body, rawBody, formdata, token, comercio, query } = {}) {
  const header = [];
  if (token) header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  if (comercio !== undefined) header.push({ key: 'X-Comercio-Id', value: comercio });
  if (body !== undefined || rawBody !== undefined) header.push({ key: 'Content-Type', value: 'application/json' });
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
  } else if (rawBody !== undefined) {
    request.body = { mode: 'raw', raw: rawBody, options: { raw: { language: 'json' } } };
  } else if (formdata !== undefined) {
    request.body = { mode: 'formdata', formdata };
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
    guardar(v(`${clave}_email`), `'scd.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('scd${clave}' + s).slice(0, 20)`),
    guardar(v(`${clave}_password`), "'Pm9x' + Math.random().toString(36).slice(2, 12)"),
    guardar(v(`${clave}_dni`), 'String(30000000 + Math.floor(Math.random() * 60000000))'),
  ];
}

const datosDueno = [
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
  guardar(v('nombre_d'), "'Local Suspension B2 ' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)"),
];

const horariosTodosLosDias = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({
  diaSemana,
  horaApertura: '00:00:00',
  horaCierre: '23:59:00',
}));

const COM = `{{${v('com')}}}`;
const TOKEN_DUENO = v('d_token');
const TOKEN_EMPLEADO = v('e_token');
const TOKEN_COMPRADOR = v('c_token');
const CAT = `{{${v('cat')}}}`;
const P = (clave) => `{{${v(`ped_${clave}`)}}}`;
const ADM_COM = (ruta) => `${ADMIN}/comercios/${COM}${ruta}`;

const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

function clienteNuevo(clave, nombre) {
  return [
    item(
      `Registro ${nombre}`,
      req('POST', '/auth/registro/cliente', {
        body: {
          nombre,
          apellido: 'Suspension',
          dni: `{{${v(`${clave}_dni`)}}}`,
          fechaNacimiento: '1995-05-20',
          telefono: '+5492964551239',
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
  ];
}

const loginDe = (clave, nombre, tokenVar) =>
  item(`Login ${nombre}`, req('POST', '/auth/login', { body: { nombreUsuario: `{{${v(`${clave}_usuario`)}}}`, password: `{{${v(`${clave}_password`)}}}` } }), [
    status(200),
    guardar(tokenVar, 'pm.response.json().data.token'),
    guardar(v(`${clave}_id`), 'pm.response.json().data.usuario.id'),
  ]);

function duenoNuevo() {
  return [
    item(
      'Registro Dueño Cierre',
      req('POST', '/auth/registro/comercio', {
        body: {
          aceptaTerminos: true,
          razonSocial: 'Suspension Cierre SRL',
          cuit: `{{${v('cuit_tmp')}}}`,
          condicionIva: 'RESPONSABLE_INSCRIPTO',
          tipoSociedad: 'SRL',
          domicilioFiscal: 'Direccion fiscal Cierre 100',
          fechaInicioActividades: '2020-01-01',
          nombre: `{{${v('nombre_d')}}}`,
          descripcion: 'Comercio generado por la coleccion de Postman (suspension de comercio, S2 entrega Cierre)',
          telefono: '+5492964555447',
          tipoComercio: 'RESTAURANTE',
          aceptaDelivery: true,
          aceptaRetiro: true,
          nombreUsuario: `{{${v('d_usuario')}}}`,
          email: `{{${v('d_email')}}}`,
          password: `{{${v('d_password')}}}`,
          direccion: { calle: 'Belgrano', numero: '803', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
          horarios: horariosTodosLosDias,
          nombreRepresentante: 'Carlos',
          apellidoRepresentante: 'Sanchez',
          dniRepresentante: `{{${v('dni_rep_tmp')}}}`,
          telefonoRepresentante: '+5492964701106',
          fechaNacimientoRepresentante: '1988-04-04',
          fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-suspension-b2.jpg',
          redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/suspensionb2' }],
        },
      }),
      [status(201)],
      [...identidad('d'), ...datosDueno],
    ),
    item('Bypass test - codigo de verificacion Dueño Cierre', req('GET', '/test/token-verificacion', { query: `email={{${v('d_email')}}}` }), [
      status(200),
      guardar(v('d_codigo'), 'pm.response.json().data'),
    ]),
    item('Verificar cuenta Dueño Cierre', req('POST', '/auth/verificar', { body: { email: `{{${v('d_email')}}}`, codigo: `{{${v('d_codigo')}}}` } }), [status(200)]),
    loginDe('d', 'Dueño Cierre', TOKEN_DUENO),
    item('Administrador busca el comercio pendiente de Dueño Cierre', req('GET', `${ADMIN}/comercios/pendientes`, { token: TOKEN_ADMIN }), [
      status(200),
      `const c = pm.response.json().data.find((x) => x.emailCuenta === ${entorno(v('d_email'))}.toLowerCase());`,
      "pm.test('El comercio esta pendiente', () => pm.expect(c).to.exist);",
      guardar(v('com'), 'c.id'),
    ]),
    item('Administrador aprueba el comercio', req('PUT', `${ADMIN}/comercios/{{${v('com')}}}/resolver`, { token: TOKEN_ADMIN, body: { aprobar: true } }), [status(200)]),
    item('Atajo de test: cuenta de Mercado Pago simulada', req('POST', `/test/duenos/{{${v('d_id')}}}/mercadopago-simulada`, { body: {} }), [status(200)]),
  ];
}

const campoTexto = (key, value) => ({ key, value, type: 'text' });
const campoArchivo = (key, src) => ({ key, src, type: 'file' });
const BASE_DOCS = '/comercios/documentos';
const FIXTURE_PDF = 'fixtures/documento-prueba.pdf';

const subirDocumento = (nombre, token, tipo, codigo, comprobaciones = [], comercio = COM) =>
  item(nombre, req('POST', BASE_DOCS, { token, comercio, formdata: [campoTexto('tipo', tipo), campoArchivo('archivo', FIXTURE_PDF)] }), [status(codigo), ...comprobaciones]);

const resolverDocumento = (nombre, variable, cuerpo, codigo = 200) =>
  item(nombre, req('PUT', `${ADMIN}/documentos/{{${v(variable)}}}/resolver`, { token: TOKEN_ADMIN, body: cuerpo }), [status(codigo)]);

const estadoDelComercio = (nombre, esperado) =>
  item(nombre, req('GET', '/comercios/perfil', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    prueba(`El comercio esta ${esperado}`, `pm.expect(pm.response.json().data.estado).to.eql('${esperado}');`),
  ]);

const requisitos = (nombre, comprobaciones) =>
  item(nombre, req('GET', `${BASE_DOCS}/requisitos`, { token: TOKEN_DUENO, comercio: COM }), [status(200), ...comprobaciones]);

agregar(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar(TOKEN_ADMIN, 'pm.response.json().data.token'),
  ]),
  item('Atajo de test: se enciende la exigencia de documentos', req('PUT', '/test/documentacion-requerida', { body: {}, query: 'habilitado=true' }), [status(200)]),
  ...duenoNuevo(),
  ...clienteNuevo('c', 'Carla'),
  loginDe('c', 'Carla (Cliente)', TOKEN_COMPRADOR),

  subirDocumento('El Dueño sube su primer documento', TOKEN_DUENO, 'LIBRETA_SANITARIA', 201, [guardar(v('doc1'), 'pm.response.json().data.id')]),
  resolverDocumento('El Administrador aprueba el primer documento', 'doc1', { aprobar: true }),
  estadoDelComercio('Con el documento aprobado y Mercado Pago, el comercio esta a la venta', 'APTO_VENTA'),
  item('El Administrador suspende el comercio', req('PUT', ADM_COM('/suspender'), { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [status(200)]),
  estadoDelComercio('El comercio quedo suspendido', 'SUSPENDIDO'),

  requisitos('Suspendido: los requisitos dicen que se puede subir', [
    prueba('Estado y permiso', "const d = pm.response.json().data; pm.expect(d.estadoComercio).to.eql('SUSPENDIDO'); pm.expect(d.puedeSubir).to.eql(true);"),
  ]),
  subirDocumento('Suspendido: el Dueño sube un documento nuevo', TOKEN_DUENO, 'CARNET_MANIPULACION_ALIMENTOS', 201, [
    prueba('Nace en revision', "const d = pm.response.json().data; pm.expect(d.estado).to.eql('PENDIENTE');"),
    guardar(v('doc2'), 'pm.response.json().data.id'),
  ]),
  estadoDelComercio('Subir un documento no saca al comercio de la suspension', 'SUSPENDIDO'),
  resolverDocumento('Suspendido: el Administrador aprueba el documento nuevo', 'doc2', { aprobar: true }),
  estadoDelComercio('Aprobar un documento no saca al comercio de la suspension', 'SUSPENDIDO'),
  requisitos('Suspendido: ya hay dos documentos aprobados', [
    prueba('Dos aprobados', 'pm.expect(pm.response.json().data.documentosAprobados).to.eql(2);'),
  ]),
  subirDocumento('Suspendido: el Dueño sube un tercer documento', TOKEN_DUENO, 'HABILITACION_COMERCIAL', 201, [guardar(v('doc3'), 'pm.response.json().data.id')]),
  item('Suspendido: el Dueño ve el archivo de su documento', req('GET', `${BASE_DOCS}/{{${v('doc3')}}}/archivo`, { token: TOKEN_DUENO, comercio: COM }), [status(200)]),
  resolverDocumento('Suspendido: el Administrador rechaza el tercero con motivo', 'doc3', { aprobar: false, motivo: 'La habilitacion esta vencida' }),
  estadoDelComercio('Rechazar un documento no mueve la suspension', 'SUSPENDIDO'),
  item('Suspendido: subir un documento OTRO sin descripcion se rechaza (400)', req('POST', BASE_DOCS, { token: TOKEN_DUENO, comercio: COM, formdata: [campoTexto('tipo', 'OTRO'), campoArchivo('archivo', FIXTURE_PDF)] }), [status(400)]),
  item('Suspendido: subir un documento OTRO con descripcion', req('POST', BASE_DOCS, { token: TOKEN_DUENO, comercio: COM, formdata: [campoTexto('tipo', 'OTRO'), campoTexto('descripcion', 'Certificado de bomberos'), campoArchivo('archivo', FIXTURE_PDF)] }), [
    status(201),
    guardar(v('doc4'), 'pm.response.json().data.id'),
  ]),
  item('Suspendido: el Dueño elimina el documento que sigue en revision', req('DELETE', `${BASE_DOCS}/{{${v('doc4')}}}`, { token: TOKEN_DUENO, comercio: COM }), [status(200)]),
  estadoDelComercio('Eliminar un documento no mueve la suspension', 'SUSPENDIDO'),

  subirDocumento('Permisos: un Cliente no sube documentos del comercio (403)', TOKEN_COMPRADOR, 'LIBRETA_SANITARIA', 403),
  item('Permisos: sin sesion no se sube (401)', req('POST', BASE_DOCS, { comercio: COM, formdata: [campoTexto('tipo', 'LIBRETA_SANITARIA'), campoArchivo('archivo', FIXTURE_PDF)] }), [status(401)]),

  item('El Administrador levanta la suspension', req('PUT', ADM_COM('/levantar-suspension'), { token: TOKEN_ADMIN, body: {} }), [status(200)]),
  estadoDelComercio('Al levantar, con documentos aprobados y Mercado Pago, vuelve a la venta', 'APTO_VENTA'),

  item('Se suspende de nuevo', req('PUT', ADM_COM('/suspender'), { token: TOKEN_ADMIN, body: { motivo: MOTIVO } }), [status(200)]),
  resolverDocumento('Suspendido: el Administrador revoca el primer documento aprobado', 'doc1', { aprobar: false, motivo: 'Documento revocado' }),
  resolverDocumento('Suspendido: el Administrador revoca el segundo documento aprobado', 'doc2', { aprobar: false, motivo: 'Documento revocado' }),
  estadoDelComercio('Revocar los documentos tampoco mueve la suspension', 'SUSPENDIDO'),
  item('El Administrador levanta la suspension sin documentos aprobados', req('PUT', ADM_COM('/levantar-suspension'), { token: TOKEN_ADMIN, body: {} }), [status(200)]),
  estadoDelComercio('Sin documentos aprobados el comercio vuelve a Aprobado, no a la venta', 'APROBADO'),

  item('Atajo de test: se apaga la exigencia de documentos', req('PUT', '/test/documentacion-requerida', { body: {}, query: 'habilitado=false' }), [status(200)]),
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
const claves = ['com', 'cuit_tmp', 'dni_rep_tmp', 'nombre_d',
  'd_email', 'd_usuario', 'd_password', 'd_dni', 'd_codigo', 'd_token', 'd_id',
  'c_email', 'c_usuario', 'c_password', 'c_dni', 'c_codigo', 'c_token', 'c_id',
  'doc1', 'doc2', 'doc3', 'doc4'].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
