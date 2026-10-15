const CLAVE = 'bajonea_admin_comercio_nombre';

export function recordarNombreDelComercio(id, nombre) {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify({ id, nombre }));
  } catch {
    return;
  }
}

export function nombreRecordadoDelComercio(id) {
  try {
    const guardado = JSON.parse(sessionStorage.getItem(CLAVE));
    return guardado && guardado.id === id && typeof guardado.nombre === 'string' ? guardado.nombre : '';
  } catch {
    return '';
  }
}
