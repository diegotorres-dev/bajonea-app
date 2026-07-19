#!/usr/bin/env node
// Hook PostToolUse (Anexo C.1 de GUIA-IMPLEMENTACION-MVP-BAJONEA.pdf).
// Corre después de escribir/editar un archivo en controllers/. Lee el archivo ya
// escrito en disco y busca:
//   1) ResponseEntity<X> donde X no arranca con "ApiResponse" (regla no negociable
//      de CLAUDE.md §4.2 / GUIA Fase 3.3: los controllers SIEMPRE envuelven en
//      ApiResponse<DTO>, nunca devuelven la Entity ni un tipo suelto).
//   2) Métodos que devuelven una Entity JPA directamente por nombre de clase
//      (comparando contra las clases reales en entities/, no una lista fija, para
//      que el hook siga funcionando a medida que la Fase 4 agrega entidades).
// Si encuentra una violación, bloquea (exit 2) para que se corrija antes de seguir.

const fs = require("fs");
const path = require("path");

let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(input);
    const filePath = (payload.tool_input || {}).file_path;
    if (!filePath) return process.exit(0);
    if (!/[\\/]controllers[\\/].*\.java$/i.test(filePath)) return process.exit(0);

    let content;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch (e) {
      return process.exit(0);
    }

    const violations = [];

    // 1) ResponseEntity<X> sin ApiResponse envolviendo.
    const lines = content.split("\n");
    lines.forEach((line, idx) => {
      const match = line.match(/ResponseEntity<\s*([A-Za-z0-9_.<>,\s\[\]]+)>/);
      if (match) {
        const generic = match[1].trim();
        if (!generic.startsWith("ApiResponse")) {
          violations.push(
            `Línea ${idx + 1}: "ResponseEntity<${generic}>" no envuelve en ApiResponse<...>.`
          );
        }
      }
    });

    // 2) Métodos que devuelven una Entity directamente (sin ResponseEntity ni ApiResponse).
    const entitiesDir = findEntitiesDir(filePath);
    if (entitiesDir && fs.existsSync(entitiesDir)) {
      const entityNames = fs
        .readdirSync(entitiesDir)
        .filter((f) => f.endsWith(".java"))
        .map((f) => f.replace(/\.java$/, ""));

      if (entityNames.length) {
        const escaped = entityNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        const bareReturnRe = new RegExp(
          `public\\s+(?:static\\s+)?(${escaped.join("|")})\\s+\\w+\\s*\\(`,
          "g"
        );
        let m;
        while ((m = bareReturnRe.exec(content)) !== null) {
          violations.push(
            `Se encontró un método que devuelve la entidad "${m[1]}" directamente, sin DTO ni ApiResponse.`
          );
        }
      }
    }

    if (violations.length) {
      console.error(
        `[bloquear-entity-en-controller] ${filePath} expone datos de forma no conforme a CLAUDE.md §4.2:`
      );
      violations.forEach((v) => console.error(" - " + v));
      console.error(
        "Los controllers nunca devuelven una Entity JPA ni un ResponseEntity<X> sin ApiResponse<T>. " +
          "Envolvé el resultado en un XxxResponseDTO + ApiResponse<T> antes de continuar."
      );
      process.exit(2);
    }

    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});

function findEntitiesDir(controllerFilePath) {
  // controllers/ y entities/ son paquetes hermanos bajo com.bajonea.backend/.
  let dir = path.dirname(controllerFilePath);
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "..", "entities");
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}
