import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(__dirname, '../../../postman/Bajonea-MVP.postman_collection.json');
const environmentPath = path.resolve(__dirname, '../../../postman/Bajonea-Local.postman_environment.json');

const NOMBRE_FOLDER = '49 - Multi-comercio Tramo 1 (X-Comercio-Id, aislamiento y bloqueo con N comercios)';
const HEADER = 'X-Comercio-Id';

function cuitValido(base10) {
  const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i += 1) suma += Number(base10[i]) * mult[i];
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) throw new Error(`CUIT base ${base10} sin digito verificador valido`);
  return `${base10}${dv}`;
}

const CUIT_M = cuitValido('3080030011');
const CUIT_N = cuitValido('3080030021');

function req(method, urlPath, { body, token, headers = {}, query } = {}) {
  const header = [];
  if (token) header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  if (body !== undefined) header.push({ key: 'Content-Type', value: 'application/json' });
  for (const [key, value] of Object.entries(headers)) header.push({ key, value });
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

function item(name, request, testLines = []) {
  return {
    name,
    request,
    response: [],
    event: testLines.length
      ? [{ listen: 'test', script: { type: 'text/javascript', exec: testLines } }]
      : [],
  };
}

const status = (codigo) => `pm.test('Status code es ${codigo}', () => pm.response.to.have.status(${codigo}));`;
const guardar = (variable, expr) => `pm.environment.set('${variable}', ${expr});`;

const horariosTodosLosDias = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map((diaSemana) => ({
  diaSemana,
  horaApertura: '00:00:00',
  horaCierre: '23:59:00',
}));

function registroDueno(sufijo, cuit, dni) {
  return {
    razonSocial: `Multi Postman ${sufijo} SRL`,
    cuit,
    condicionIva: 'RESPONSABLE_INSCRIPTO',
    tipoSociedad: 'SRL',
    domicilioFiscal: `Direccion multi ${sufijo}`,
    fechaInicioActividades: '2020-01-01',
    nombre: `Multi Postman ${sufijo}`,
    telefono: '+5492964555444',
    emailContacto: `contacto.multi${sufijo}@bajonea.test`,
    tipoComercio: 'RESTAURANTE',
    aceptaDelivery: false,
    aceptaRetiro: true,
    nombreUsuario: `{{comercio${sufijo}_usuario}}`,
    email: `{{comercio${sufijo}_email}}`,
    password: `{{comercio${sufijo}_password}}`,
    direccion: {
      calle: 'Belgrano',
      numero: '700',
      pisoDepto: null,
      codigoPostal: '9420',
      localidadId: '{{localidad_id}}',
      principal: false,
    },
    horarios: horariosTodosLosDias,
    nombreRepresentante: 'Carlos',
    apellidoRepresentante: 'Sanchez',
    dniRepresentante: dni,
    telefonoRepresentante: '+5492964701103',
    fechaNacimientoRepresentante: '1988-04-04',
    fotoPerfilUrl: `https://res.cloudinary.com/demo/image/upload/postman-multi-${sufijo.toLowerCase()}.jpg`,
    redesSociales: [{ tipo: 'INSTAGRAM', url: `instagram.com/multi${sufijo.toLowerCase()}` }],
  };
}

function perfilConHeader(nombre, tokenVar, comercioVar, testLines) {
  return item(nombre, req('GET', '/comercios/perfil', { token: tokenVar, headers: comercioVar === null ? {} : { [HEADER]: comercioVar } }), testLines);
}

function perfilEstado(nombre, comercioVar, estadoEsperado) {
  return perfilConHeader(nombre, 'token_comercio_m', comercioVar, [
    status(200),
    `pm.test('El comercio del header queda ${estadoEsperado}', () => { const j = pm.response.json(); pm.expect(j.data.id).to.eql(Number(pm.environment.get('${comercioVar.replace(/[{}]/g, '')}'))); pm.expect(j.data.estado).to.eql('${estadoEsperado}'); });`,
  ]);
}

function loginFallido(nombre) {
  return item(nombre, req('POST', '/auth/login', { body: { nombreUsuario: '{{comercioM_usuario}}', password: 'ClaveIncorrecta1' } }), [
    status(401),
    "pm.test('No es un 500 aunque el Dueño tenga 2 comercios', () => pm.expect(pm.response.code).to.be.below(500));",
  ]);
}

function cicloRecuperacion(prefijo, nuevaPasswordVar) {
  return [
    item(`${prefijo}: pedir recuperacion de contraseña`, req('POST', '/auth/recuperar-password', { body: { email: '{{comercioM_email}}' } }), [status(200)]),
    item(`${prefijo}: bypass test - codigo de recuperacion`, req('GET', '/test/token', { query: 'email={{comercioM_email}}&tipo=RECUPERACION_PASSWORD' }), [
      status(200),
      guardar('comercioM_codigo_recuperacion', 'pm.response.json().data'),
    ]),
    item(`${prefijo}: confirmar recuperacion (desbloquea la cuenta)`, req('POST', '/auth/recuperar-password/confirmar', {
      body: { email: '{{comercioM_email}}', codigo: '{{comercioM_codigo_recuperacion}}', nuevaPassword: `{{${nuevaPasswordVar}}}` },
    }), [status(200)]),
    item(`${prefijo}: login del Dueño M con la contraseña nueva`, req('POST', '/auth/login', { body: { nombreUsuario: '{{comercioM_usuario}}', password: `{{${nuevaPasswordVar}}}` } }), [
      status(200),
      guardar('token_comercio_m', 'pm.response.json().data.token'),
    ]),
  ];
}

const items = [];

items.push(
  item('Login Administrador (sesion propia de esta carpeta)', req('POST', '/auth/login', { body: { nombreUsuario: '{{admin_usuario}}', password: '{{admin_password}}' } }), [
    status(200),
    guardar('token_admin', 'pm.response.json().data.token'),
  ]),
  item('Crear categoria para los productos de esta carpeta', req('POST', '/categorias', { token: 'token_admin', body: { nombre: 'Categoria Multi {{$timestamp}}' } }), [
    status(201),
    guardar('categoria_multi_id', 'pm.response.json().data.id'),
  ]),
);

for (const sufijo of ['M', 'N']) {
  const cuit = sufijo === 'M' ? CUIT_M : CUIT_N;
  const dni = sufijo === 'M' ? '30500300' : '30500301';
  items.push(
    item(`Registro Dueño ${sufijo}`, req('POST', '/auth/registro/comercio', { body: registroDueno(sufijo, cuit, dni) }), [status(201)]),
    item(`Bypass test - token verificacion Dueño ${sufijo}`, req('GET', '/test/token-verificacion', { query: `email={{comercio${sufijo}_email}}` }), [
      status(200),
      guardar(`token_verif_comercio${sufijo}`, 'pm.response.json().data'),
    ]),
    item(`Verificar cuenta Dueño ${sufijo}`, req('GET', `/auth/verificar/{{token_verif_comercio${sufijo}}}`), [status(200)]),
    item(`Login Dueño ${sufijo}`, req('POST', '/auth/login', { body: { nombreUsuario: `{{comercio${sufijo}_usuario}}`, password: `{{comercio${sufijo}_password}}` } }), [
      status(200),
      guardar(`token_comercio_${sufijo.toLowerCase()}`, 'pm.response.json().data.token'),
      ...(sufijo === 'M' ? [guardar('m_dueno_id', 'pm.response.json().data.usuario.id')] : []),
    ]),
    item(`Administrador busca el comercio pendiente del Dueño ${sufijo}`, req('GET', '/administrador/comercios/pendientes', { token: 'token_admin' }), [
      status(200),
      `const c = pm.response.json().data.find((x) => x.emailCuenta === pm.environment.get('comercio${sufijo}_email').toLowerCase());`,
      `pm.test('El comercio del Dueño ${sufijo} esta pendiente', () => pm.expect(c).to.exist);`,
      guardar(sufijo === 'M' ? 'comercio_m_a_id' : 'comercio_n_id', 'c.id'),
    ]),
    item(`Administrador aprueba el comercio del Dueño ${sufijo}`, req('PUT', `/administrador/comercios/{{${sufijo === 'M' ? 'comercio_m_a_id' : 'comercio_n_id'}}}/resolver`, {
      token: 'token_admin',
      body: { aprobar: true },
    }), [status(200)]),
    item(`Marcar APTO_VENTA el comercio del Dueño ${sufijo} (atajo de test)`, req('PUT', `/test/comercios/{{${sufijo === 'M' ? 'comercio_m_a_id' : 'comercio_n_id'}}}/apto-venta`, { body: {} }), [status(200)]),
  );
}

items.push(
  item('Clonar el comercio del Dueño M: segundo comercio del mismo Dueño (utilidad de test)', req('POST', '/test/comercios/{{comercio_m_a_id}}/clonar', {
    body: {},
    query: 'nombre=Multi Postman M Segundo&estado=APTO_VENTA',
  }), [
    status(201),
    guardar('comercio_m_b_id', 'pm.response.json().data'),
    "pm.test('El clon es otro comercio', () => pm.expect(pm.response.json().data).to.not.eql(Number(pm.environment.get('comercio_m_a_id'))));",
  ]),
);

items.push(
  perfilConHeader('[1 comercio] Dueño N sin header: 400 aunque tenga un solo comercio', 'token_comercio_n', null, [
    status(400),
    "pm.test('El mensaje nombra al header', () => pm.expect(pm.response.json().mensaje).to.include('X-Comercio-Id'));",
  ]),
  perfilConHeader('[1 comercio] Dueño N con header propio: mismo resultado', 'token_comercio_n', '{{comercio_n_id}}', [
    status(200),
    "pm.test('Es su comercio', () => pm.expect(pm.response.json().data.id).to.eql(Number(pm.environment.get('comercio_n_id'))));",
  ]),
  item('[1 comercio] Dueño N crea producto sin header: 400', req('POST', '/productos', { token: 'token_comercio_n', body: { nombre: 'Producto N Sin Header', precio: 1500, categoriaId: '{{categoria_multi_id}}' } }), [status(400)]),
  item('[1 comercio] Dueño N crea producto con su header', req('POST', '/productos', { token: 'token_comercio_n', headers: { [HEADER]: '{{comercio_n_id}}' }, body: { nombre: 'Producto N Sin Header', precio: 1500, categoriaId: '{{categoria_multi_id}}' } }), [
    status(201),
    guardar('producto_n_id', 'pm.response.json().data.id'),
  ]),
  item('[1 comercio] Dueño N lista productos con su header', req('GET', '/productos', { token: 'token_comercio_n', headers: { [HEADER]: '{{comercio_n_id}}' } }), [
    status(200),
    "pm.test('Incluye el producto creado', () => pm.expect(pm.response.json().data.map((p) => p.id)).to.include(Number(pm.environment.get('producto_n_id'))));",
  ]),
  item('[1 comercio] Dueño N lista productos sin header: 400', req('GET', '/productos', { token: 'token_comercio_n' }), [status(400)]),
  item('[1 comercio] Dueño N lista redes sociales sin header: 400', req('GET', '/comercios/redes-sociales', { token: 'token_comercio_n' }), [status(400)]),
  item('[1 comercio] Dueño N lista pedidos sin header: 400', req('GET', '/pedidos/comercio', { token: 'token_comercio_n' }), [status(400)]),
  item('[1 comercio] Dueño N resumen de hoy sin header: 400', req('GET', '/pedidos/comercio/resumen-hoy', { token: 'token_comercio_n' }), [status(400)]),
  item('[1 comercio] Dueño N lista redes sociales con su header', req('GET', '/comercios/redes-sociales', { token: 'token_comercio_n', headers: { [HEADER]: '{{comercio_n_id}}' } }), [status(200)]),
  item('[1 comercio] Dueño N lista pedidos con su header', req('GET', '/pedidos/comercio', { token: 'token_comercio_n', headers: { [HEADER]: '{{comercio_n_id}}' } }), [status(200)]),
  item('[1 comercio] Dueño N resumen de hoy con su header', req('GET', '/pedidos/comercio/resumen-hoy', { token: 'token_comercio_n', headers: { [HEADER]: '{{comercio_n_id}}' } }), [
    status(200),
    "pm.test('Sin pedidos hoy', () => pm.expect(pm.response.json().data.cantidadPedidosHoy).to.eql(0));",
  ]),
);

items.push(
  perfilConHeader('[2 comercios] Dueño M sin header: 400, no elige ningun comercio por su cuenta', 'token_comercio_m', null, [
    status(400),
    "pm.test('El mensaje nombra al header', () => pm.expect(pm.response.json().mensaje).to.include('X-Comercio-Id'));",
  ]),
  perfilConHeader('[2 comercios] Dueño M con header vacio: 400', 'token_comercio_m', '', [
    status(400),
    "pm.test('El mensaje nombra al header', () => pm.expect(pm.response.json().mensaje).to.include('X-Comercio-Id'));",
  ]),
  perfilConHeader('[2 comercios] Dueño M con header A', 'token_comercio_m', '{{comercio_m_a_id}}', [
    status(200),
    "pm.test('Es el comercio A', () => pm.expect(pm.response.json().data.id).to.eql(Number(pm.environment.get('comercio_m_a_id'))));",
    guardar('nombre_comercio_m_a', 'pm.response.json().data.nombre'),
  ]),
  perfilConHeader('[2 comercios] Dueño M con header B', 'token_comercio_m', '{{comercio_m_b_id}}', [
    status(200),
    "pm.test('Es el comercio B, con su propio nombre', () => { const d = pm.response.json().data; pm.expect(d.id).to.eql(Number(pm.environment.get('comercio_m_b_id'))); pm.expect(d.nombre).to.not.eql(pm.environment.get('nombre_comercio_m_a')); });",
  ]),
  perfilConHeader('[negativo] Header con un comercio de OTRO Dueño', 'token_comercio_m', '{{comercio_n_id}}', [
    status(404),
    guardar('body_404_multi', 'JSON.stringify(pm.response.json())'),
  ]),
  perfilConHeader('[negativo] Header con un id inexistente: mismo 404, mismo cuerpo', 'token_comercio_m', '99999999', [
    status(404),
    "pm.test('Cuerpo identico al del comercio ajeno', () => pm.expect(JSON.stringify(pm.response.json())).to.eql(pm.environment.get('body_404_multi')));",
  ]),
  perfilConHeader('[negativo] Header no numerico', 'token_comercio_m', 'abc', [
    status(400),
    "pm.test('El mensaje nombra al header', () => pm.expect(pm.response.json().mensaje).to.include('X-Comercio-Id'));",
  ]),
  perfilConHeader('[negativo] Header decimal', 'token_comercio_m', '12.5', [status(400)]),
  item('[negativo] Productos con header de OTRO Dueño', req('GET', '/productos', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_n_id}}' } }), [status(404)]),
  item('[negativo] Redes sociales con header de OTRO Dueño', req('GET', '/comercios/redes-sociales', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_n_id}}' } }), [status(404)]),
  item('[negativo] Pedidos con header de OTRO Dueño', req('GET', '/pedidos/comercio', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_n_id}}' } }), [status(404)]),
  item('[negativo] Resumen de hoy con header de OTRO Dueño', req('GET', '/pedidos/comercio/resumen-hoy', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_n_id}}' } }), [status(404)]),
);

items.push(
  item('[aislamiento] Crear producto en A', req('POST', '/productos', {
    token: 'token_comercio_m',
    headers: { [HEADER]: '{{comercio_m_a_id}}' },
    body: { nombre: 'Producto M en A', precio: 2500, categoriaId: '{{categoria_multi_id}}' },
  }), [status(201), guardar('producto_m_a_id', 'pm.response.json().data.id')]),
  item('[aislamiento] Crear producto en B', req('POST', '/productos', {
    token: 'token_comercio_m',
    headers: { [HEADER]: '{{comercio_m_b_id}}' },
    body: { nombre: 'Producto M en B', precio: 3500, categoriaId: '{{categoria_multi_id}}' },
  }), [status(201), guardar('producto_m_b_id', 'pm.response.json().data.id')]),
  item('[aislamiento] Listar productos con header A: solo el de A', req('GET', '/productos', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_m_a_id}}' } }), [
    status(200),
    "const ids = pm.response.json().data.map((p) => p.id);",
    "pm.test('Tiene el de A y no el de B', () => { pm.expect(ids).to.include(Number(pm.environment.get('producto_m_a_id'))); pm.expect(ids).to.not.include(Number(pm.environment.get('producto_m_b_id'))); });",
  ]),
  item('[aislamiento] Listar productos con header B: solo el de B', req('GET', '/productos', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_m_b_id}}' } }), [
    status(200),
    "const ids = pm.response.json().data.map((p) => p.id);",
    "pm.test('Tiene el de B y no el de A', () => { pm.expect(ids).to.include(Number(pm.environment.get('producto_m_b_id'))); pm.expect(ids).to.not.include(Number(pm.environment.get('producto_m_a_id'))); });",
  ]),
  item('[aislamiento] Editar el producto de A con header B', req('PUT', '/productos/{{producto_m_a_id}}', {
    token: 'token_comercio_m',
    headers: { [HEADER]: '{{comercio_m_b_id}}' },
    body: { nombre: 'Intento Cruzado', precio: 100, categoriaId: '{{categoria_multi_id}}' },
  }), [status(404)]),
  item('[aislamiento] Cambiar estado del producto de A con header B', req('PATCH', '/productos/{{producto_m_a_id}}/estado', {
    token: 'token_comercio_m',
    headers: { [HEADER]: '{{comercio_m_b_id}}' },
    body: { estado: 'AGOTADO' },
  }), [status(404)]),
  item('[aislamiento] Firma de Cloudinary del producto de A con header B', req('POST', '/productos/{{producto_m_a_id}}/cloudinary/firma', {
    token: 'token_comercio_m',
    headers: { [HEADER]: '{{comercio_m_b_id}}' },
  }), [status(404)]),
  item('[aislamiento] Borrar imagen del producto de A con header B', req('DELETE', '/productos/{{producto_m_a_id}}/imagenes/1', {
    token: 'token_comercio_m',
    headers: { [HEADER]: '{{comercio_m_b_id}}' },
  }), [status(404)]),
  item('[aislamiento] Cambiar estado del producto de A con header A', req('PATCH', '/productos/{{producto_m_a_id}}/estado', {
    token: 'token_comercio_m',
    headers: { [HEADER]: '{{comercio_m_a_id}}' },
    body: { estado: 'AGOTADO' },
  }), [
    status(200),
    "pm.test('Queda agotado', () => pm.expect(pm.response.json().data.estado).to.eql('AGOTADO'));",
  ]),
  item('[aislamiento] Listar redes sociales con header A', req('GET', '/comercios/redes-sociales', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_m_a_id}}' } }), [
    status(200),
    "pm.test('A tiene su red social del registro', () => pm.expect(pm.response.json().data.length).to.be.above(0));",
    guardar('red_social_m_a_id', 'pm.response.json().data[0].id'),
  ]),
  item('[aislamiento] Listar redes sociales con header B: no ve las de A', req('GET', '/comercios/redes-sociales', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_m_b_id}}' } }), [
    status(200),
    "pm.test('No incluye la red social de A', () => pm.expect(pm.response.json().data.map((r) => r.id)).to.not.include(Number(pm.environment.get('red_social_m_a_id'))));",
  ]),
  item('[aislamiento] Editar la red social de A con header B', req('PUT', '/comercios/redes-sociales/{{red_social_m_a_id}}', {
    token: 'token_comercio_m',
    headers: { [HEADER]: '{{comercio_m_b_id}}' },
    body: { tipo: 'INSTAGRAM', url: 'instagram.com/intento.cruzado' },
  }), [status(404)]),
  item('[aislamiento] Dar de baja la red social de A con header B', req('DELETE', '/comercios/redes-sociales/{{red_social_m_a_id}}', {
    token: 'token_comercio_m',
    headers: { [HEADER]: '{{comercio_m_b_id}}' },
  }), [status(404)]),
  item('[aislamiento] Agregar una red social a B', req('POST', '/comercios/redes-sociales', {
    token: 'token_comercio_m',
    headers: { [HEADER]: '{{comercio_m_b_id}}' },
    body: { tipo: 'FACEBOOK', url: 'facebook.com/multi.b' },
  }), [status(201)]),
  item('[aislamiento] A sigue sin esa red social', req('GET', '/comercios/redes-sociales', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_m_a_id}}' } }), [
    status(200),
    "pm.test('A no tiene Facebook', () => pm.expect(pm.response.json().data.map((r) => r.tipo)).to.not.include('FACEBOOK'));",
  ]),
  item('[aislamiento] Editar el perfil de B', req('PUT', '/comercios/perfil', {
    token: 'token_comercio_m',
    headers: { [HEADER]: '{{comercio_m_b_id}}' },
    body: { nombre: 'Multi Postman B Editado', descripcion: 'Solo cambia B', telefono: '+5492964654321', emailContacto: 'b.editado@bajonea.test', aceptaDelivery: false, aceptaRetiro: true },
  }), [
    status(200),
    "pm.test('Cambio B', () => { const d = pm.response.json().data; pm.expect(d.id).to.eql(Number(pm.environment.get('comercio_m_b_id'))); pm.expect(d.nombre).to.eql('Multi Postman B Editado'); });",
  ]),
  perfilConHeader('[aislamiento] El perfil de A no cambio', 'token_comercio_m', '{{comercio_m_a_id}}', [
    status(200),
    "pm.test('A conserva su nombre', () => { const d = pm.response.json().data; pm.expect(d.nombre).to.eql(pm.environment.get('nombre_comercio_m_a')); pm.expect(d.descripcion).to.not.eql('Solo cambia B'); });",
  ]),
);

