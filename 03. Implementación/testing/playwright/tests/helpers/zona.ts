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

function partes(ms: number): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const parte of formato.formatToParts(new Date(ms))) {
    salida[parte.type] = parte.value;
  }
  return salida;
}

export function hoyEnZona(ms: number = Date.now()): string {
  const p = partes(ms);
  return `${p.year}-${p.month}-${p.day}`;
}

export function diaDeLaSemanaEnZona(ms: number = Date.now()): number {
  const p = partes(ms);
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day))).getUTCDay();
}

export function fechaHoraSqlEnZona(ms: number): string {
  const p = partes(ms);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

export function haceMinutosEnZona(minutos: number): string {
  return fechaHoraSqlEnZona(Date.now() - minutos * 60_000);
}

export function fechaRelativaEnZona(anios: number, dias = 0): string {
  const [anio, mes, dia] = hoyEnZona().split('-').map(Number);
  const fecha = new Date(Date.UTC(anio - anios, mes - 1, dia + dias));
  return fecha.toISOString().slice(0, 10);
}
