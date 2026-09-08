import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { COMERCIOS } from "./datos-fase1.mjs";
import { apiPost, subirACloudinary } from "./helpers-fase1.mjs";

const DATOS_PRUEBA_DIR = path.resolve(import.meta.dirname, "..");
const resumenPath = path.join(DATOS_PRUEBA_DIR, "scripts", "resumen-registro-fase1.json");
const resumen = JSON.parse(await readFile(resumenPath, "utf-8"));

const keysAReintentar = resumen.filter(r => !r.ok).map(r => r.key);
console.log("Reintentando:", keysAReintentar);

for (const key of keysAReintentar) {
    const c = COMERCIOS.find(x => x.key === key);
    const idx = resumen.findIndex(r => r.key === key);
    console.log(`\n=== ${c.nombre} ===`);
    const registro = { key: c.key, nombre: c.nombre, email: c.email };
    try {
        console.log("  Subiendo foto de perfil...");
        const firmaFoto = await apiPost("/auth/registro/comercio/foto-firma", {});
        const fotoPerfilUrl = await subirACloudinary(path.join(DATOS_PRUEBA_DIR, c.fotoPerfil), firmaFoto.data);
        registro.fotoPerfilUrl = fotoPerfilUrl;
        console.log(`  Foto de perfil: ${fotoPerfilUrl}`);

        console.log("  Registrando comercio...");
        const body = {
            razonSocial: c.personaJuridica.razonSocial,
            cuit: c.personaJuridica.cuit,
            condicionIva: c.personaJuridica.condicionIva,
            tipoSociedad: c.personaJuridica.tipoSociedad,
            domicilioFiscal: `${c.direccion.calle} ${c.direccion.numero}, Río Grande`,
            fechaInicioActividades: c.personaJuridica.fechaInicioActividades,
            nombre: c.nombre,
            descripcion: c.descripcion,
            telefono: c.telefonoComercio,
            emailContacto: c.email,
            tipoComercio: c.tipoComercio,
            aceptaDelivery: true,
            aceptaRetiro: true,
            email: c.email,
            password: c.password,
            direccion: c.direccion,
            horarios: c.horarios,
            nombreRepresentante: c.representante.nombre,
            apellidoRepresentante: c.representante.apellido,
            dniRepresentante: c.representante.dni,
            telefonoRepresentante: c.representante.telefono,
            fechaNacimientoRepresentante: c.representante.fechaNacimiento,
            fotoPerfilUrl,
            redesSociales: [{ tipo: "INSTAGRAM", url: c.instagram }]
        };
        const registroResp = await apiPost("/auth/registro/comercio", body);
        registro.usuarioId = registroResp.data.id;
        registro.ok = true;
        console.log(`  Registrado OK. usuarioId=${registro.usuarioId}`);
    } catch (err) {
        registro.ok = false;
        registro.error = String(err.message || err);
        console.error(`  ERROR: ${registro.error}`);
    }
    resumen[idx] = registro;
}

await writeFile(resumenPath, JSON.stringify(resumen, null, 2));
console.log("\n=== RESUMEN ACTUALIZADO ===");
for (const r of resumen) {
    console.log(`${r.ok ? "OK  " : "FAIL"} ${r.key.padEnd(12)} usuarioId=${r.usuarioId ?? "-"} ${r.error ?? ""}`);
}
