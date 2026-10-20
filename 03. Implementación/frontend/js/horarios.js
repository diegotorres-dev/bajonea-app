export const ORDEN_DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];

export const LABELS_DIA = {
  LUNES: 'Lunes',
  MARTES: 'Martes',
  MIERCOLES: 'Miércoles',
  JUEVES: 'Jueves',
  VIERNES: 'Viernes',
  SABADO: 'Sábado',
  DOMINGO: 'Domingo',
};

const MINUTOS_POR_DIA = 1440;
const MINUTOS_POR_SEMANA = 7 * MINUTOS_POR_DIA;

export function recortarHora(hora) {
  return String(hora).slice(0, 5);
}

function aMinutos(hora) {
  const [horas, minutos] = recortarHora(hora).split(':').map(Number);
  return horas * 60 + minutos;
}

export function nombreDia(dia) {
  return (LABELS_DIA[dia] || '').toLowerCase();
}

export function cruzaMedianoche(apertura, cierre) {
  return aMinutos(cierre) < aMinutos(apertura);
}

export function diaSiguiente(dia) {
  return ORDEN_DIAS[(ORDEN_DIAS.indexOf(dia) + 1) % ORDEN_DIAS.length];
}

export function intervaloSemana(dia, apertura, cierre) {
  const inicio = ORDEN_DIAS.indexOf(dia) * MINUTOS_POR_DIA + aMinutos(apertura);
  let duracion;
  if (cruzaMedianoche(apertura, cierre)) {
    duracion = MINUTOS_POR_DIA - aMinutos(apertura) + aMinutos(cierre);
  } else {
    const fin = recortarHora(cierre) === '23:59' ? MINUTOS_POR_DIA : aMinutos(cierre);
    duracion = fin - aMinutos(apertura);
  }
  return { inicio, fin: inicio + duracion };
}

function desplazamientoSuperpuesto(a, b) {
  const intervaloA = intervaloSemana(a.diaSemana, a.horaApertura, a.horaCierre);
  const intervaloB = intervaloSemana(b.diaSemana, b.horaApertura, b.horaCierre);
  for (let vuelta = -1; vuelta <= 1; vuelta++) {
    const desplazamiento = vuelta * MINUTOS_POR_SEMANA;
    if (intervaloA.inicio < intervaloB.fin + desplazamiento && intervaloB.inicio + desplazamiento < intervaloA.fin) {
      return { desplazamiento, inicioA: intervaloA.inicio, inicioB: intervaloB.inicio };
    }
  }
  return null;
}

export function franjasSeSuperponen(a, b) {
  return desplazamientoSuperpuesto(a, b) !== null;
}

export function textoRango(franja) {
  const rango = `${recortarHora(franja.horaApertura)} a ${recortarHora(franja.horaCierre)}`;
  return cruzaMedianoche(franja.horaApertura, franja.horaCierre) ? `${rango} (día siguiente)` : rango;
}

export function textoFranja(franja) {
  return `${LABELS_DIA[franja.diaSemana]}: ${textoRango(franja)}`;
}

export function leyendaCruce(dia, apertura, cierre) {
  if (!dia || !apertura || !cierre || !cruzaMedianoche(apertura, cierre)) {
    return '';
  }
  return `Termina el ${nombreDia(diaSiguiente(dia))} a las ${recortarHora(cierre)}`;
}

export function leyendaCruceVariosDias(apertura, cierre) {
  if (!apertura || !cierre || !cruzaMedianoche(apertura, cierre)) {
    return '';
  }
  return `Cada turno termina al día siguiente a las ${recortarHora(cierre)}`;
}

export function mensajeConflictoFranjas(actual, otra) {
  if (actual.diaSemana === otra.diaSemana) {
    return `Ya tenés un horario cargado el ${LABELS_DIA[otra.diaSemana]} de ${recortarHora(otra.horaApertura)} a ${recortarHora(otra.horaCierre)}, que se superpone con este.`;
  }
  const choque = desplazamientoSuperpuesto(actual, otra);
  const actualPrimero = !choque || choque.inicioA <= choque.inicioB + choque.desplazamiento;
  const primera = actualPrimero ? actual : otra;
  const segunda = actualPrimero ? otra : actual;
  return `El turno del ${nombreDia(primera.diaSemana)} de ${recortarHora(primera.horaApertura)} a ${recortarHora(primera.horaCierre)} se superpone con el del ${nombreDia(segunda.diaSemana)} de ${recortarHora(segunda.horaApertura)} a ${recortarHora(segunda.horaCierre)}.`;
}

export const MENSAJE_CIERRE_IGUAL = 'La hora de cierre no puede ser igual a la de apertura. Si atendés las 24 horas, cargá de 00:00 a 23:59.';

export function ordenarFranjas(franjas) {
  return [...franjas].sort((a, b) => {
    const diaComp = ORDEN_DIAS.indexOf(a.diaSemana) - ORDEN_DIAS.indexOf(b.diaSemana);
    return diaComp !== 0 ? diaComp : recortarHora(a.horaApertura).localeCompare(recortarHora(b.horaApertura));
  });
}

export function franjaDeHoyYMadrugada(horarios, diaHoy) {
  const franjas = horarios || [];
  const diaAyer = ORDEN_DIAS[(ORDEN_DIAS.indexOf(diaHoy) + ORDEN_DIAS.length - 1) % ORDEN_DIAS.length];
  const colaDeAyer = franjas.filter((franja) => franja.diaSemana === diaAyer
    && cruzaMedianoche(franja.horaApertura, franja.horaCierre));
  const deHoy = franjas.filter((franja) => franja.diaSemana === diaHoy);
  return { colaDeAyer, deHoy };
}
