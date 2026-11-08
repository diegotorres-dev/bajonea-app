const DESTINO = process.env.E2E_CONECTIVIDAD_URL || 'https://api.cloudinary.com';
const ESPERA_MS = Number(process.env.E2E_CONECTIVIDAD_ESPERA_MS || 8000);

async function responde() {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), ESPERA_MS);
  try {
    await fetch(DESTINO, { method: 'HEAD', signal: control.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(temporizador);
  }
}

if (await responde()) {
  console.log(`Conectividad correcta: ${DESTINO} responde.`);
} else {
  console.error(`Sin conexión a ${DESTINO}. La corrida completa sube imágenes reales y fallaría a mitad de camino. Revisá internet y volvé a empezar.`);
  process.exit(1);
}
