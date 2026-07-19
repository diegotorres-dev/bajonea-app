#!/usr/bin/env node
/**
 * ETL Georef — Bajoneá (Fase 2bis de GUIA-IMPLEMENTACION-MVP-BAJONEA.md)
 *
 * Carga inicial y única del catálogo geográfico completo (todo el país) desde la API Georef
 * (https://apis.datos.gob.ar/georef/api) hacia las tablas `provincia` y `localidad`.
 *
 * No es un endpoint de la aplicación: es un script de infraestructura que se corre una vez
 * (y ocasionalmente a mano si Georef publica localidades nuevas). No requiere Spring Boot
 * levantado ni pasa por el Repository de JPA — inserta directo por SQL, tal como habilita
 * la nota de la Fase 4.2 de la guía para Provincia/Localidad.
 *
 * Uso:
 *   node etl-georef.mjs                  -> genera el archivo SQL en ./output/georef-seed.sql
 *   node etl-georef.mjs --out <archivo>  -> genera el SQL en la ruta indicada
 *
 * El SQL generado es idempotente (INSERT ... ON DUPLICATE KEY UPDATE): correrlo más de una vez
 * no duplica filas ni falla. La aplicación del SQL contra MySQL se hace en un paso aparte con el
 * cliente `mysql` (ver docs/DECISIONES.md para el detalle de por qué se separaron ambos pasos).
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GEOREF_BASE = "https://apis.datos.gob.ar/georef/api";
const PAGE_SIZE = 3000; // Georef acepta hasta max=5000; 3000 fuerza paginación real sin ser excesivo.
const BATCH_INSERT_SIZE = 500; // filas por sentencia INSERT, para no generar un archivo gigante de una sola línea.

const __dirname = dirname(fileURLToPath(import.meta.url));

function sqlEscape(value) {
  if (value === null || value === undefined) return "NULL";
  return "'" + String(value).replace(/\\/g, "\\\\").replace(/'/g, "''") + "'";
}

async function fetchAllPaginated(endpoint, resultKey, extraParams = {}) {
  const items = [];
  let inicio = 0;
  let total = Infinity;

  while (items.length < total) {
    const params = new URLSearchParams({
      campos: "estandar",
      max: String(PAGE_SIZE),
      inicio: String(inicio),
      ...extraParams,
    });
    const url = `${GEOREF_BASE}/${endpoint}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Georef respondió ${res.status} ${res.statusText} para ${url}`);
    }
    const body = await res.json();
    total = body.total;
    const page = body[resultKey];
    items.push(...page);
    console.log(`  ${endpoint}: ${items.length}/${total} (inicio=${inicio}, page=${page.length})`);

    if (page.length === 0) break; // corte de seguridad ante una respuesta inesperada
    inicio += page.length;
  }

  return items;
}

function buildInsertStatements(tableName, columns, rows, updateColumns) {
  const statements = [];
  for (let i = 0; i < rows.length; i += BATCH_INSERT_SIZE) {
    const chunk = rows.slice(i, i + BATCH_INSERT_SIZE);
    const values = chunk
      .map((row) => "(" + columns.map((c) => sqlEscape(row[c])).join(", ") + ")")
      .join(",\n  ");
    const updateClause = updateColumns.map((c) => `${c} = VALUES(${c})`).join(", ");
    statements.push(
      `INSERT INTO ${tableName} (${columns.join(", ")})\nVALUES\n  ${values}\nON DUPLICATE KEY UPDATE ${updateClause};`
    );
  }
  return statements;
}

async function main() {
  const outArgIndex = process.argv.indexOf("--out");
  const outPath =
    outArgIndex !== -1 && process.argv[outArgIndex + 1]
      ? resolve(process.argv[outArgIndex + 1])
      : resolve(__dirname, "output", "georef-seed.sql");

  console.log("Descargando provincias...");
  const provincias = await fetchAllPaginated("provincias", "provincias");

  console.log("Descargando localidades (todo el país)...");
  const localidades = await fetchAllPaginated("localidades", "localidades");

  const provinciaRows = provincias.map((p) => ({ id: p.id, nombre: p.nombre }));
  const localidadRows = localidades.map((l) => ({
    id: l.id,
    nombre: l.nombre,
    provincia_id: l.provincia.id,
  }));

  const statements = [
    "-- Generado por backend/scripts/etl-georef/etl-georef.mjs -- NO editar a mano.",
    `-- Provincias: ${provinciaRows.length} | Localidades: ${localidadRows.length}`,
    "-- Idempotente: INSERT ... ON DUPLICATE KEY UPDATE.",
    "",
    "SET FOREIGN_KEY_CHECKS = 0;",
    "",
    ...buildInsertStatements("provincia", ["id", "nombre"], provinciaRows, ["nombre"]),
    "",
    ...buildInsertStatements(
      "localidad",
      ["id", "nombre", "provincia_id"],
      localidadRows,
      ["nombre", "provincia_id"]
    ),
    "",
    "SET FOREIGN_KEY_CHECKS = 1;",
    "",
  ];

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, statements.join("\n"), "utf8");

  console.log(`\nOK. SQL generado en: ${outPath}`);
  console.log(`Provincias: ${provinciaRows.length} | Localidades: ${localidadRows.length}`);
}

main().catch((err) => {
  console.error("ETL Georef falló:", err);
  process.exit(1);
});
