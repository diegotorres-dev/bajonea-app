import path from "node:path";
import { writeFile } from "node:fs/promises";
import { COMERCIOS, catId, tagIds } from "./datos-fase2.mjs";
import { apiPost, subirACloudinary } from "./helpers-fase1.mjs";

const DATOS_PRUEBA_DIR = path.resolve(import.meta.dirname, "..");
const FOTOS_PRODUCTO_DIR = path.join(DATOS_PRUEBA_DIR, "fotos-prueba-resized");

const resumen = [];

for (const c of COMERCIOS) {
    console.log(`\n=== ${c.nombre} ===`);
    const entradaComercio = { key: c.key, nombre: c.nombre, productos: [] };
    try {
        console.log("  Login...");
        const loginResp = await apiPost("/auth/login", { email: c.email, password: c.password });
        const token = loginResp.data.token;
        console.log("  Login OK.");

        const existentesResp = await fetch("http://localhost:8080/api/v1/productos", {
            headers: { Authorization: `Bearer ${token}` }
        }).then(r => r.json());
        const existentesPorNombre = new Map(
            (existentesResp.data ?? []).map(p => [p.nombre.toLowerCase(), p])
        );
        if (existentesPorNombre.size > 0) {
            console.log(`  Ya existen ${existentesPorNombre.size} productos.`);
        }

        for (const [nombre, descripcion, precio, categoria, tags, archivoImagen] of c.productos) {
            const entradaProducto = { nombre };
            const existente = existentesPorNombre.get(nombre.toLowerCase());
            if (existente && existente.imagenes.length > 0) {
                entradaProducto.ok = true;
                entradaProducto.saltado = true;
                console.log(`  SKIP ${nombre} (ya existe con imagen)`);
                entradaComercio.productos.push(entradaProducto);
                continue;
            }
            try {
                let productoId;
                if (existente) {
                    productoId = existente.id;
                    console.log(`  Producto ${nombre} ya existe sin imagen (id=${productoId}), solo subo imagen...`);
                } else {
                    const crearResp = await apiPost("/productos", {
                        nombre,
                        descripcion,
                        precio,
                        categoriaId: catId(categoria),
                        tagIds: tagIds(tags)
                    }, token);
                    productoId = crearResp.data.id;
                }
                entradaProducto.productoId = productoId;

                const firmaResp = await apiPost(`/productos/${productoId}/cloudinary/firma`, {}, token);
                const url = await subirACloudinary(path.join(FOTOS_PRODUCTO_DIR, archivoImagen), firmaResp.data);

                await apiPost(`/productos/${productoId}/imagenes`, {
                    url,
                    orden: 0,
                    esPrincipal: true
                }, token);

                entradaProducto.imagenUrl = url;
                entradaProducto.ok = true;
                console.log(`  OK  ${nombre} (id=${productoId})`);
            } catch (err) {
                entradaProducto.ok = false;
                entradaProducto.error = String(err.message || err);
                console.error(`  FAIL ${nombre}: ${entradaProducto.error}`);
            }
            entradaComercio.productos.push(entradaProducto);
        }
    } catch (err) {
        entradaComercio.errorLogin = String(err.message || err);
        console.error(`  ERROR LOGIN: ${entradaComercio.errorLogin}`);
    }
    resumen.push(entradaComercio);
}

console.log("\n\n=== RESUMEN CARGA DE PRODUCTOS FASE 2 ===");
for (const r of resumen) {
    const ok = r.productos.filter(p => p.ok).length;
    const fail = r.productos.filter(p => !p.ok).length;
    console.log(`${r.key.padEnd(12)} OK=${ok} FAIL=${fail} ${r.errorLogin ?? ""}`);
}

const outPath = path.join(DATOS_PRUEBA_DIR, "scripts", "resumen-productos-fase2.json");
await writeFile(outPath, JSON.stringify(resumen, null, 2));
console.log(`\nResumen guardado en ${outPath}`);
