import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '79 - ';
const NOMBRE_CARPETA = '79 - Documentos del comercio Fase 4 (subida multipart, firma de bytes, revision del Administrador, regla de apto para venta, revocacion, permisos y aislamiento)';

const v = (clave) => `dc_${clave}`;
const BASE = '/comercios/documentos';
const ADMIN = '/administrador';
const FIXTURE_PDF = 'fixtures/documento-prueba.pdf';
const FIXTURE_EJECUTABLE = 'fixtures/ejecutable-renombrado.pdf';
const FIXTURE_PNG = 'fixtures/bajonea-e2e-producto.png';

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
const codigoDe = (codigo) => prueba(`Trae el codigo ${codigo}`, `pm.expect(pm.response.json().data.codigo).to.eql('${codigo}');`);

function identidad(clave) {
  return [
    `const s = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);`,
    guardar(v(`${clave}_email`), `'dc.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('dc${clave}' + s).slice(0, 20)`),
    guardar(v(`${clave}_password`), "'Pm9x' + Math.random().toString(36).slice(2, 12)"),
    guardar(v(`${clave}_nombre`), `'Local Documentos ${clave} ' + s`),
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
];

const horariosTodosLosDias = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({
  diaSemana,
  horaApertura: '00:00:00',
  horaCierre: '23:59:00',
}));

const TOKEN_ADMIN = 'token_admin';
const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

function duenoCompleto(clave, nombreVisible) {
  const token = v(`${clave}_token`);
  const com = v(`${clave}_com`);
  return [
    item(
      `Registro Dueño ${nombreVisible}`,
      req('POST', '/auth/registro/comercio', {
        body: {
          aceptaTerminos: true,
          razonSocial: 'Documentos F4 SRL',
          cuit: `{{${v('cuit_tmp')}}}`,
          condicionIva: 'RESPONSABLE_INSCRIPTO',
          tipoSociedad: 'SRL',
          domicilioFiscal: 'Direccion fiscal F4 100',
          fechaInicioActividades: '2020-01-01',
          nombre: `{{${v(`${clave}_nombre`)}}}`,
          descripcion: 'Comercio generado por la coleccion de Postman (documentos, Fase 4)',
          telefono: '+5492964555447',
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
          telefonoRepresentante: '+5492964701106',
          fechaNacimientoRepresentante: '1988-04-04',
          fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-documentos-f4.jpg',
          redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/documentosf4' }],
        },
      }),
      [status(201)],
      [...identidad(clave), ...datosDueno],
    ),
    item(`Bypass test - codigo de verificacion ${nombreVisible}`, req('GET', '/test/token-verificacion', { query: `email={{${v(`${clave}_email`)}}}` }), [
      status(200),
      guardar(v(`${clave}_codigo`), 'pm.response.json().data'),
    ]),
    item(`Verificar cuenta ${nombreVisible}`, req('POST', '/auth/verificar', { body: { email: `{{${v(`${clave}_email`)}}}`, codigo: `{{${v(`${clave}_codigo`)}}}` } }), [status(200)]),
    item(`Login Dueño ${nombreVisible}`, req('POST', '/auth/login', { body: { nombreUsuario: `{{${v(`${clave}_usuario`)}}}`, password: `{{${v(`${clave}_password`)}}}` } }), [
      status(200),
      guardar(token, 'pm.response.json().data.token'),
      guardar(v(`${clave}_id`), 'pm.response.json().data.usuario.id'),
    ]),
    item(`Administrador busca el comercio pendiente de ${nombreVisible}`, req('GET', `${ADMIN}/comercios/pendientes`, { token: TOKEN_ADMIN }), [
      status(200),
      `const c = pm.response.json().data.find((x) => x.emailCuenta === ${entorno(v(`${clave}_email`))}.toLowerCase());`,
      "pm.test('El comercio esta pendiente', () => pm.expect(c).to.exist);",
      guardar(com, 'c.id'),
    ]),
    item(`Administrador aprueba el comercio de ${nombreVisible} (sin Mercado Pago queda APROBADO)`, req('PUT', `${ADMIN}/comercios/{{${com}}}/resolver`, { token: TOKEN_ADMIN, body: { aprobar: true } }), [status(200)]),
  ];
}

