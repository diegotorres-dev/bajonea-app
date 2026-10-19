import { apiFetch } from './api.js';
import { h, crearSvg } from './form-utils.js';

const FIGURAS_CANDADO = [['rect', { x: '3', y: '11', width: '18', height: '11', rx: '2' }], ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }]];

function cargarOpciones(select, items, placeholder) {
  select.innerHTML = '';
  const vacia = document.createElement('option');
  vacia.value = '';
  vacia.textContent = placeholder;
  select.appendChild(vacia);
  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.nombre;
    select.appendChild(option);
  });
}

function mostrarProvinciaFija(provinciaSelect, nombre) {
  const campo = provinciaSelect.closest('.field');
  const etiqueta = campo.querySelector('label');
  const contenedorSelect = provinciaSelect.parentElement;
  contenedorSelect.classList.add('is-hidden');
  etiqueta.setAttribute('for', 'provinciaFija');
  const fija = h('div', { class: 'input-shell input-shell--solo-lectura', 'data-testid': 'campo-provincia-fija' }, [
    h('span', { class: 'input-shell__icon' }, [crearSvg(FIGURAS_CANDADO)]),
    h('input', { type: 'text', id: 'provinciaFija', readonly: true, tabindex: '-1', 'aria-describedby': 'ayuda-provincia-fija', 'data-testid': 'input-provincia-fija' }),
  ]);
  fija.querySelector('input').value = nombre;
  contenedorSelect.insertAdjacentElement('afterend', fija);
  fija.insertAdjacentElement('afterend', h('p', { class: 'field__hint', id: 'ayuda-provincia-fija', 'data-testid': 'texto-provincia-fija' }, ['Solo Tierra del Fuego por ahora']));
}

export async function initGeografiaSelects(provinciaSelect, localidadSelect, preferredProvinciaNombre) {
  localidadSelect.disabled = true;
  localidadSelect.innerHTML = '<option value="">Elegí una provincia primero</option>';

  const provincias = await apiFetch('/geografia/provincias', { auth: false });
  cargarOpciones(provinciaSelect, provincias, 'Seleccioná una provincia');

  provinciaSelect.addEventListener('change', () => {
    cargarLocalidades(provinciaSelect.value, localidadSelect);
  });

  if (provincias.length === 1) {
    provinciaSelect.value = provincias[0].id;
    mostrarProvinciaFija(provinciaSelect, provincias[0].nombre.split(',')[0].trim());
    await cargarLocalidades(provincias[0].id, localidadSelect);
    return;
  }

  if (preferredProvinciaNombre) {
    const match = provincias.find((provincia) => provincia.nombre.startsWith(preferredProvinciaNombre));
    if (match) {
      provinciaSelect.value = match.id;
      await cargarLocalidades(match.id, localidadSelect);
    }
  }
}

export async function preseleccionarGeografia(provinciaSelect, localidadSelect, provinciaId, localidadId) {
  provinciaSelect.value = provinciaId;
  await cargarLocalidades(provinciaSelect.value, localidadSelect);
  localidadSelect.value = localidadId;
}

async function cargarLocalidades(provinciaId, localidadSelect) {
  localidadSelect.innerHTML = '<option value="">Cargando localidades...</option>';
  localidadSelect.disabled = true;

  if (!provinciaId) {
    localidadSelect.innerHTML = '<option value="">Elegí una provincia primero</option>';
    return;
  }

  const localidades = await apiFetch(`/geografia/localidades?provinciaId=${encodeURIComponent(provinciaId)}`, { auth: false });
  cargarOpciones(localidadSelect, localidades, 'Seleccioná una localidad');
  localidadSelect.disabled = false;
}
