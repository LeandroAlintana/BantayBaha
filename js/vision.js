// ponytail: heuristic now, Gemini via Edge Function when key needed
export function heuristicVision(hazardType) {
  const t = hazardType.toLowerCase();
  if (t.includes('trash')) return { severity: 2, confidence: 0.7, rationale: 'Trash buildup — MEDIUM per fallback heuristic' };
  if (t.includes('standing') || t.includes('flood') || t.includes('clog')) return { severity: 3, confidence: 0.8, rationale: `${hazardType} — HIGH per fallback heuristic` };
  return { severity: 2, confidence: 0.5, rationale: 'Unknown type — default MEDIUM' };
}

// optional: call Edge Function when deployed (hides API key)
export async function callVisionEdge(supabase, photoBlob) {
  if (!photoBlob) return null;
  try {
    const b64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(photoBlob);
    });
    const { data, error } = await supabase.functions.invoke('vision-triage', { body: { image: b64, mimeType: photoBlob.type || 'image/jpeg' } });
    if (error) throw error;
    // expected { severity: 1|2|3, confidence, rationale }
    if (data?.severity >=1 && data?.severity <=3) return data;
    return null;
  } catch { return null; }
}
