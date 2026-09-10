const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

function heuristicFallback() {
  return { severity: 2, confidence: 0.5, rationale: "Vision unavailable — heuristic fallback (MEDIUM)" };
}

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Invalid JSON");
    return JSON.parse(m[0]);
  }
}

async function tryWithRetry<T>(fn: () => Promise<T>, tries = 2): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!/5\d\d|429|empty|invalid|JSON/i.test(msg)) throw e;
      if (i < tries - 1) await new Promise(r => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw last;
}

async function tryGemini(image: string, mimeType: string) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY missing");
  const prompt = `You are BantayBahaAI visual triage for campus flood prevention. Classify this image for flood-related hazards: Clogged Drain/Grate, Trash Buildup, Standing Water/Flooding. Return ONLY JSON {"severity":"LOW|MEDIUM|HIGH","confidence":0.0,"rationale":"brief"}. HIGH = standing water/flooding or clogged drain with blockage/flood risk. MEDIUM = trash buildup or moderate debris. LOW = minor/no risk or irrelevant/spam. If unclear use safest severity and lower confidence. Do not identify persons.`;
  // ponytail: try stable models in order, 404 → next
  for (const model of ["gemini-flash-latest", "gemini-pro-latest", "gemini-flash-lite-latest", "gemini-3.6-flash", "gemini-3.5-flash"]) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: image } }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
    });
    if (r.status === 404) continue;
    if (!r.ok) throw new Error(`Gemini ${r.status} ${model}`);
    const j = await r.json();
    const text = (j?.candidates?.[0]?.content?.parts as { text?: string }[] | undefined)?.map(p => p.text ?? "").join("").trim();
    if (!text) throw new Error("Gemini empty");
    const out = extractJson(text) as Record<string, unknown>;
    let sevRaw: unknown = out.severity;
    let severity: number;
    if (typeof sevRaw === "string") {
      const s = sevRaw.toUpperCase().trim();
      severity = s === "LOW" ? 1 : s === "MEDIUM" ? 2 : s === "HIGH" ? 3 : Number(s);
    } else severity = Number(sevRaw);
    const confidence = Number(out.confidence), rationale = String(out.rationale ?? "").trim();
    if (![1,2,3].includes(severity) || !Number.isFinite(confidence) || confidence<0 || confidence>1 || !rationale) throw new Error("Gemini invalid shape");
    return { severity, confidence, rationale };
  }
  throw new Error("Gemini 404 all models");
}

async function tryOpenRouter(image: string, mimeType: string) {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY missing");
  const dataUrl = image.startsWith("data:") || image.startsWith("http") ? image : `data:${mimeType};base64,${image}`;
  const prompt = `You are classifying citizen flood-report photos. Determine if useful for flooding/drainage/sewer/canal/blocked drains/standing water. Return ONLY JSON {"relevant":true,"spam":true,"category":"drainage|sewer|canal|flooding|standing_water|other|irrelevant","confidence":0.0,"reason":"short"}. Mark animal/meme/selfie/unrelated as spam or irrelevant. Do not assume flood merely because outdoors.`;
  // ponytail: free model first, 402 → paid fallback
  for (const model of ["openrouter/free","openrouter/auto"]) {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: dataUrl } }] }],
      }),
    });
    if (r.status === 402) continue;
    if (!r.ok) throw new Error(`OpenRouter ${r.status} ${model}`);
    const j = await r.json();
    const content = typeof j?.choices?.[0]?.message?.content === "string" ? j.choices[0].message.content : Array.isArray(j?.choices?.[0]?.message?.content) ? j.choices[0].message.content.map((p: {text?:string})=>p.text??"").join("") : "";
    if (!content) throw new Error("OpenRouter empty");
    const out = extractJson(content) as Record<string, unknown>;
    const relevant = Boolean(out.relevant), spam = Boolean(out.spam), category = String(out.category ?? "irrelevant"), confidence = Number(out.confidence), reason = String(out.reason ?? out.rationale ?? "").trim();
    if (!Number.isFinite(confidence)) throw new Error("OpenRouter invalid confidence");
    if (spam || !relevant || category === "irrelevant") return { severity: 1, confidence: Math.min(0.9, confidence || 0.7), rationale: `Quarantine: ${reason || "irrelevant/spam"}` };
    if (["flooding","standing_water","canal","drainage","sewer"].includes(category)) {
      const sev = category === "flooding" || category === "standing_water" || category === "canal" ? 3 : 2;
      return { severity: sev, confidence: confidence || 0.7, rationale: `${category}: ${reason}` };
    }
    return { severity: 2, confidence: confidence || 0.5, rationale: reason || "Other — MEDIUM" };
  }
  throw new Error("OpenRouter 402 all models");
  // unreachable — handled in loop above
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    const image = typeof body?.image === "string" ? body.image : "";
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "image/jpeg";
    if (!image) return json({ error: "image required" }, 400);
    if (!/^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(mimeType)) return json({ error: "Unsupported image type" }, 400);
    if (image.length > 14_000_000) return json({ error: "Image too large" }, 413);

    let result: unknown = null;
    let source = "heuristic";
    try { result = await tryWithRetry(() => tryGemini(image, mimeType), 2); source = "gemini"; } catch (e) { console.error("gemini fail", e instanceof Error ? e.message : e); }
    if (!result) {
      try { result = await tryWithRetry(() => tryOpenRouter(image, mimeType), 2); source = "openrouter"; } catch (e) { console.error("openrouter fail", e instanceof Error ? e.message : e); }
    }
    if (!result) { result = heuristicFallback(); source = "heuristic"; }
    // ponytail: gemini → openrouter → heuristic
    return json({ ...(result as object), _source: source });
  } catch (e) {
    console.error("vision-triage error", e instanceof Error ? e.message : e);
    return json(heuristicFallback(), 200);
  }
});
