import { apiFetch, ApiError, completarRenuncia } from './api.js';
import { abrirHoja, campoCasilla } from './hoja.js';

const ID_HOJA = 'hoja-renuncia-empleado';
const MENSAJE_SIN_CONEXION = 'No pudimos conectar. Revisá tu conexión e intentá de nuevo.';
const MENSAJE_ERROR_GENERICO = 'No pudimos procesar tu salida del equipo. Intentá de nuevo.';
const MENSAJE_NO_DISPONIBLE = 'No encontramos este comercio entre los tuyos. Es posible que ya no formes parte del equipo.';
const OPCIONES_RED = { handle5xxGlobally: false, handleRedGlobally: false };

function mensajeDeRenuncia(error) {
  if (!(error instanceof ApiError)) {
    return MENSAJE_ERROR_GENERICO;
  }
  if (error.status === 0) {
    return MENSAJE_SIN_CONEXION;
  }
  if (error.status === 404) {
    return MENSAJE_NO_DISPONIBLE;
  }
  if (error.status === 409 && error.message) {
    return error.message;
  }
  return MENSAJE_ERROR_GENERICO;
}

export function abrirHojaRenuncia(comercio) {
  if (document.getElementById(ID_HOJA)) {
    return;
  }
  const casilla = campoCasilla({ id: 'renuncia-entiendo', etiqueta: 'Entiendo que para volver el dueño me tiene que invitar de nuevo.', testid: 'check-renuncia-entiendo' });
  const hoja = abrirHoja({
    titulo: `¿Dejar de trabajar en ${comercio.nombre}?`,
    texto: 'Vas a salir del equipo y no vas a poder volver a operar en este comercio. Se le notificará al dueño. Tu cuenta y tus datos personales continuarán intactos.',
    contenido: casilla.campo,
    clase: 'hoja--formulario',
    testid: ID_HOJA,
    testids: { titulo: 'titulo-renuncia', textos: ['texto-renuncia'], error: 'error-renuncia' },
    acciones: [
      {
        etiqueta: 'Dejar de trabajar',
        etiquetaEnviando: 'Saliendo…',
        variante: 'peligro',
        testid: 'btn-confirmar-renuncia',
        deshabilitadaSi: () => !casilla.control.checked,
        alPulsar: async () => {
          try {
            await apiFetch(`/empleados/comercios/${comercio.id}/renunciar`, { ...OPCIONES_RED, method: 'PUT' });
          } catch (error) {
            throw new Error(mensajeDeRenuncia(error));
          }
          completarRenuncia(comercio.id, comercio.nombre);
        },
      },
      { etiqueta: 'Volver', variante: 'segura', inicial: true, testid: 'btn-volver-renuncia' },
    ],
  });
  hoja.fondo.id = ID_HOJA;
  casilla.control.addEventListener('change', () => {
    hoja.limpiarError();
    hoja.refrescarAcciones();
  });
}
