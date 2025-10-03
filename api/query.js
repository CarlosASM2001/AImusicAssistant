import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "edge" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: cors });

  try {
    const form = await req.formData();
    const query = (form.get("query") || "").toString().slice(0, 1000);
    const file = form.get("image");

    const parts = [];
    if (query) {
      parts.push({
        text:
        `Rol: Eres un curador musical. Tarea: recomendar 3-5 artistas.
        Contexto del usuario: ${query}
        Criterio: letras, estética/imagen, subgénero, época, similares.
        Formato: lista breve con artista + por qué.`
      });
    }

    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const mimeType = file.type || "image/jpeg";
      const bytes = await file.arrayBuffer();
      const base64 = base64FromArrayBuffer(bytes);
      parts.push({ inlineData: { mimeType, data: base64 } });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction:
        "Responde en español y sé concreto. Prioriza artistas relevantes al criterio del usuario. Evita relleno.",
    });

    const resp = await model.generateContentStream({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.7 },
    });

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        for await (const chunk of resp.stream) {
          controller.enqueue(encoder.encode(chunk.text()));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { ...cors, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
    });
  } catch (err) {
    console.error(err);
    return new Response("Error interno", { status: 500, headers: cors });
  }
}

function base64FromArrayBuffer(ab) {
  const bytes = new Uint8Array(ab);
  // Prefer Web API btoa if available (e.g., Vercel Edge). Fallback to Node Buffer.
  if (typeof btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  throw new Error("No base64 encoder available in this environment");
}