items.push(
  item('[pedidos] Cliente inicia sesion', req('POST', '/auth/login', { body: { nombreUsuario: '{{cliente_usuario}}', password: '{{cliente_password}}' } }), [
    status(200),
    guardar('token_cliente', 'pm.response.json().data.token'),
  ]),
  item('[pedidos] Vaciar carrito del Cliente', req('DELETE', '/carrito', { token: 'token_cliente' }), []),
  item('[pedidos] Cliente agrega el producto de B al carrito', req('POST', '/carrito/items', { token: 'token_cliente', body: { productoId: '{{producto_m_b_id}}', cantidad: 1 } }), [status(201)]),
  item('[pedidos] Cliente confirma pedido a B (retiro)', req('POST', '/pedidos/cliente', { token: 'token_cliente', body: { tipoEntrega: 'RETIRO', direccionId: null } }), [
    status(201),
    guardar('pedido_m_b_id', 'pm.response.json().data.id'),
  ]),
  item('[pedidos] Confirmar pago del pedido (atajo de test)', req('PUT', '/test/pedidos/{{pedido_m_b_id}}/pago-aprobado', { body: {} }), [status(200)]),
  item('[pedidos] Header B: el pedido esta en la lista', req('GET', '/pedidos/comercio', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_m_b_id}}' } }), [
    status(200),
    "pm.test('Incluye el pedido', () => pm.expect(pm.response.json().data.map((p) => p.id)).to.include(Number(pm.environment.get('pedido_m_b_id'))));",
  ]),
  item('[pedidos] Header A: el pedido de B no aparece', req('GET', '/pedidos/comercio', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_m_a_id}}' } }), [
    status(200),
    "pm.test('No incluye el pedido de B', () => pm.expect(pm.response.json().data.map((p) => p.id)).to.not.include(Number(pm.environment.get('pedido_m_b_id'))));",
  ]),
  item('[pedidos] Resumen de hoy con header B: 1 pedido', req('GET', '/pedidos/comercio/resumen-hoy', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_m_b_id}}' } }), [
    status(200),
    "pm.test('Un pedido hoy', () => pm.expect(pm.response.json().data.cantidadPedidosHoy).to.eql(1));",
  ]),
  item('[pedidos] Resumen de hoy con header A: 0 pedidos', req('GET', '/pedidos/comercio/resumen-hoy', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_m_a_id}}' } }), [
    status(200),
    "pm.test('Ningun pedido hoy', () => pm.expect(pm.response.json().data.cantidadPedidosHoy).to.eql(0));",
  ]),
  item('[pedidos] Consultar el pago del pedido de B con header A', req('GET', '/pedidos/comercio/{{pedido_m_b_id}}/pago', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_m_a_id}}' } }), [status(404)]),
  item('[pedidos] Aceptar el pedido de B con header A', req('PUT', '/pedidos/comercio/{{pedido_m_b_id}}/aceptar', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_m_a_id}}' } }), [status(404)]),
  item('[pedidos] Despachar el pedido de B con header A', req('PUT', '/pedidos/comercio/{{pedido_m_b_id}}/despachar', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_m_a_id}}' } }), [status(404)]),
  item('[pedidos] Entregar el pedido de B con header A', req('PUT', '/pedidos/comercio/{{pedido_m_b_id}}/entregar', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_m_a_id}}' } }), [status(404)]),
  item('[pedidos] Rechazar el pedido de B con header A', req('PUT', '/pedidos/comercio/{{pedido_m_b_id}}/rechazar', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_m_a_id}}' }, body: { motivo: 'SIN_STOCK' } }), [status(404)]),
  item('[pedidos] Anular el pedido de B con header A', req('PUT', '/pedidos/comercio/{{pedido_m_b_id}}/anular', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_m_a_id}}' }, body: { motivo: 'Intento cruzado' } }), [status(404)]),
  item('[pedidos] Aceptar el pedido de B con header B', req('PUT', '/pedidos/comercio/{{pedido_m_b_id}}/aceptar', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_m_b_id}}' } }), [
    status(200),
    "pm.test('Queda en preparacion', () => pm.expect(pm.response.json().data.estado).to.eql('EN_PREPARACION'));",
  ]),
);

