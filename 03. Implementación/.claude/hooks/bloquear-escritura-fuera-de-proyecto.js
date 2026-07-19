#!/usr/bin/env node
// Hook PreToolUse (Anexo C.2 de GUIA-IMPLEMENTACION-MVP-BAJONEA.pdf).
// Rechaza cualquier Write/Edit cuya ruta no esté bajo backend/, frontend/, postman/,
// testing/, docs/, .claude/, o el CLAUDE.md de la raíz (excepción necesaria: es la
// memoria de proyecto y la guía exige mantenerla actualizada en cada fase).

const path = require("path");

let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(input);
    const filePath = (payload.tool_input || {}).file_path;
    if (!filePath) return process.exit(0);

    const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const abs = path.resolve(filePath);
    const rel = path.relative(projectRoot, abs);

    // Fuera del árbol del proyecto por completo.
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      return deny(filePath);
    }

    const allowedPrefixes = ["backend", "frontend", "postman", "testing", "docs", ".claude"];
    const allowedRootFiles = ["CLAUDE.md"];

    const segments = rel.split(path.sep);
    const isTopLevelFile = segments.length === 1;

    if (isTopLevelFile) {
      if (allowedRootFiles.includes(segments[0])) return process.exit(0);
      return deny(filePath);
    }

    if (!allowedPrefixes.includes(segments[0])) {
      return deny(filePath);
    }

    process.exit(0);
  } catch (e) {
    // No bloquear por errores de parseo del propio hook.
    process.exit(0);
  }
});

function deny(filePath) {
  console.error(
    `[bloquear-escritura-fuera-de-proyecto] Escritura bloqueada: "${filePath}" queda fuera de las ` +
      `carpetas permitidas del proyecto (backend/, frontend/, postman/, testing/, docs/, .claude/) ` +
      `o del CLAUDE.md de la raíz.`
  );
  process.exit(2);
}
