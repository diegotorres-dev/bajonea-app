import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const PREFIJO_CARPETA = '78 - ';
const NOMBRE_CARPETA = '78 - Direcciones multiples del Cliente Fase 3 (CRUD, cupo de cinco, una predeterminada, ultima direccion, localidades habilitadas, copia de la direccion en el pedido, retiro sin copia, aislamiento)';

const v = (clave) => `dr_${clave}`;
const LOCALIDAD_FUERA = '0200701001';
const BASE = '/clientes/direcciones';

function req(method, urlPath, { body, rawBody, token, comercio, query } = {}) {
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
    guardar(v(`${clave}_email`), `'dr.${clave}.' + s + '@bajonea.test'`),
    guardar(v(`${clave}_usuario`), `('dr${clave}' + s).slice(0, 20)`),
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
];

const horariosTodosLosDias = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({
  diaSemana,
  horaApertura: '00:00:00',
  horaCierre: '23:59:00',
}));

const COM = `{{${v('com')}}}`;
const TOKEN_DUENO = v('d_token');
const TOKEN_CLIENTE = v('c_token');
const TOKEN_AJENO = v('x_token');
const CAT = `{{${v('cat')}}}`;

const items = [];
const agregar = (...nuevos) => items.push(...nuevos);

const cuerpoDireccion = (calle, extra = {}, localidadId = '{{localidad_id}}') => ({
  calle,
  numero: '100',
  codigoPostal: '9420',
  localidadId,
  ...extra,
});

