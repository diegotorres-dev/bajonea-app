export const SUBTOTAL_MAXIMO_ITEM = 99999999;

export function excedeSubtotalMaximo(precioUnitario, cantidad) {
  return precioUnitario * cantidad > SUBTOTAL_MAXIMO_ITEM;
}

export function mensajeSubtotalMaximoExcedido() {
  return `No podés agregar más unidades: el subtotal de este producto superaría el máximo permitido ($${SUBTOTAL_MAXIMO_ITEM.toLocaleString('es-AR')}).`;
}

export function esPasswordSegura(password) {
  return (
    typeof password === 'string' &&
    password.length >= 8 &&
    password.length <= 72 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

export function calcularFortalezaPassword(password) {
  if (!password) {
    return { score: 0, label: 'Muy débil' };
  }
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password) || password.length >= 12) score += 1;

  const labels = ['Muy débil', 'Débil', 'Regular', 'Buena', 'Excelente'];
  return { score, label: labels[score] };
}

export function esEmailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

export function esNombrePropioValido(valor) {
  return /^\p{L}[\p{L} '-]*$/u.test(String(valor || '').trim());
}

export function esDniValido(dni) {
  const valor = String(dni || '').trim();
  if (!/^\d{7,8}$/.test(valor)) return false;
  const numero = Number(valor);
  return numero >= 1000000 && numero <= 99999999;
}

export function esFechaNacimientoValida(fechaTexto) {
  if (!fechaTexto) return false;
  const fecha = new Date(fechaTexto + 'T00:00:00');
  if (Number.isNaN(fecha.getTime())) return false;
  const hoy = new Date();
  if (fecha > hoy) return false;
  let edad = hoy.getFullYear() - fecha.getFullYear();
  const cumplioEsteAnio =
    hoy.getMonth() > fecha.getMonth() ||
    (hoy.getMonth() === fecha.getMonth() && hoy.getDate() >= fecha.getDate());
  if (!cumplioEsteAnio) edad -= 1;
  return edad >= 18;
}

const REGEX_NOMBRE_CLIENTE = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+(?:[-' ][A-Za-zÁÉÍÓÚáéíóúÑñÜü]+)*$/;

export function esNombreClienteValido(valor) {
  return REGEX_NOMBRE_CLIENTE.test(String(valor || '').trim());
}

export function colapsarEspacios(valor) {
  return String(valor || '').trim().replace(/\s+/g, ' ');
}

export function sanitizarDni(dni) {
  return String(dni || '').replace(/[.\-\s]/g, '');
}

export function esDniClienteValido(dni) {
  return /^\d{7,8}$/.test(sanitizarDni(dni));
}

export function esFechaNacimientoClientePlausible(fechaTexto) {
  if (!fechaTexto) return false;
  const fecha = new Date(fechaTexto + 'T00:00:00');
  if (Number.isNaN(fecha.getTime())) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (fecha > hoy) return false;
  const haceCientoVeinteAnios = new Date(hoy);
  haceCientoVeinteAnios.setFullYear(haceCientoVeinteAnios.getFullYear() - 120);
  return fecha >= haceCientoVeinteAnios;
}

const PREFIJO_TELEFONO_FIJO = '+549';

export function esTelefonoValido(telefono) {
  const sanitizado = String(telefono || '').replace(/[ ()\-]/g, '');
  const parteLocal = sanitizado.startsWith(PREFIJO_TELEFONO_FIJO)
    ? sanitizado.slice(PREFIJO_TELEFONO_FIJO.length)
    : sanitizado;
  return /^\d{10}$/.test(parteLocal);
}

export function esCalleValida(calle) {
  return /[\p{L}0-9]/u.test(String(calle || ''));
}

export function esTextoConContenidoValido(valor) {
  return /[\p{L}0-9]/u.test(String(valor || ''));
}

export function esNombreProductoValido(valor) {
  return /^[\p{L}0-9][\p{L}0-9 ]*$/u.test(String(valor || '').trim());
}

export function esPrecioValido(valorFormateado) {
  const soloDigitos = String(valorFormateado || '').replace(/\D/g, '');
  return soloDigitos.length > 0 && soloDigitos.length <= 8;
}

export function aTitleCase(valor) {
  return String(valor || '')
    .toLowerCase()
    .replace(/(^|[\s\-'/])\p{L}/gu, (match) => match.toUpperCase());
}

export function normalizarCampos(objeto, campos) {
  if (!objeto) return objeto;
  for (const campo of campos) {
    if (objeto[campo]) objeto[campo] = aTitleCase(objeto[campo]);
  }
  return objeto;
}

export function esFechaNoFuturaValida(fechaTexto) {
  if (!fechaTexto) return false;
  const fecha = new Date(fechaTexto + 'T00:00:00');
  if (Number.isNaN(fecha.getTime())) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return fecha <= hoy;
}

const CUIT_MULTIPLICADORES = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function sanitizarCuit(cuit) {
  return String(cuit || '').replace(/\D/g, '');
}

export function esCuitValido(cuit) {
  const valor = sanitizarCuit(cuit);
  if (!/^\d{11}$/.test(valor)) return false;

  let suma = 0;
  for (let i = 0; i < CUIT_MULTIPLICADORES.length; i += 1) {
    suma += Number(valor[i]) * CUIT_MULTIPLICADORES[i];
  }

  const resto = suma % 11;
  let digitoVerificadorEsperado = 11 - resto;
  if (digitoVerificadorEsperado === 11) {
    digitoVerificadorEsperado = 0;
  } else if (digitoVerificadorEsperado === 10) {
    return false;
  }

  return digitoVerificadorEsperado === Number(valor[10]);
}

export function esNumeroDireccionValido(numero) {
  return /^\d+$/.test(String(numero || '').trim());
}

export function esCodigoPostalValido(codigoPostal) {
  const valor = String(codigoPostal || '').trim();
  return /^\d{4}$/.test(valor) || /^[A-Za-z]\d{4}[A-Za-z]{3}$/.test(valor);
}

export function normalizarCodigoPostal(codigoPostal) {
  const valor = String(codigoPostal || '').trim();
  return /^[A-Za-z]\d{4}[A-Za-z]{3}$/.test(valor) ? valor.toUpperCase() : valor;
}

export function esUrlRedSocialValida(url) {
  const valor = String(url || '').trim();
  if (!valor) return false;
  return /^(?=.*\p{L})(?=.*\.)\S+$/u.test(valor);
}

export function normalizarUrlRedSocial(url) {
  const valor = String(url || '').trim();
  if (!valor) return valor;
  return /^https?:\/\//i.test(valor) ? valor : `https://${valor}`;
}

export function mostrarErrorCampo(errorElId, mensaje) {
  const el = document.getElementById(errorElId);
  if (!el) return;
  el.textContent = mensaje;
  el.style.display = 'flex';
}

export function limpiarErrorCampo(errorElId) {
  const el = document.getElementById(errorElId);
  if (!el) return;
  el.textContent = '';
  el.style.display = 'none';
}

export function limpiarErroresCampos(errorElIds) {
  errorElIds.forEach(limpiarErrorCampo);
}

export function mapearErroresBackend(erroresBackend, mapaCampoAErrorElId) {
  if (!erroresBackend) return false;
  let aplicoAlguno = false;
  Object.entries(erroresBackend).forEach(([campoBackend, mensaje]) => {
    const errorElId = mapaCampoAErrorElId[campoBackend];
    if (errorElId) {
      mostrarErrorCampo(errorElId, mensaje);
      aplicoAlguno = true;
    }
  });
  return aplicoAlguno;
}

export function validarCamposSilencioso(campos) {
  let esValido = true;
  campos.forEach(({ inputId, errorId, validador, mensaje }) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    const valorValido = validador ? validador(input.value) : input.checkValidity();
    if (valorValido) {
      limpiarErrorCampo(errorId);
    } else {
      mostrarErrorCampo(errorId, mensaje || input.validationMessage || 'Este campo es obligatorio.');
      esValido = false;
    }
  });
  return esValido;
}

export function validarCamposRequeridosSilencioso(campos) {
  let esValido = true;
  campos.forEach(({ inputId, errorId, validador, mensajeVacio, mensajeInvalido }) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (!input.value.trim()) {
      mostrarErrorCampo(errorId, mensajeVacio);
      esValido = false;
      return;
    }
    if (validador && !validador(input.value)) {
      mostrarErrorCampo(errorId, mensajeInvalido);
      esValido = false;
      return;
    }
    limpiarErrorCampo(errorId);
  });
  return esValido;
}

export function scrollAlPrimerError(contenedor = document) {
  const primerCampoError = Array.from(contenedor.querySelectorAll('.field__error'))
    .find((el) => el.offsetParent !== null && el.textContent.trim() !== '');
  if (primerCampoError) {
    primerCampoError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const banner = contenedor.querySelector('.banner');
  if (banner) {
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

export function aplicarFortalezaPassword(password, barsContainer, labelEl) {
  const { score, label } = calcularFortalezaPassword(password);
  const bars = barsContainer.querySelectorAll('.strength-meter__bar');
  bars.forEach((bar, index) => {
    bar.classList.toggle('strength-meter__bar--filled', index < score);
  });
  if (labelEl) {
    labelEl.textContent = password ? `Seguridad: ${label.toLowerCase()}` : 'Seguridad';
  }
}
