export const ZONA_COMERCIO = 'America/Argentina/Ushuaia';

const FORMATO_DIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_COMERCIO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const FORMATO_INSTANTE = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_COMERCIO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function partesDelDia(milisegundos) {
  const partes = {};
  FORMATO_DIA.formatToParts(new Date(milisegundos)).forEach((parte) => {
    partes[parte.type] = parte.value;
  });
  return partes;
}

export function diaDeHoyEnZonaComercio(milisegundos = Date.now()) {
  const partes = partesDelDia(milisegundos);
  return `${partes.year}-${partes.month}-${partes.day}`;
}

export function diaDeAyerEnZonaComercio(milisegundos = Date.now()) {
  const partes = partesDelDia(milisegundos);
  const ayer = new Date(Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day) - 1));
  return ayer.toISOString().slice(0, 10);
}

export function diaDe(fechaHoraDelServidor) {
  return String(fechaHoraDelServidor).slice(0, 10);
}

export function horaMinutoDe(fechaHoraDelServidor) {
  return String(fechaHoraDelServidor).slice(11, 16);
}

export function fechaCortaDe(fechaHoraDelServidor) {
  const [, mes, dia] = diaDe(fechaHoraDelServidor).split('-');
  return `${dia}/${mes}`;
}

export function fechaCompletaDe(fechaHoraDelServidor) {
  const [anio, mes, dia] = diaDe(fechaHoraDelServidor).split('-');
  return `${dia}/${mes}/${anio}`;
}

export function horaConDiaDe(fechaHoraDelServidor) {
  if (diaDe(fechaHoraDelServidor) === diaDeHoyEnZonaComercio()) {
    return horaMinutoDe(fechaHoraDelServidor);
  }
  return `${fechaCortaDe(fechaHoraDelServidor)} ${horaMinutoDe(fechaHoraDelServidor)}`;
}

export function etiquetaDeDia(fechaHoraDelServidor) {
  const dia = diaDe(fechaHoraDelServidor);
  if (dia === diaDeHoyEnZonaComercio()) {
    return 'Hoy';
  }
  if (dia === diaDeAyerEnZonaComercio()) {
    return 'Ayer';
  }
  const [anio, mes, diaDelMes] = dia.split('-');
  return `${diaDelMes}/${mes}/${anio}`;
}

function relojDePared(partes) {
  return Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day), Number(partes.hour), Number(partes.minute), Number(partes.second));
}

export function milisegundosHasta(fechaHoraDelServidor, ahora = Date.now()) {
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(fechaHoraDelServidor));
  if (!coincidencia) {
    return null;
  }
  const objetivo = relojDePared({
    year: coincidencia[1],
    month: coincidencia[2],
    day: coincidencia[3],
    hour: coincidencia[4],
    minute: coincidencia[5],
    second: coincidencia[6] || '0',
  });
  const partes = {};
  FORMATO_INSTANTE.formatToParts(new Date(ahora)).forEach((parte) => {
    partes[parte.type] = parte.value;
  });
  return objetivo - relojDePared(partes);
}