function clienteNuevo(clave, nombre) {
  return [
    item(
      `Registro ${nombre}`,
      req('POST', '/auth/registro/cliente', {
        body: {
          nombre,
          apellido: 'Direcciones',
          dni: `{{${v(`${clave}_dni`)}}}`,
          fechaNacimiento: '1995-05-20',
          telefono: '+5492964551237',
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
    item(`Login ${nombre}`, req('POST', '/auth/login', { body: { nombreUsuario: `{{${v(`${clave}_usuario`)}}}`, password: `{{${v(`${clave}_password`)}}}` } }), [
      status(200),
      guardar(v(`${clave}_token`), 'pm.response.json().data.token'),
      guardar(v(`${clave}_id`), 'pm.response.json().data.usuario.id'),
    ]),
  ];
}

const D = (clave) => `{{${v(clave)}}}`;
const listar = (nombre, token, comprobaciones = []) => item(nombre, req('GET', BASE, { token }), [status(200), ...comprobaciones]);
const alta = (nombre, token, body, codigo, comprobaciones = []) => item(nombre, req('POST', BASE, { token, body }), [status(codigo), ...comprobaciones]);
const editar = (nombre, token, id, body, codigo, comprobaciones = []) => item(nombre, req('PUT', `${BASE}/${id}`, { token, body }), [status(codigo), ...comprobaciones]);
const predeterminar = (nombre, token, id, codigo, comprobaciones = []) => item(nombre, req('PUT', `${BASE}/${id}/principal`, { token, body: {} }), [status(codigo), ...comprobaciones]);
const eliminar = (nombre, token, id, codigo, comprobaciones = []) => item(nombre, req('DELETE', `${BASE}/${id}`, { token }), [status(codigo), ...comprobaciones]);

const unaPredeterminada = prueba('Exactamente una predeterminada', "pm.expect(pm.response.json().data.filter((d) => d.principal).length).to.eql(1);");
const sinAlias = prueba('La copia no trae el alias ni el id de la direccion', "const d = pm.response.json().data.direccion; pm.expect(d).to.not.have.property('nombre'); pm.expect(d).to.not.have.property('id'); pm.expect(d).to.not.have.property('principal');");

function pedidoADomicilio(nombre, clave, direccionExpr, codigo, comprobaciones = []) {
  return [
    item(`[${nombre}] El Cliente vacia el carrito`, req('DELETE', '/carrito', { token: TOKEN_CLIENTE }), [`pm.test('Carrito vaciado o ya vacio', () => pm.expect([200, 404]).to.include(pm.response.code));`]),
    item(`[${nombre}] El Cliente agrega el producto al carrito`, req('POST', '/carrito/items', { token: TOKEN_CLIENTE, rawBody: `{"productoId": {{${v('prod')}}}, "cantidad": 1}` }), [status(201)]),
    item(
      `[${nombre}] El Cliente confirma el pedido`,
      req('POST', '/pedidos/cliente', { token: TOKEN_CLIENTE, rawBody: `{"tipoEntrega": "${clave.tipo}", "direccionId": ${direccionExpr}}` }),
      [status(codigo), ...(codigo === 201 ? [guardar(v(`ped_${clave.nombre}`), 'pm.response.json().data.id')] : []), ...comprobaciones],
    ),
  ];
}

agregar(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar('token_admin', 'pm.response.json().data.token'),
  ]),
  item(
    'Registro Dueño con entrega a domicilio y retiro',
    req('POST', '/auth/registro/comercio', {
      body: {
        aceptaTerminos: true,
        razonSocial: 'Direcciones F3 SRL',
        cuit: `{{${v('cuit_tmp')}}}`,
        condicionIva: 'RESPONSABLE_INSCRIPTO',
        tipoSociedad: 'SRL',
        domicilioFiscal: 'Direccion fiscal F3 100',
        fechaInicioActividades: '2020-01-01',
        nombre: `{{${v('d_nombre')}}}`,
        descripcion: 'Comercio generado por la coleccion de Postman (direcciones multiples, Fase 3)',
        telefono: '+5492964555447',
        tipoComercio: 'RESTAURANTE',
        aceptaDelivery: true,
        aceptaRetiro: true,
        nombreUsuario: `{{${v('d_usuario')}}}`,
        email: `{{${v('d_email')}}}`,
        password: `{{${v('d_password')}}}`,
        direccion: { calle: 'Belgrano', numero: '804', pisoDepto: null, codigoPostal: '9420', localidadId: '{{localidad_id}}', principal: false },
        horarios: horariosTodosLosDias,
        nombreRepresentante: 'Carlos',
        apellidoRepresentante: 'Sanchez',
        dniRepresentante: `{{${v('dni_rep_tmp')}}}`,
        telefonoRepresentante: '+5492964701106',
        fechaNacimientoRepresentante: '1988-04-04',
        fotoPerfilUrl: 'https://res.cloudinary.com/demo/image/upload/postman-direcciones-f3.jpg',
        redesSociales: [{ tipo: 'INSTAGRAM', url: 'instagram.com/direccionesf3' }],
      },
    }),
    [status(201)],
    [...identidad('d'), ...datosDueno, guardar(v('d_nombre'), "'Local Direcciones F3 ' + Date.now().toString(36)")],
  ),
  item('Bypass test - codigo de verificacion Dueño', req('GET', '/test/token-verificacion', { query: `email={{${v('d_email')}}}` }), [
    status(200),
    guardar(v('d_codigo'), 'pm.response.json().data'),
  ]),
  item('Verificar cuenta Dueño', req('POST', '/auth/verificar', { body: { email: `{{${v('d_email')}}}`, codigo: `{{${v('d_codigo')}}}` } }), [status(200)]),
  item('Login Dueño', req('POST', '/auth/login', { body: { nombreUsuario: `{{${v('d_usuario')}}}`, password: `{{${v('d_password')}}}` } }), [
    status(200),
    guardar(TOKEN_DUENO, 'pm.response.json().data.token'),
  ]),
  item('Administrador busca el comercio pendiente del Dueño', req('GET', '/administrador/comercios/pendientes', { token: 'token_admin' }), [
    status(200),
    `const c = pm.response.json().data.find((x) => x.emailCuenta === ${entorno(v('d_email'))}.toLowerCase());`,
    "pm.test('El comercio del Dueño esta pendiente', () => pm.expect(c).to.exist);",
    guardar(v('com'), 'c.id'),
  ]),
  item('Administrador aprueba el comercio', req('PUT', `/administrador/comercios/${COM}/resolver`, { token: 'token_admin', body: { aprobar: true } }), [status(200)]),
  item('Atajo de test: el comercio pasa a APTO_VENTA', req('PUT', `/test/comercios/${COM}/apto-venta`, { body: {} }), [status(200)]),
  item(
    'Administrador crea la categoria del producto',
    req('POST', '/categorias', { token: 'token_admin', rawBody: `{"nombre": "{{${v('cat_nombre')}}}"}` }),
    [status(201), guardar(v('cat'), 'pm.response.json().data.id')],
    [guardar(v('cat_nombre'), "'Cat Direcciones F3 ' + Date.now().toString(36)")],
  ),
  item('El Dueño crea el producto', req('POST', '/productos', { token: TOKEN_DUENO, comercio: COM, rawBody: `{"nombre": "Producto Direcciones F3", "descripcion": "Descripcion F3", "precio": 10000, "categoriaId": ${CAT}}` }), [
    status(201),
    guardar(v('prod'), 'pm.response.json().data.id'),
  ]),
  ...clienteNuevo('c', 'Carla'),
  ...clienteNuevo('x', 'Ximena'),
);

agregar(
  item('Sin token: 401', req('GET', BASE), [status(401)]),
  item('Un Dueño en el listado: 403', req('GET', BASE, { token: TOKEN_DUENO }), [status(403)]),
  item('Un Dueño en el alta: 403', req('POST', BASE, { token: TOKEN_DUENO, body: cuerpoDireccion('Mitre') }), [status(403)]),
  item('El Administrador en el listado: 403', req('GET', BASE, { token: 'token_admin' }), [status(403)]),

  listar('El registro dejo la unica direccion como predeterminada', TOKEN_CLIENTE, [
    prueba('Una direccion, predeterminada, sin alias ni referencia', "const l = pm.response.json().data; pm.expect(l.length).to.eql(1); pm.expect(l[0].principal).to.eql(true); pm.expect(l[0].nombre).to.eql(null); pm.expect(l[0].referencia).to.eql(null);"),
    guardar(v('dir1'), 'pm.response.json().data[0].id'),
  ]),
  alta('Alta de una segunda con alias y referencia: no queda predeterminada', TOKEN_CLIENTE, cuerpoDireccion('Mitre', { nombre: '  Casa  ', referencia: '  Porton verde  ' }, '94015020'), 201, [
    prueba('Recortada y sin predeterminada', "const d = pm.response.json().data; pm.expect(d.principal).to.eql(false); pm.expect(d.nombre).to.eql('Casa'); pm.expect(d.referencia).to.eql('Porton verde'); pm.expect(d.nombreLocalidad).to.eql('Ushuaia');"),
    guardar(v('dir2'), 'pm.response.json().data.id'),
  ]),
  alta('Alta de una tercera con principal: pasa a ser la predeterminada', TOKEN_CLIENTE, cuerpoDireccion('Belgrano', { principal: true }), 201, [
    prueba('Queda predeterminada', "pm.expect(pm.response.json().data.principal).to.eql(true);"),
    guardar(v('dir3'), 'pm.response.json().data.id'),
  ]),
  listar('La lista trae la predeterminada primero y una sola predeterminada', TOKEN_CLIENTE, [
    unaPredeterminada,
    prueba('La tercera va primero', `pm.expect(pm.response.json().data[0].id).to.eql(Number(${entorno(v('dir3'))}));`),
  ]),
  predeterminar('Marcar la segunda como predeterminada', TOKEN_CLIENTE, D('dir2'), 200, [
    unaPredeterminada,
    prueba('Devuelve la lista con la segunda primera', `pm.expect(pm.response.json().data[0].id).to.eql(Number(${entorno(v('dir2'))}));`),
  ]),
  predeterminar('Repetirlo es idempotente', TOKEN_CLIENTE, D('dir2'), 200, [unaPredeterminada]),
  editar('Editar la predeterminada con principal falso: sigue siendo la predeterminada', TOKEN_CLIENTE, D('dir2'), cuerpoDireccion('Mitre Editada', { principal: false, nombre: 'Trabajo', referencia: 'Porton verde' }, '94015020'), 200, [
    prueba('Cambio la calle y conserva la condicion', "const d = pm.response.json().data; pm.expect(d.calle).to.eql('Mitre Editada'); pm.expect(d.nombre).to.eql('Trabajo'); pm.expect(d.principal).to.eql(true);"),
  ]),
  editar('Editar otra con principal verdadero: no se vuelve predeterminada', TOKEN_CLIENTE, D('dir3'), cuerpoDireccion('Belgrano', { principal: true }), 200, [
    prueba('Sigue sin ser predeterminada', "pm.expect(pm.response.json().data.principal).to.eql(false);"),
  ]),
  item('Editar con una localidad existente no habilitada: 400 en localidadId', req('PUT', `${BASE}/${D('dir3')}`, { token: TOKEN_CLIENTE, body: cuerpoDireccion('Belgrano', {}, LOCALIDAD_FUERA) }), [
    status(400),
    prueba('Error en localidadId', "pm.expect(pm.response.json().data).to.have.property('localidadId');"),
  ]),
  alta('Alta con una localidad no habilitada: 400 en localidadId', TOKEN_CLIENTE, cuerpoDireccion('Mitre', {}, LOCALIDAD_FUERA), 400, [
    prueba('Error en localidadId', "pm.expect(pm.response.json().data).to.have.property('localidadId');"),
  ]),
  alta('Alta con una localidad inexistente: 404', TOKEN_CLIENTE, cuerpoDireccion('Mitre', {}, '00000000'), 404),
  alta('Alta con campos invalidos: 400 por campo', TOKEN_CLIENTE, { calle: '', numero: 'abc', codigoPostal: '9420', localidadId: '{{localidad_id}}', nombre: 'x'.repeat(41), referencia: 'y'.repeat(151) }, 400, [
    prueba('Un error por cada campo', "const d = pm.response.json().data; ['calle', 'numero', 'nombre', 'referencia'].forEach((c) => pm.expect(d, c).to.have.property(c));"),
  ]),
  alta('Cuarta direccion', TOKEN_CLIENTE, cuerpoDireccion('Cuarta'), 201, [guardar(v('dir4'), 'pm.response.json().data.id')]),
  alta('Quinta direccion', TOKEN_CLIENTE, cuerpoDireccion('Quinta'), 201, [guardar(v('dir5'), 'pm.response.json().data.id')]),
  alta('La sexta supera el cupo: 409 DIRECCIONES_CUPO_MAXIMO', TOKEN_CLIENTE, cuerpoDireccion('Sexta'), 409, [
    prueba('Trae el codigo', "pm.expect(pm.response.json().data.codigo).to.eql('DIRECCIONES_CUPO_MAXIMO');"),
  ]),
  listar('El cupo no agrego nada: cinco activas', TOKEN_CLIENTE, [prueba('Cinco', "pm.expect(pm.response.json().data.length).to.eql(5);"), unaPredeterminada]),
  listar('Ximena lee su lista para tomar el id de su direccion', TOKEN_AJENO, [guardar(v('dir_x'), 'pm.response.json().data[0].id')]),
);

agregar(
  ...pedidoADomicilio('copia', { tipo: 'DOMICILIO', nombre: 'copia' }, D('dir2'), 201, [
    prueba('La copia es la direccion elegida', "const d = pm.response.json().data.direccion; pm.expect(d.calle).to.eql('Mitre Editada'); pm.expect(d.nombreLocalidad).to.eql('Ushuaia'); pm.expect(d.referencia).to.eql('Porton verde');"),
    sinAlias,
  ]),
  item('Atajo de test: el pago queda aprobado', req('PUT', `/test/pedidos/${D('ped_copia')}/pago-aprobado`, { body: {}, query: 'registrarPago=true' }), [status(200)]),
  editar('Editar la direccion del pedido despues de pedir', TOKEN_CLIENTE, D('dir2'), cuerpoDireccion('Calle Nueva', { referencia: 'Cambiada' }), 200),
  eliminar('Eliminar la direccion del pedido: era la predeterminada y pasa la de mayor id', TOKEN_CLIENTE, D('dir2'), 200, [
    unaPredeterminada,
    prueba('Quedan cuatro y la predeterminada es la quinta (la mas reciente)', `const l = pm.response.json().data; pm.expect(l.length).to.eql(4); pm.expect(l.find((d) => d.principal).id).to.eql(Number(${entorno(v('dir5'))}));`),
  ]),
  item('El Cliente ve el pedido con la copia original', req('GET', '/pedidos/cliente', { token: TOKEN_CLIENTE }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v('ped_copia'))}));`,
    prueba('Copia original', "pm.expect(p.direccion.calle).to.eql('Mitre Editada'); pm.expect(p.direccion.referencia).to.eql('Porton verde'); pm.expect(p.direccion).to.not.have.property('nombre');"),
  ]),
  item('El Dueño ve el pedido con la misma copia original', req('GET', '/pedidos/comercio', { token: TOKEN_DUENO, comercio: COM }), [
    status(200),
    `const p = pm.response.json().data.find((x) => x.id === Number(${entorno(v('ped_copia'))}));`,
    prueba('Copia original', "pm.expect(p.direccion.calle).to.eql('Mitre Editada'); pm.expect(p.direccion.nombreLocalidad).to.eql('Ushuaia'); pm.expect(p.direccion.referencia).to.eql('Porton verde'); pm.expect(p.direccion).to.not.have.property('nombre');"),
  ]),
  item('El perfil devuelve la predeterminada activa', req('GET', '/clientes/perfil', { token: TOKEN_CLIENTE }), [
    status(200),
    prueba('Es la quinta', `const d = pm.response.json().data.direccion; pm.expect(d.id).to.eql(Number(${entorno(v('dir5'))})); pm.expect(d.principal).to.eql(true);`),
  ]),
  ...pedidoADomicilio('retiro', { tipo: 'RETIRO', nombre: 'retiro' }, D('dir5'), 201, [
    prueba('El retiro no tiene direccion', "pm.expect(pm.response.json().data.direccion).to.eql(null);"),
  ]),
  ...pedidoADomicilio('eliminada', { tipo: 'DOMICILIO', nombre: 'eliminada' }, D('dir2'), 404),
  ...pedidoADomicilio('ajena', { tipo: 'DOMICILIO', nombre: 'ajena' }, D('dir_x'), 404),
  ...pedidoADomicilio('sin direccion', { tipo: 'DOMICILIO', nombre: 'sindir' }, 'null', 409),
);

agregar(
  editar('Ximena no puede editar la direccion de Carla: 404', TOKEN_AJENO, D('dir5'), cuerpoDireccion('Hackeada'), 404),
  predeterminar('Ximena no puede marcar la direccion de Carla: 404', TOKEN_AJENO, D('dir5'), 404),
  eliminar('Ximena no puede eliminar la direccion de Carla: 404', TOKEN_AJENO, D('dir5'), 404),
  editar('Editar una eliminada: 404', TOKEN_CLIENTE, D('dir2'), cuerpoDireccion('Mitre'), 404),
  predeterminar('Marcar una eliminada: 404', TOKEN_CLIENTE, D('dir2'), 404),
  eliminar('Eliminar una eliminada: 404', TOKEN_CLIENTE, D('dir2'), 404),
  editar('Editar una inexistente: 404', TOKEN_CLIENTE, '999999999', cuerpoDireccion('Mitre'), 404),
  listar('La lista de Ximena sigue intacta', TOKEN_AJENO, [prueba('Una sola con la calle original', "const l = pm.response.json().data; pm.expect(l.length).to.eql(1); pm.expect(l[0].calle).to.eql('Calle Siempre Viva');")]),
  listar('Carla lee su lista para dar de baja las no predeterminadas', TOKEN_CLIENTE, [
    guardar(v('np1'), 'pm.response.json().data.filter((d) => !d.principal)[0].id'),
    guardar(v('np2'), 'pm.response.json().data.filter((d) => !d.principal)[1].id'),
    guardar(v('np3'), 'pm.response.json().data.filter((d) => !d.principal)[2].id'),
    guardar(v('pred'), 'pm.response.json().data.find((d) => d.principal).id'),
  ]),
  eliminar('Baja logica de una no predeterminada', TOKEN_CLIENTE, D('np1'), 200, [unaPredeterminada, prueba('Quedan tres', "pm.expect(pm.response.json().data.length).to.eql(3);")]),
  alta('Tras una baja el cupo se libera: se puede agregar otra', TOKEN_CLIENTE, cuerpoDireccion('Sexta'), 201, [guardar(v('dir6'), 'pm.response.json().data.id')]),
  eliminar('Baja de la recien agregada', TOKEN_CLIENTE, D('dir6'), 200),
  eliminar('Baja de otra no predeterminada', TOKEN_CLIENTE, D('np2'), 200),
  eliminar('Baja de la ultima no predeterminada', TOKEN_CLIENTE, D('np3'), 200, [prueba('Queda una sola, la predeterminada', "const l = pm.response.json().data; pm.expect(l.length).to.eql(1); pm.expect(l[0].principal).to.eql(true);")]),
  eliminar('La ultima direccion activa no se puede eliminar: 409 ULTIMA_DIRECCION', TOKEN_CLIENTE, D('pred'), 409, [
    prueba('Trae el codigo', "pm.expect(pm.response.json().data.codigo).to.eql('ULTIMA_DIRECCION');"),
  ]),
  listar('Sigue la direccion activa y predeterminada', TOKEN_CLIENTE, [prueba('Una predeterminada', "const l = pm.response.json().data; pm.expect(l.length).to.eql(1); pm.expect(l[0].principal).to.eql(true);")]),
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
const claves = ['com', 'cat', 'cat_nombre', 'prod', 'cuit_tmp', 'dni_rep_tmp',
  'd_nombre', 'd_email', 'd_usuario', 'd_password', 'd_dni', 'd_codigo', 'd_token', 'd_id',
  'c_email', 'c_usuario', 'c_password', 'c_dni', 'c_codigo', 'c_token', 'c_id',
  'x_email', 'x_usuario', 'x_password', 'x_dni', 'x_codigo', 'x_token', 'x_id',
  'dir1', 'dir2', 'dir3', 'dir4', 'dir5', 'dir6', 'dir_x', 'np1', 'np2', 'np3', 'pred',
  'ped_copia', 'ped_retiro', 'ped_eliminada', 'ped_ajena', 'ped_sindir'].map(v);
const existentes = new Set(environment.values.map((x) => x.key));
for (const key of claves) {
  if (!existentes.has(key)) environment.values.push({ key, value: '', type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_CARPETA.slice(0, 40)}..." con ${items.length} requests.`);
