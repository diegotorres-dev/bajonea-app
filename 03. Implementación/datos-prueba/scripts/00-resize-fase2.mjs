import path from "node:path";
import { readdir } from "node:fs/promises";
import sharp from "sharp";

const DATOS_PRUEBA_DIR = path.resolve(import.meta.dirname, "..");
const RAW_DIR = path.join(DATOS_PRUEBA_DIR, "fotos-prueba");
const OUT_DIR = path.join(DATOS_PRUEBA_DIR, "fotos-prueba-resized");

const PREFIJOS_FASE2 = ["elcuyano-", "frozono-", "donpepone-", "nn-", "coiron-", "patiobalto-", "grandehotelrestaurante"];
const EXCLUIR_SUFIJOS = ["-foto.jpg", "-datos.png", "-menu.png", "-menu.pdf", "-menu.txt", "-menu1.png", "-menu2.png", "-menu3.png", "-menureal.jpeg", "-menureal2.jpeg", "-menureal3.jpeg", "-menureal4.jpeg", "-menureal5.jpeg"];

const archivos = await readdir(RAW_DIR);
const productos = archivos.filter((f) => {
    if (!PREFIJOS_FASE2.some((p) => f.startsWith(p))) return false;
    if (EXCLUIR_SUFIJOS.some((s) => f.endsWith(s))) return false;
    return f.endsWith(".jpg") || f.endsWith(".jpeg");
});

console.log(`Encontrados ${productos.length} archivos de producto de Fase 2 para resizear.`);

let ok = 0;
let fail = 0;
for (const nombre of productos) {
    try {
        await sharp(path.join(RAW_DIR, nombre))
            .resize({ width: 1200, withoutEnlargement: true })
            .jpeg({ quality: 82 })
            .toFile(path.join(OUT_DIR, nombre));
        console.log(`  OK ${nombre}`);
        ok++;
    } catch (err) {
        console.error(`  FAIL ${nombre}: ${err.message}`);
        fail++;
    }
}

console.log(`\nResize completo: OK=${ok} FAIL=${fail}`);
