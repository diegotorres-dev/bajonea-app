import { readFile } from "node:fs/promises";
import path from "node:path";
import { API_BASE } from "./datos-fase1.mjs";

export async function apiPost(pathSegment, body, token) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${pathSegment}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(`POST ${pathSegment} -> ${res.status}: ${JSON.stringify(json)}`);
    }
    return json;
}

export async function subirACloudinary(filePath, firmaData) {
    const buffer = await readFile(filePath);
    const form = new FormData();
    form.append("file", new Blob([buffer]), path.basename(filePath));
    form.append("api_key", firmaData.apiKey);
    form.append("timestamp", String(firmaData.timestamp));
    form.append("signature", firmaData.signature);
    form.append("folder", firmaData.folder);
    form.append("upload_preset", firmaData.uploadPreset);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${firmaData.cloudName}/image/upload`, {
        method: "POST",
        body: form
    });
    const json = await res.json();
    if (!res.ok) {
        throw new Error(`Cloudinary upload falló para ${filePath}: ${JSON.stringify(json)}`);
    }
    return json.secure_url;
}