items.push(
  item('[exentos] Notificaciones del Dueño con un header no numerico: 400 (ya no es exento)', req('GET', '/notificaciones', { token: 'token_comercio_m', headers: { [HEADER]: 'abc' } }), [status(400)]),
  item('[exentos] Notificaciones del Dueño con el header de otro Dueño: 404 (ya no es exento)', req('GET', '/notificaciones', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_n_id}}' } }), [status(404)]),
  item('[exentos] Contador de notificaciones del Dueño con un id inexistente: 404 (ya no es exento)', req('GET', '/notificaciones/no-leidas/contador', { token: 'token_comercio_m', headers: { [HEADER]: '99999999' } }), [status(404)]),
  item('[exentos] Estado de Mercado Pago ignora un header no numerico', req('GET', '/oauth/mercadopago/cuenta', { token: 'token_comercio_m', headers: { [HEADER]: 'abc' } }), [status(200)]),
  item('[exentos] Estado de Mercado Pago ignora el header de otro Dueño', req('GET', '/oauth/mercadopago/cuenta', { token: 'token_comercio_m', headers: { [HEADER]: '{{comercio_n_id}}' } }), [status(200)]),
);

const enCatalogo = (nombre, ambos) => item(nombre, req('GET', '/catalogo/comercios'), [
  status(200),
  "const ids = pm.response.json().data.map((c) => c.id);",
  ambos
    ? "pm.test('Ambos comercios de M estan en el catalogo', () => { pm.expect(ids).to.include(Number(pm.environment.get('comercio_m_a_id'))); pm.expect(ids).to.include(Number(pm.environment.get('comercio_m_b_id'))); });"
    : "pm.test('Ningun comercio de M esta en el catalogo', () => { pm.expect(ids).to.not.include(Number(pm.environment.get('comercio_m_a_id'))); pm.expect(ids).to.not.include(Number(pm.environment.get('comercio_m_b_id'))); });",
]);