const D = (clave) => `{{${v(clave)}}}`;
const COM = D('d_com');
const COM_X = D('x_com');
const TOKEN_D = v('d_token');
const TOKEN_X = v('x_token');
const TOKEN_C = v('c_token');

const estadoDelComercio = (nombre, token, comercio, esperado) =>
  item(nombre, req('GET', '/comercios/perfil', { token, comercio }), [status(200), prueba(`El comercio esta ${esperado}`, `pm.expect(pm.response.json().data.estado).to.eql('${esperado}');`)]);

const campoTexto = (key, value) => ({ key, value, type: 'text' });
const campoArchivo = (key, src, nombre) => ({ key, src, type: 'file', ...(nombre ? { description: nombre } : {}) });

const subirItem = (nombre, token, comercio, campos, codigo, comprobaciones = []) =>
  item(nombre, req('POST', BASE, { token, comercio, formdata: campos }), [status(codigo), ...comprobaciones]);

const resolverItem = (nombre, id, body, codigo, comprobaciones = []) =>
  item(nombre, req('PUT', `${ADMIN}/documentos/${id}/resolver`, { token: TOKEN_ADMIN, body }), [status(codigo), ...comprobaciones]);

const avisosDelDueno = (nombre, fragmentos) =>
  item(nombre, req('GET', '/notificaciones', { token: TOKEN_D, comercio: COM }), [
    status(200),
    prueba('Todos los avisos exponen su tipo', "pm.expect(pm.response.json().data.every((n) => typeof n.tipo === 'string' && n.tipo.length > 0)).to.eql(true);"),
    prueba(`Tiene los avisos con ${fragmentos.join(' / ')}`, `const m = pm.response.json().data.map((n) => n.mensaje).join(' | '); ${JSON.stringify(fragmentos)}.forEach((x) => pm.expect(m, x).to.include(x));`),
  ]);

agregar(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar(TOKEN_ADMIN, 'pm.response.json().data.token'),
  ]),
  item('Atajo de test: se enciende la exigencia de documentos', req('PUT', '/test/documentacion-requerida', { body: {}, query: 'habilitado=true' }), [status(200)]),
  ...duenoCompleto('d', 'principal'),
  item('Atajo de test: Mercado Pago simulado del Dueño principal', req('POST', `/test/duenos/{{${v('d_id')}}}/mercadopago-simulada`, { body: {} }), [status(200)]),
  estadoDelComercio('Con Mercado Pago y sin documentos el comercio sigue APROBADO', TOKEN_D, COM, 'APROBADO'),
  ...duenoCompleto('x', 'ajeno'),
  item('Registro Cliente', req('POST', '/auth/registro/cliente', {
    body: {
      nombre: 'Carla',
      apellido: 'Documentos',
      dni: `{{${v('c_dni')}}}`,
      fechaNacimiento: '1995-05-20',
      telefono: '+5492964551237',
      nombreUsuario: `{{${v('c_usuario')}}}`,
      email: `{{${v('c_email')}}}`,
      password: `{{${v('c_password')}}}`,
      aceptaTerminos: true,
      direccion: { calle: 'Calle Siempre Viva', numero: '123', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: true },
    },
  }), [status(201)], [
    guardar(v('c_email'), "'dc.c.' + Date.now().toString(36) + '@bajonea.test'"),
    guardar(v('c_usuario'), "('dcc' + Date.now().toString(36)).slice(0, 20)"),
    guardar(v('c_password'), "'Pm9x' + Math.random().toString(36).slice(2, 12)"),
    guardar(v('c_dni'), 'String(30000000 + Math.floor(Math.random() * 60000000))'),
  ]),
  item('Bypass test - codigo de verificacion Cliente', req('GET', '/test/token-verificacion', { query: `email={{${v('c_email')}}}` }), [status(200), guardar(v('c_codigo'), 'pm.response.json().data')]),
  item('Verificar cuenta Cliente', req('POST', '/auth/verificar', { body: { email: `{{${v('c_email')}}}`, codigo: `{{${v('c_codigo')}}}` } }), [status(200)]),
  item('Login Cliente', req('POST', '/auth/login', { body: { nombreUsuario: `{{${v('c_usuario')}}}`, password: `{{${v('c_password')}}}` } }), [status(200), guardar(TOKEN_C, 'pm.response.json().data.token')]),
);

