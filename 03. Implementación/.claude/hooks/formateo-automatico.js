#!/usr/bin/env node
// Hook PostToolUse (Anexo C.3 de GUIA-IMPLEMENTACION-MVP-BAJONEA.pdf).
// Corre después de cada edición de un archivo .java y formatea automáticamente,
// sin depender de que el modelo se acuerde de hacerlo.
//
// Prioridad de formateador (el primero disponible gana):
//   1) $GOOGLE_JAVA_FORMAT_JAR — jar local de google-java-format, si la variable
//      de entorno apunta a uno.
//   2) fmt-maven-plugin o spotless-maven-plugin en backend/pom.xml, si ya se
//      agregó alguno (ver nota abajo — al momento de crear este hook, Fase 3,
//      pom.xml todavía NO tiene ninguno configurado).
//   3) Ninguno disponible: no bloquea nada, solo deja una nota en stderr para que
//      quede visible que el formateo no corrió.
//
// Nunca bloquea la edición por no encontrar formateador (exit 0 siempre), porque
// esto es higiene de estilo, no una regla de negocio — corresponde a
// bloquear-entity-en-controller.js / bloquear-escritura-fuera-de-proyecto.js
// ser los que sí bloquean.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(input);
    const filePath = (payload.tool_input || {}).file_path;
    if (!filePath || !filePath.endsWith(".java")) return process.exit(0);

    const jar = process.env.GOOGLE_JAVA_FORMAT_JAR;
    if (jar && fs.existsSync(jar)) {
      try {
        execSync(`java -jar "${jar}" --replace "${filePath}"`, { stdio: "ignore" });
        return process.exit(0);
      } catch (e) {
        console.error(`[formateo-automatico] google-java-format falló sobre ${filePath}: ${e.message}`);
        return process.exit(0);
      }
    }

    const pomPath = findPom(filePath);
    if (pomPath) {
      const pomContent = fs.readFileSync(pomPath, "utf8");
      const backendDir = path.dirname(pomPath);
      try {
        if (pomContent.includes("spotless-maven-plugin")) {
          execSync("mvn -q spotless:apply", { cwd: backendDir, stdio: "ignore" });
          return process.exit(0);
        }
        if (pomContent.includes("fmt-maven-plugin")) {
          execSync("mvn -q fmt:format", { cwd: backendDir, stdio: "ignore" });
          return process.exit(0);
        }
      } catch (e) {
        console.error(`[formateo-automatico] El formateador Maven falló: ${e.message}`);
        return process.exit(0);
      }
    }

    console.error(
      `[formateo-automatico] ${filePath} no se formateó: no hay ningún formateador configurado ` +
        `todavía (ni GOOGLE_JAVA_FORMAT_JAR, ni spotless-maven-plugin/fmt-maven-plugin en pom.xml). ` +
        `Agregá uno de los dos a backend/pom.xml para que este hook tenga efecto real.`
    );
    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});

function findPom(javaFilePath) {
  let dir = path.dirname(javaFilePath);
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, "pom.xml");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
