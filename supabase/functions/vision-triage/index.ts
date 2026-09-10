const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

type HazardMatch = "clear" | "possible" | "none";
type EvidenceStrength = "strong" | "moderate" | "weak";
type ImageQuality = "usable" | "poor" | "unusable";
type ModerationSignal = "no_evidence" | "possible" | "clear";
interface VisionObservation {
  hazard_match: HazardMatch;
  hazard_type: "clogged_drain" | "trash_buildup" | "standing_water" | "none";
  evidence_strength: EvidenceStrength;
  image_quality: ImageQuality;
  possible_spam: ModerationSignal;
  possible_duplicate: ModerationSignal;
  observations: string[];
  needs_human_review: boolean;
}

function heuristicFallback(): VisionObservation & { severity: number; confidence: number; rationale: string; quarantined: boolean; moderation_state: string } {
  // legacy fields kept for backward compat until app.js migrates to observations
  return {
    hazard_match: "possible",
    hazard_type: "none",
    evidence_strength: "weak",
    image_quality: "usable",
    possible_spam: "no_evidence",
    possible_duplicate: "no_evidence",
    observations: ["Vision unavailable — heuristic fallback"],
    needs_human_review: true,
    severity: 2, confidence: 0.5, rationale: "Vision unavailable — heuristic fallback (MEDIUM)", quarantined: false, moderation_state: "NEEDS_REVIEW"
  };
}

function validateObservation(o: Record<string, unknown>): VisionObservation {
  const hm = String(o.hazard_match ?? "").toLowerCase();
  const ht = String(o.hazard_type ?? "").toLowerCase();
  const es = String(o.evidence_strength ?? "").toLowerCase();
  const iq = String(o.image_quality ?? "").toLowerCase();
  const ps = String(o.possible_spam ?? "").toLowerCase();
  const pd = String(o.possible_duplicate ?? "").toLowerCase();
  const obs = Array.isArray(o.observations) ? o.observations.map(String).filter(Boolean).slice(0,5) : [];
  const nhr = Boolean(o.needs_human_review);
  if (!["clear","possible","none"].includes(hm)) throw new Error("invalid hazard_match");
  if (!["clogged_drain","trash_buildup","standing_water","none"].includes(ht)) throw new Error("invalid hazard_type");
  if (!["strong","moderate","weak"].includes(es)) throw new Error("invalid evidence_strength");
  if (!["usable","poor","unusable"].includes(iq)) throw new Error("invalid image_quality");
  if (!["no_evidence","possible","clear"].includes(ps)) throw new Error("invalid possible_spam");
  if (!["no_evidence","possible","clear"].includes(pd)) throw new Error("invalid possible_duplicate");
  return { hazard_match: hm as HazardMatch, hazard_type: ht as HazardMatch extends string ? VisionObservation["hazard_type"] : never, evidence_strength: es as EvidenceStrength, image_quality: iq as ImageQuality, possible_spam: ps as ModerationSignal, possible_duplicate: pd as ModerationSignal, observations: obs.length ? obs : ["No observations"], needs_human_review: nhr };
}

function moderationState(o: VisionObservation): "NORMAL" | "NEEDS_REVIEW" | "QUARANTINED" {
  // spec v2.1 §4.3: deterministic rules, not LLM confidence
  if (o.hazard_match === "none" && o.possible_spam === "clear") return "QUARANTINED";
  if (o.hazard_match === "clear" && o.image_quality !== "unusable" && o.possible_spam !== "clear") return "NORMAL";
  if (o.hazard_match === "possible" || o.evidence_strength === "weak" || o.possible_spam === "possible" || o.image_quality === "poor" || o.needs_human_review) return "NEEDS_REVIEW";
  if (o.hazard_match === "none") return "QUARANTINED";
  return "NEEDS_REVIEW";
}

