// ponytail: heuristic now, Gemini via Edge Function when key needed
// spec v2.1 §4.7/§4.9: deterministic severity (trash=MEDIUM else HIGH), AI only observes — never blocks submit
export function heuristicVision(hazardType) {
  const t = hazardType.toLowerCase();
  const base = t.includes('trash')
    ? { severity: 2, hazard_type: 'trash_buildup', rationale: 'Trash buildup — MEDIUM per fallback heuristic', confidence: 0.7 }
    : t.includes('standing') || t.includes('flood') || t.includes('clog')
    ? { severity: 3, hazard_type: 'clogged_drain', rationale: `${hazardType} — HIGH per fallback heuristic`, confidence: 0.8 }
    : { severity: 2, hazard_type: 'none', rationale: 'Unknown type — default MEDIUM', confidence: 0.5 };
  return {
    ...base,
    quarantined: false,
    moderation_state: 'NEEDS_REVIEW',
    hazard_match: 'possible',
    evidence_strength: 'weak',
    image_quality: 'usable',
    possible_spam: 'no_evidence',
    possible_duplicate: 'no_evidence',
    observations: [base.rationale],
    needs_human_review: true,
  };
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
