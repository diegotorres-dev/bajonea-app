import { apiFetch, ApiError } from './api.js';

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];
const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGENES_POR_PRODUCTO = 5;

export class CloudinaryUploadError extends Error {}

export function validarArchivoImagen(file) {
  if (!TIPOS_PERMITIDOS.includes(file.type)) {
    return 'Formato no permitido. Usá JPG, PNG o WEBP.';
  }
  if (file.size > TAMANO_MAXIMO_BYTES) {
    return 'La imagen no puede superar los 5 MB.';
  }
  return null;
}

async function subirArchivoConFirma(firma, file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', firma.apiKey);
  formData.append('timestamp', String(firma.timestamp));
  formData.append('signature', firma.signature);
  formData.append('folder', firma.folder);
  formData.append('upload_preset', firma.uploadPreset);

  let uploadResponse;
  try {
    uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${firma.cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    });
  } catch {
    throw new CloudinaryUploadError('No pudimos conectar con el servicio de imágenes. Probá nuevamente.');
  }

  const uploadData = await uploadResponse.json().catch(() => null);
  if (!uploadResponse.ok || !uploadData || !uploadData.secure_url) {
    const mensajeError = uploadData && uploadData.error && uploadData.error.message
      ? uploadData.error.message
      : 'No pudimos subir la imagen.';
    throw new CloudinaryUploadError(mensajeError);
  }

  return uploadData.secure_url;
}

export async function subirImagenProducto(productoId, file, { orden, esPrincipal = false } = {}) {
  let firma;
  try {
    firma = await apiFetch(`/productos/${productoId}/cloudinary/firma`, { method: 'POST' });
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      throw new CloudinaryUploadError(`Ya alcanzaste el máximo de ${MAX_IMAGENES_POR_PRODUCTO} imágenes por producto.`);
    }
    throw error;
  }

  const url = await subirArchivoConFirma(firma, file);

  return apiFetch(`/productos/${productoId}/imagenes`, {
    method: 'POST',
    body: { url, orden, esPrincipal },
  });
}

export async function subirFotoPerfilComercio(file) {
  const firma = await apiFetch('/comercios/perfil/foto/firma', { method: 'POST' });
  const url = await subirArchivoConFirma(firma, file);
  return apiFetch('/comercios/perfil/foto', { method: 'PUT', body: { url } });
}

export async function subirFotoPerfilRegistroComercio(file) {
  const firma = await apiFetch('/auth/registro/comercio/foto-firma', { method: 'POST', auth: false });
  return subirArchivoConFirma(firma, file);
}

export async function subirFotoPerfilRegistroCliente(file) {
  const firma = await apiFetch('/auth/registro/cliente/foto-firma', { method: 'POST', auth: false });
  return subirArchivoConFirma(firma, file);
}

export async function subirFotoPerfilUsuario(usuarioId, file) {
  const firma = await apiFetch(`/usuarios/${usuarioId}/foto-perfil/firma`, { method: 'POST' });
  const url = await subirArchivoConFirma(firma, file);
  return apiFetch(`/usuarios/${usuarioId}/foto-perfil`, { method: 'PATCH', body: { url } });
}

export async function eliminarFotoPerfilUsuario(usuarioId) {
  return apiFetch(`/usuarios/${usuarioId}/foto-perfil`, { method: 'DELETE' });
}

export async function eliminarImagenProducto(productoId, imagenId) {
  return apiFetch(`/productos/${productoId}/imagenes/${imagenId}`, { method: 'DELETE' });
}

export async function reordenarImagenProducto(productoId, imagenId, orden) {
  return apiFetch(`/productos/${productoId}/imagenes/${imagenId}/orden`, { method: 'PATCH', body: { orden } });
}

export async function recortarImagenProducto(productoId, imagenId, file) {
  const firma = await apiFetch(`/productos/${productoId}/imagenes/${imagenId}/recorte/firma`, { method: 'POST' });
  const url = await subirArchivoConFirma(firma, file);
  return apiFetch(`/productos/${productoId}/imagenes/${imagenId}/url`, { method: 'PATCH', body: { url } });
}
