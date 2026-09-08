import { apiFetch } from './api.js';

export async function initGeografiaSelects(provinciaSelect, localidadSelect, preferredProvinciaNombre) {
  localidadSelect.disabled = true;
  localidadSelect.innerHTML = '<option value="">Elegí una provincia primero</option>';

  const provincias = await apiFetch('/geografia/provincias', { auth: false });
  provinciaSelect.innerHTML = '<option value="">Seleccioná una provincia</option>';
  provincias.forEach((provincia) => {
    const option = document.createElement('option');
    option.value = provincia.id;
    option.textContent = provincia.nombre;
    provinciaSelect.appendChild(option);
  });

  provinciaSelect.addEventListener('change', () => {
    cargarLocalidades(provinciaSelect.value, localidadSelect);
  });

  if (preferredProvinciaNombre) {
    const match = provincias.find((provincia) => provincia.nombre.startsWith(preferredProvinciaNombre));
    if (match) {
      provinciaSelect.value = match.id;
      await cargarLocalidades(match.id, localidadSelect);
    }
  }
}

async function cargarLocalidades(provinciaId, localidadSelect) {
  localidadSelect.innerHTML = '<option value="">Cargando localidades...</option>';
  localidadSelect.disabled = true;

  if (!provinciaId) {
    localidadSelect.innerHTML = '<option value="">Elegí una provincia primero</option>';
    return;
  }

  const localidades = await apiFetch(`/geografia/localidades?provinciaId=${encodeURIComponent(provinciaId)}`, { auth: false });
  localidadSelect.innerHTML = '<option value="">Seleccioná una localidad</option>';
  localidades.forEach((localidad) => {
    const option = document.createElement('option');
    option.value = localidad.id;
    option.textContent = localidad.nombre;
    localidadSelect.appendChild(option);
  });
  localidadSelect.disabled = false;
}