items.push(
  enCatalogo('[bloqueo] Antes: ambos comercios de M estan en el catalogo (APTO_VENTA)', true),
  loginFallido('[bloqueo] Login de M con password incorrecta (intento 1/3)'),
  loginFallido('[bloqueo] Login de M con password incorrecta (intento 2/3)'),
  loginFallido('[bloqueo] Login de M con password incorrecta (intento 3/3): bloquea sin error 500'),
  item('[bloqueo] 4to intento con la password correcta: cuenta bloqueada', req('POST', '/auth/login', { body: { nombreUsuario: '{{comercioM_usuario}}', password: '{{comercioM_password}}' } }), [status(409)]),
  enCatalogo('[bloqueo] Despues: ninguno de los dos comercios de M esta en el catalogo (CERRADO_TEMPORALMENTE)', false),
  ...cicloRecuperacion('[bloqueo 1] Sin cuenta de MP', 'comercioM_password_nueva'),
  perfilEstado('[bloqueo 1] Comercio A restaurado a APROBADO (sin cuenta de Mercado Pago activa)', '{{comercio_m_a_id}}', 'APROBADO'),
  perfilEstado('[bloqueo 1] Comercio B restaurado a APROBADO (sin cuenta de Mercado Pago activa)', '{{comercio_m_b_id}}', 'APROBADO'),
  item('[mercadopago] Vincular cuenta simulada: ambos comercios pasan a APTO_VENTA', req('POST', '/test/duenos/{{m_dueno_id}}/mercadopago-simulada', { body: {} }), [status(200)]),
  perfilEstado('[mercadopago] Comercio A en APTO_VENTA', '{{comercio_m_a_id}}', 'APTO_VENTA'),
  perfilEstado('[mercadopago] Comercio B en APTO_VENTA', '{{comercio_m_b_id}}', 'APTO_VENTA'),
  item('[mercadopago] Estado de la cuenta: vinculada', req('GET', '/oauth/mercadopago/cuenta', { token: 'token_comercio_m' }), [
    status(200),
    "pm.test('Vinculada', () => pm.expect(pm.response.json().data.vinculada).to.eql(true));",
  ]),
  loginFallido('[bloqueo 2] Login de M con password incorrecta (intento 1/3)'),
  loginFallido('[bloqueo 2] Login de M con password incorrecta (intento 2/3)'),
  loginFallido('[bloqueo 2] Login de M con password incorrecta (intento 3/3): bloquea sin error 500'),
  ...cicloRecuperacion('[bloqueo 2] Con cuenta de MP activa', 'comercioM_password_nueva2'),
  perfilEstado('[bloqueo 2] Comercio A restaurado a APTO_VENTA (cuenta de Mercado Pago activa)', '{{comercio_m_a_id}}', 'APTO_VENTA'),
  perfilEstado('[bloqueo 2] Comercio B restaurado a APTO_VENTA (cuenta de Mercado Pago activa)', '{{comercio_m_b_id}}', 'APTO_VENTA'),
  item('[mercadopago] Desvincular la cuenta (endpoint real): sin error 500', req('DELETE', '/oauth/mercadopago/desvincular', { token: 'token_comercio_m' }), [status(200)]),
  perfilEstado('[mercadopago] Comercio A vuelve a APROBADO', '{{comercio_m_a_id}}', 'APROBADO'),
  perfilEstado('[mercadopago] Comercio B vuelve a APROBADO', '{{comercio_m_b_id}}', 'APROBADO'),
  item('[mercadopago] Estado de la cuenta: desvinculada', req('GET', '/oauth/mercadopago/cuenta', { token: 'token_comercio_m' }), [
    status(200),
    "pm.test('Desvinculada', () => pm.expect(pm.response.json().data.vinculada).to.eql(false));",
  ]),
);

