const path = require('node:path');
const fs = require('node:fs');

const [, , raizGlobal, destino] = process.argv;
const newman = require(path.join(raizGlobal, 'newman'));
const opciones = JSON.parse(process.env.NEWMAN_CONFIG);

newman.run(
  { ...opciones, reporters: ['cli'], reporter: { cli: {} } },
  (error, resumen) => {
    if (error || !resumen) {
      fs.writeFileSync(destino, JSON.stringify({ error: String(error && error.message ? error.message : error) }));
      process.exitCode = 2;
      return;
    }
    const corrida = resumen.run;
    const limite = Number(process.env.NEWMAN_FALLAS || 15);
    const compacto = {
      stats: corrida.stats,
      failures: corrida.failures.slice(0, limite).map((falla) => ({
        origen: falla.source && falla.source.name,
        nombre: falla.error && falla.error.name,
        mensaje: String(falla.error && falla.error.message).slice(0, 220),
      })),
    };
    fs.writeFileSync(destino, JSON.stringify(compacto));
  },
);