agregar(
  item('Sin token: 401', req('GET', BASE), [status(401)]),
  item('Un Cliente (o Empleado) en el listado: 403', req('GET', BASE, { token: TOKEN_C, comercio: COM }), [status(403)]),
  item('Un Cliente en la subida: 403', req('POST', BASE, { token: TOKEN_C, comercio: COM, formdata: [campoTexto('tipo', 'LIBRETA_SANITARIA'), campoArchivo('archivo', FIXTURE_PDF)] }), [status(403)]),
  item('El Administrador en el listado del Dueño: 403', req('GET', BASE, { token: TOKEN_ADMIN, comercio: COM }), [status(403)]),
  item('El Dueño sin X-Comercio-Id: 400', req('GET', BASE, { token: TOKEN_D }), [status(400)]),
  item('El Dueño con el comercio de otro Dueño en el header: 404 COMERCIO_NO_DISPONIBLE', req('GET', BASE, { token: TOKEN_D, comercio: COM_X }), [status(404), codigoDe('COMERCIO_NO_DISPONIBLE')]),
  item('Un Dueño en la bandeja del Administrador: 403', req('GET', `${ADMIN}/documentos/pendientes`, { token: TOKEN_D }), [status(403)]),
  item('Un Cliente en la bandeja del Administrador: 403', req('GET', `${ADMIN}/documentos/pendientes`, { token: TOKEN_C }), [status(403)]),
  item('Un Dueño resolviendo un documento: 403', req('PUT', `${ADMIN}/documentos/1/resolver`, { token: TOKEN_D, body: { aprobar: true } }), [status(403)]),

  item('El listado vacio trae cupos y limites', req('GET', BASE, { token: TOKEN_D, comercio: COM }), [
    status(200),
    prueba('Sin documentos, cupos 5 y 20, maximo 8 MB', "const d = pm.response.json().data; pm.expect(d.documentos).to.eql([]); pm.expect(d.maxEnRevision).to.eql(5); pm.expect(d.maxTotal).to.eql(20); pm.expect(d.maxBytes).to.eql(8388608);"),
  ]),
  item('Los requisitos dicen que falta un documento aprobado', req('GET', `${BASE}/requisitos`, { token: TOKEN_D, comercio: COM }), [
    status(200),
    prueba('Cuatro tipos y falta el documento', "const d = pm.response.json().data; pm.expect(d.tipos.map((t) => t.codigo)).to.eql(['LIBRETA_SANITARIA', 'CARNET_MANIPULACION_ALIMENTOS', 'HABILITACION_COMERCIAL', 'OTRO']); pm.expect(d.faltan).to.eql(['DOCUMENTO_APROBADO']); pm.expect(d.cuentaMercadoPagoVinculada).to.eql(true); pm.expect(d.aptoVenta).to.eql(false); pm.expect(d.puedeSubir).to.eql(true); pm.expect(d.formatosPermitidos).to.eql(['PDF', 'JPG', 'PNG', 'WebP']);"),
  ]),

  subirItem('Subir OTRO sin descripcion: 400', TOKEN_D, COM, [campoTexto('tipo', 'OTRO'), campoArchivo('archivo', FIXTURE_PDF)], 400, [
    prueba('Pide la descripcion', "pm.expect(pm.response.json().data.descripcionDeOtroCompleta).to.eql('Contanos qué documento es');"),
  ]),
  subirItem('Subir sin tipo: 400', TOKEN_D, COM, [campoArchivo('archivo', FIXTURE_PDF)], 400, [
    prueba('Pide el tipo', "pm.expect(pm.response.json().data.tipo).to.eql('Elegí el tipo de documento');"),
  ]),
  subirItem('Subir sin archivo: 400', TOKEN_D, COM, [campoTexto('tipo', 'LIBRETA_SANITARIA')], 400, [
    prueba('Pide el archivo', "pm.expect(pm.response.json().data.archivo).to.eql('Elegí el archivo que vas a subir');"),
  ]),
  subirItem('Un ejecutable con extension PDF se rechaza por su firma de bytes: 400', TOKEN_D, COM, [campoTexto('tipo', 'LIBRETA_SANITARIA'), campoArchivo('archivo', FIXTURE_EJECUTABLE)], 400, [
    codigoDe('DOCUMENTO_FORMATO_NO_PERMITIDO'),
    prueba('Dice que formatos se aceptan', "pm.expect(pm.response.json().mensaje).to.eql('Solo se aceptan archivos PDF, JPG, PNG o WebP');"),
  ]),
  subirItem('Subir un PDF valido: nace PENDIENTE', TOKEN_D, COM, [campoTexto('tipo', 'LIBRETA_SANITARIA'), campoTexto('descripcion', 'esto se ignora'), campoArchivo('archivo', FIXTURE_PDF)], 201, [
    guardar(v('doc1'), 'pm.response.json().data.id'),
    prueba('En revision, tipo real y sin descripcion', "const d = pm.response.json().data; pm.expect(d.estado).to.eql('PENDIENTE'); pm.expect(d.tipoMime).to.eql('application/pdf'); pm.expect(d.descripcion).to.eql(null); pm.expect(d.tipoEtiqueta).to.eql('Libreta sanitaria');"),
  ]),
  subirItem('Subir una imagen PNG con OTRO y descripcion', TOKEN_D, COM, [campoTexto('tipo', 'OTRO'), campoTexto('descripcion', 'Certificado de bomberos'), campoArchivo('archivo', FIXTURE_PNG)], 201, [
    guardar(v('doc2'), 'pm.response.json().data.id'),
    prueba('PNG y con descripcion', "const d = pm.response.json().data; pm.expect(d.tipoMime).to.eql('image/png'); pm.expect(d.descripcion).to.eql('Certificado de bomberos');"),
  ]),
  estadoDelComercio('Con documentos en revision el comercio sigue APROBADO', TOKEN_D, COM, 'APROBADO'),
  item('Los requisitos muestran el documento en revision', req('GET', `${BASE}/requisitos`, { token: TOKEN_D, comercio: COM }), [
    status(200),
    prueba('Falta el aprobado y hay revision pendiente', "const d = pm.response.json().data; pm.expect(d.faltan).to.eql(['DOCUMENTO_APROBADO', 'REVISION_PENDIENTE']); pm.expect(d.documentosPendientes).to.eql(2);"),
  ]),
  item('El archivo se entrega con las cabeceras de seguridad', req('GET', `${BASE}/{{${v('doc1')}}}/archivo`, { token: TOKEN_D, comercio: COM }), [
    status(200),
    prueba('Tipo real, nosniff, sin cache e inline', "pm.expect(pm.response.headers.get('Content-Type')).to.eql('application/pdf'); pm.expect(pm.response.headers.get('X-Content-Type-Options')).to.eql('nosniff'); pm.expect(pm.response.headers.get('Cache-Control')).to.eql('no-store'); pm.expect(pm.response.headers.get('Content-Disposition')).to.include('inline'); pm.expect(pm.response.text()).to.include('%PDF-');"),
  ]),
  item('Un documento inexistente: 404', req('GET', `${BASE}/99999999/archivo`, { token: TOKEN_D, comercio: COM }), [status(404)]),
  item('El Dueño ajeno no ve el archivo de otro comercio: 404 igual al de un inexistente', req('GET', `${BASE}/{{${v('doc1')}}}/archivo`, { token: TOKEN_X, comercio: COM_X }), [status(404)]),
  item('El Dueño ajeno no puede eliminar un documento de otro comercio: 404', req('DELETE', `${BASE}/{{${v('doc1')}}}`, { token: TOKEN_X, comercio: COM_X }), [status(404)]),

  item('El Administrador ve la bandeja con los documentos del comercio', req('GET', `${ADMIN}/documentos/pendientes`, { token: TOKEN_ADMIN }), [
    status(200),
    prueba('Estan los dos, el mas antiguo primero', `const l = pm.response.json().data.filter((d) => d.comercioId === Number(${entorno(v('d_com'))})); pm.expect(l.map((d) => d.id)).to.eql([Number(${entorno(v('doc1'))}), Number(${entorno(v('doc2'))})]); pm.expect(l[0].nombreComercio.toLowerCase()).to.eql(${entorno(v('d_nombre'))}.toLowerCase()); pm.expect(l[0].tipoEtiqueta).to.eql('Libreta sanitaria'); pm.expect(l[0].cuentaMercadoPagoVinculada).to.eql(true);`),
  ]),
  item('Las metricas del dashboard cuentan los pendientes', req('GET', `${ADMIN}/metricas`, { token: TOKEN_ADMIN }), [
    status(200),
    prueba('Al menos dos pendientes', "pm.expect(pm.response.json().data.documentosPendientes).to.be.at.least(2);"),
  ]),
  item('El Administrador abre el archivo', req('GET', `${ADMIN}/documentos/{{${v('doc1')}}}/archivo`, { token: TOKEN_ADMIN }), [status(200), prueba('Es el PDF', "pm.expect(pm.response.text()).to.include('%PDF-');")]),
  resolverItem('Rechazar sin motivo: 400', D('doc2'), { aprobar: false }, 400, [
    prueba('Pide el motivo', "pm.expect(pm.response.json().data.motivoCompletoAlRechazar).to.eql('El motivo es obligatorio al rechazar un documento');"),
  ]),
  resolverItem('Resolver sin decir si se aprueba: 400', D('doc2'), { motivo: 'x' }, 400),
  resolverItem('Resolver un documento inexistente: 404', '99999999', { aprobar: true }, 404),
  resolverItem('Aprobar el primer documento', D('doc1'), { aprobar: true }, 200, [prueba('Queda APROBADO', "pm.expect(pm.response.json().data.estado).to.eql('APROBADO');")]),
  estadoDelComercio('Con Mercado Pago y un documento aprobado pero otro en revision el comercio sigue APROBADO', TOKEN_D, COM, 'APROBADO'),
  resolverItem('Rechazar el segundo documento con motivo', D('doc2'), { aprobar: false, motivo: 'La foto esta borrosa' }, 200, [
    prueba('Queda RECHAZADO con motivo', "const d = pm.response.json().data; pm.expect(d.estado).to.eql('RECHAZADO'); pm.expect(d.motivoRechazo).to.eql('La foto esta borrosa');"),
  ]),
  estadoDelComercio('Sin pendientes, con Mercado Pago y un aprobado el comercio pasa a APTO_VENTA', TOKEN_D, COM, 'APTO_VENTA'),
  avisosDelDueno('El Dueño recibio los avisos de aprobado, rechazado y apto para venta', ['fue aprobado.', 'fue rechazado. Motivo: La foto esta borrosa', 'ya puede recibir pedidos']),
  resolverItem('Aprobar un documento rechazado: 409 DOCUMENTO_YA_RESUELTO', D('doc2'), { aprobar: true }, 409, [codigoDe('DOCUMENTO_YA_RESUELTO')]),
  resolverItem('Rechazar de nuevo un documento rechazado: 409 DOCUMENTO_YA_RESUELTO', D('doc2'), { aprobar: false, motivo: 'otra vez' }, 409, [codigoDe('DOCUMENTO_YA_RESUELTO')]),
  resolverItem('Aprobar un documento ya aprobado: 409 DOCUMENTO_YA_RESUELTO', D('doc1'), { aprobar: true }, 409, [codigoDe('DOCUMENTO_YA_RESUELTO')]),
  item('El Dueño ve el motivo del rechazo en su listado', req('GET', BASE, { token: TOKEN_D, comercio: COM }), [
    status(200),
    prueba('El rechazado trae su motivo', `const r = pm.response.json().data.documentos.find((d) => d.id === Number(${entorno(v('doc2'))})); pm.expect(r.estado).to.eql('RECHAZADO'); pm.expect(r.motivoRechazo).to.eql('La foto esta borrosa');`),
  ]),

  subirItem('Ya a la venta, subir un documento nuevo no corta las ventas', TOKEN_D, COM, [campoTexto('tipo', 'HABILITACION_COMERCIAL'), campoArchivo('archivo', FIXTURE_PDF)], 201, [guardar(v('doc3'), 'pm.response.json().data.id')]),
  estadoDelComercio('Con un documento nuevo en revision el comercio sigue APTO_VENTA', TOKEN_D, COM, 'APTO_VENTA'),
  item('El Dueño no puede eliminar un documento aprobado: 409 DOCUMENTO_NO_ELIMINABLE', req('DELETE', `${BASE}/{{${v('doc1')}}}`, { token: TOKEN_D, comercio: COM }), [status(409), codigoDe('DOCUMENTO_NO_ELIMINABLE')]),
  item('El Dueño no puede eliminar un documento rechazado: 409 DOCUMENTO_NO_ELIMINABLE', req('DELETE', `${BASE}/{{${v('doc2')}}}`, { token: TOKEN_D, comercio: COM }), [status(409), codigoDe('DOCUMENTO_NO_ELIMINABLE')]),
  item('El Dueño elimina el documento en revision', req('DELETE', `${BASE}/{{${v('doc3')}}}`, { token: TOKEN_D, comercio: COM }), [status(200), prueba('Mensaje', "pm.expect(pm.response.json().mensaje).to.eql('Documento eliminado');")]),
  item('Eliminarlo otra vez: 404', req('DELETE', `${BASE}/{{${v('doc3')}}}`, { token: TOKEN_D, comercio: COM }), [status(404)]),
  estadoDelComercio('Eliminar el pendiente no cambia la venta', TOKEN_D, COM, 'APTO_VENTA'),

  resolverItem('El Administrador revoca el unico documento aprobado (con motivo)', D('doc1'), { aprobar: false, motivo: 'Documento vencido' }, 200, [
    prueba('Queda RECHAZADO', "pm.expect(pm.response.json().data.estado).to.eql('RECHAZADO');"),
  ]),
  estadoDelComercio('Sin documentos aprobados el comercio vuelve a APROBADO', TOKEN_D, COM, 'APROBADO'),
  avisosDelDueno('El Dueño recibio el aviso de que dejo de recibir pedidos', ['Se revocó la aprobación', 'dejó de recibir pedidos: falta tener un documento aprobado']),
  item('El Administrador ve todos los documentos del comercio', req('GET', `${ADMIN}/comercios/${COM}/documentos`, { token: TOKEN_ADMIN }), [
    status(200),
    prueba('Dos rechazados y ninguno pendiente', "const l = pm.response.json().data; pm.expect(l.length).to.eql(2); pm.expect(l.every((d) => d.estado === 'RECHAZADO')).to.eql(true);"),
  ]),
  item('Documentos de un comercio inexistente: 404', req('GET', `${ADMIN}/comercios/99999999/documentos`, { token: TOKEN_ADMIN }), [status(404)]),

  subirItem('Subir un nuevo documento tras la revocacion', TOKEN_D, COM, [campoTexto('tipo', 'CARNET_MANIPULACION_ALIMENTOS'), campoArchivo('archivo', FIXTURE_PDF)], 201, [guardar(v('doc4'), 'pm.response.json().data.id')]),
  resolverItem('Aprobar el nuevo documento', D('doc4'), { aprobar: true }, 200),
  estadoDelComercio('Con Mercado Pago y un documento aprobado vuelve a APTO_VENTA', TOKEN_D, COM, 'APTO_VENTA'),
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
const claves = ['cuit_tmp', 'dni_rep_tmp',
  'd_nombre', 'd_email', 'd_usuario', 'd_password', 'd_codigo', 'd_token', 'd_id', 'd_com',
  'x_nombre', 'x_email', 'x_usuario', 'x_password', 'x_codigo', 'x_token', 'x_id', 'x_com',
  'c_email', 'c_usuario', 'c_password', 'c_dni', 'c_codigo', 'c_token',
  'doc1', 'doc2', 'doc3', 'doc4'].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