const folder = { name: NOMBRE_FOLDER, item: items };

const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
const idx = collection.item.findIndex((f) => f.name === NOMBRE_FOLDER);
if (idx >= 0) collection.item[idx] = folder;
else collection.item.push(folder);
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n', 'utf8');

const environment = JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const variables = {
  comercioM_email: 'postman.comercioM@bajonea.test',
  comercioM_usuario: 'postmancomerciom',
  comercioM_password: 'Postman123',
  comercioM_password_nueva: 'PostmanNueva456',
  comercioM_password_nueva2: 'PostmanNueva789',
  comercioM_codigo_recuperacion: '',
  comercioN_email: 'postman.comercioN@bajonea.test',
  comercioN_usuario: 'postmancomercion',
  comercioN_password: 'Postman123',
  token_verif_comercioM: '',
  token_verif_comercioN: '',
  token_comercio_m: '',
  token_comercio_n: '',
  m_dueno_id: '',
  comercio_m_a_id: '',
  comercio_m_b_id: '',
  comercio_n_id: '',
  categoria_multi_id: '',
  producto_n_id: '',
  producto_m_a_id: '',
  producto_m_b_id: '',
  red_social_m_a_id: '',
  pedido_m_b_id: '',
  nombre_comercio_m_a: '',
  body_404_multi: '',
};
const existentes = new Set(environment.values.map((v) => v.key));
for (const [key, value] of Object.entries(variables)) {
  if (!existentes.has(key)) environment.values.push({ key, value, type: 'default', enabled: true });
}
fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2) + '\n', 'utf8');

console.log(`OK: carpeta "${NOMBRE_FOLDER}" con ${items.length} requests. CUIT M=${CUIT_M} CUIT N=${CUIT_N}`);
