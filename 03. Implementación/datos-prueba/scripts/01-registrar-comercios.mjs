import path from "node:path";
import { writeFile } from "node:fs/promises";
import { COMERCIOS } from "./datos-fase1.mjs";
import { apiPost, subirACloudinary } from "./helpers-fase1.mjs";

const DATOS_PRUEBA_DIR = path.resolve(import.meta.dirname, "..");

const resumen = [];

for (const c of COMERCIOS) {
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
    resumen.push(registro);
}

console.log("\n\n=== RESUMEN REGISTRO ===");
for (const r of resumen) {
    console.log(`${r.ok ? "OK  " : "FAIL"} ${r.key.padEnd(12)} usuarioId=${r.usuarioId ?? "-"} ${r.error ?? ""}`);
}

const outPath = path.join(DATOS_PRUEBA_DIR, "scripts", "resumen-registro-fase1.json");
await writeFile(outPath, JSON.stringify(resumen, null, 2));
console.log(`\nResumen guardado en ${outPath}`);
