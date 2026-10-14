const ZONA = process.env.E2E_ZONA_HORARIA || 'America/Argentina/Ushuaia';

const formato = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function partes(ms) {
  const salida = {};
  for (const parte of formato.formatToParts(new Date(ms))) {
    salida[parte.type] = parte.value;
  }
  return salida;
}

export function fechaHoraSqlEnZona(ms) {
  const p = partes(ms);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

export function isoEnZona(ms) {
  const p = partes(ms);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

export function haceMinutosEnZona(minutos) {
  return fechaHoraSqlEnZona(Date.now() - minutos * 60_000);
}

export function fechaRelativaEnZona(anios, dias = 0) {
  const p = partes(Date.now());
  return new Date(Date.UTC(Number(p.year) - anios, Number(p.month) - 1, Number(p.day) + dias)).toISOString().slice(0, 10);
}

export const SNIPPET_FECHA_RELATIVA = (anios, dias, destino) => [
  "const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Ushuaia' }).split('-').map(Number);",
  `const f = new Date(Date.UTC(hoy[0] - ${anios}, hoy[1] - 1, hoy[2] + ${dias}));`,
  `const ${destino} = f.toISOString().slice(0, 10);`,
];