function observationToLegacy(o: VisionObservation) {
  // deterministic mapping: AI observes, app decides (spec v2.1 §4.3/4.7) — no confidence as probability
  const state = moderationState(o);
  const quarantined = state === "QUARANTINED";
  let severity: number;
  if (quarantined) severity = 1;
  else if (o.hazard_type === "standing_water" || o.hazard_type === "clogged_drain") severity = 3;
  else if (o.hazard_type === "trash_buildup") severity = 2;
  else if (o.hazard_match === "clear" && o.evidence_strength === "strong") severity = 3;
  else if (o.hazard_match === "possible" || o.evidence_strength === "weak") severity = 2;
  else severity = 1;
  const rationale = o.observations[0] ?? `${o.hazard_match} ${o.hazard_type} ${o.evidence_strength}`;
  const confidence = o.evidence_strength === "strong" ? 0.85 : o.evidence_strength === "moderate" ? 0.65 : 0.45;
  return { severity, confidence, rationale, quarantined, moderation_state: state };
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
  const modelHint = Deno.env.get("VISION_MODEL") ?? "";
  const prompt = `You are BantayBahaAI visual triage for campus flood prevention. Observe this sanitized image and return ONLY JSON with schema: {"hazard_match":"clear|possible|none","hazard_type":"clogged_drain|trash_buildup|standing_water|none","evidence_strength":"strong|moderate|weak","image_quality":"usable|poor|unusable","possible_spam":"no_evidence|possible|clear","possible_duplicate":"no_evidence|possible|clear","observations":["brief evidence sentence"],"needs_human_review":false}. Rules: hazard_match=clear only if hazard visibly covers path/drain; possible if ambiguous; none if no supported hazard. evidence_strength reflects how clearly hazard is visible. possible_spam=clear for selfie/meme/animal/unrelated. Do not identify persons. Do not output severity or confidence.`;
  // ponytail: try stable models in order, 404 → next (VISION_MODEL env overrides)
  const geminiModels = Deno.env.get("VISION_MODEL") ? [Deno.env.get("VISION_MODEL")!] : ["gemini-flash-latest", "gemini-pro-latest", "gemini-flash-lite-latest", "gemini-3.6-flash", "gemini-3.5-flash"];
  for (const model of geminiModels) {
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
    // new schema: validate observation, then map deterministically to legacy fields
    if (out.hazard_match !== undefined) {
      const obs = validateObservation(out);
      const legacy = observationToLegacy(obs);
      return { ...obs, ...legacy };
    }
    // backward compat: old severity/confidence shape
    let sevRaw: unknown = out.severity;
    let severity: number;
    if (typeof sevRaw === "string") {
      const s = sevRaw.toUpperCase().trim();
      severity = s === "LOW" ? 1 : s === "MEDIUM" ? 2 : s === "HIGH" ? 3 : Number(s);
    } else severity = Number(sevRaw);
    const confidence = Number(out.confidence), rationale = String(out.rationale ?? "").trim();
    if (![1,2,3].includes(severity) || !Number.isFinite(confidence) || confidence<0 || confidence>1 || !rationale) throw new Error("Gemini invalid shape");
    const quarantined = severity === 1 && /spam|irrelevant|quarantine|no hazard|no risk|unrelated|selfie|meme|cat|animal/i.test(rationale);
    return { severity, confidence, rationale, quarantined, hazard_match: quarantined ? "none" : severity===3 ? "clear" : "possible", hazard_type: "none", evidence_strength: severity===3?"strong":severity===2?"moderate":"weak", image_quality: "usable", possible_spam: quarantined?"clear":"no_evidence", possible_duplicate: "no_evidence", observations: [rationale], needs_human_review: quarantined || severity===1 } as ReturnType<typeof observationToLegacy> & VisionObservation;
  }
  throw new Error("Gemini 404 all models");
}

async function tryOpenRouter(image: string, mimeType: string) {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY missing");
  const dataUrl = image.startsWith("data:") || image.startsWith("http") ? image : `data:${mimeType};base64,${image}`;
  const prompt = `You are BantayBahaAI visual triage. Return ONLY JSON {"hazard_match":"clear|possible|none","hazard_type":"clogged_drain|trash_buildup|standing_water|none","evidence_strength":"strong|moderate|weak","image_quality":"usable|poor|unusable","possible_spam":"no_evidence|possible|clear","possible_duplicate":"no_evidence|possible|clear","observations":["brief evidence"],"needs_human_review":false}. Mark selfie/meme/animal/unrelated as possible_spam=clear and hazard_match=none. Do not output severity.`;
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
    if (out.hazard_match !== undefined) {
      const obs = validateObservation(out);
      const legacy = observationToLegacy(obs);
      return { ...obs, ...legacy };
    }
    const relevant = Boolean(out.relevant), spam = Boolean(out.spam), category = String(out.category ?? "irrelevant"), confidence = Number(out.confidence), reason = String(out.reason ?? out.rationale ?? "").trim();
    if (!Number.isFinite(confidence)) throw new Error("OpenRouter invalid confidence");
    if (spam || !relevant || category === "irrelevant") return { severity: 1, confidence: Math.min(0.9, confidence || 0.7), rationale: `Quarantine: ${reason || "irrelevant/spam"}`, quarantined: true, hazard_match: "none", hazard_type: "none", evidence_strength: "weak", image_quality: "usable", possible_spam: "clear", possible_duplicate: "no_evidence", observations: [reason || "irrelevant/spam"], needs_human_review: true } as ReturnType<typeof observationToLegacy> & VisionObservation;
    if (["flooding","standing_water","canal","drainage","sewer"].includes(category)) {
      const sev = category === "flooding" || category === "standing_water" || category === "canal" ? 3 : 2;
      return { severity: sev, confidence: confidence || 0.7, rationale: `${category}: ${reason}`, quarantined: false, hazard_match: "clear", hazard_type: category==="standing_water"||category==="flooding"?"standing_water":category==="canal"?"standing_water":"clogged_drain", evidence_strength: sev===3?"strong":"moderate", image_quality: "usable", possible_spam: "no_evidence", possible_duplicate: "no_evidence", observations: [reason], needs_human_review: false } as ReturnType<typeof observationToLegacy> & VisionObservation;
    }
    return { severity: 2, confidence: confidence || 0.5, rationale: reason || "Other — MEDIUM", quarantined: false, hazard_match: "possible", hazard_type: "none", evidence_strength: "weak", image_quality: "usable", possible_spam: "possible", possible_duplicate: "no_evidence", observations: [reason || "Other"], needs_human_review: true } as ReturnType<typeof observationToLegacy> & VisionObservation;
  }
  throw new Error("OpenRouter 402 all models");
  // unreachable — handled in loop above
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  // demo insurance: USE_MOCK_VISION=true forces heuristic (spec §B.1)
  if ((Deno.env.get("USE_MOCK_VISION") ?? "").toLowerCase() === "true") {
    return json({ ...heuristicFallback(), _source: "mock" });
  }
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
