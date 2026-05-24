// Cedar Foraging App — Gemini Vision Proxy
// Deploy on Render.com (free tier) — no credit card required
// This server forwards image identification requests to Google Gemini 2.0 Flash
// and handles CORS so the Cedar app can call it from any browser/webview

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// ── CORS — allow all origins (Cedar app needs this) ──
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Body parser — allow large base64 images (up to 20mb) ──
app.use(express.json({ limit: '20mb' }));

// ── Health check ──
app.get('/', (req, res) => {
  res.json({ status: 'Cedar proxy running', model: 'gemini-2.0-flash' });
});

// ── Main identification endpoint ──
app.post('/identify', async (req, res) => {
  const { image, mimeType, prompt, subject } = req.body;

  if (!image)    return res.status(400).json({ error: 'Missing image field (base64)' });
  if (!mimeType) return res.status(400).json({ error: 'Missing mimeType field' });

  // Validate mime type
  const VALID = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const safeMime = VALID.includes(mimeType) ? mimeType : 'image/jpeg';

  // Subject context injected into prompt
  const subjectContexts = {
    auto:     'You may be looking at any living organism — plant, fungus, animal, bird, insect, fish, or marine invertebrate.',
    plant:    'Focus: this is likely a plant (vascular plant, fern, moss, or alga). Examine leaf shape, venation, stem, flowers, fruit, and growth habit.',
    mushroom: 'Focus: this is likely a fungus or mushroom. Examine cap shape, cap color, gill attachment and color, stem features (ring, volva, color), spore print clues, and substrate.',
    animal:   'Focus: this is likely a mammal or reptile. Examine body size, fur/scale pattern, facial features, and any visible field marks.',
    bird:     'Focus: this is likely a bird. Examine plumage, bill shape, leg color, wing pattern, tail shape, and overall size.',
    insect:   'Focus: this is likely an insect, spider, or arthropod. Examine body segments, wing pattern, antennae, leg count, and coloration.',
    fish:     'Focus: this is likely a fish. Examine fin placement, scale pattern, lateral line, body shape, and coloration.',
    marine:   'Focus: this is likely a marine/intertidal organism — seaweed, shellfish, sea star, crab, nudibranch, etc.',
  };
  const subjectContext = subjectContexts[subject] || subjectContexts.auto;

  const PROMPT = `You are a world-class field naturalist, botanist, and mycologist with encyclopedic knowledge of Northern California species — flora and fauna. Your identifications are used in the field and must be precise, honest about uncertainty, and safety-focused.

${subjectContext}

Analyze this photo with maximum rigor. Consider every visible detail: color, texture, shape, size cues, habitat context, associated species, and diagnostic features.

CRITICAL RULES:
1. Never refuse — always return your best identification even if uncertain.
2. confidence_pct must be HONEST. Blurry/partial photos: 20-50%. Clear diagnostic photos: 75-95%. Never inflate.
3. Return up to 3 ranked alternative candidates.
4. For ANY mushroom/fungus: always fill lookalike_warning — there is almost always a dangerous lookalike.
5. For edible species: be specific about preparation requirements.
6. Foraging regions: only use marin, east, peninsula, santacruz, sonoma, mendocino, tahoe, foothills, lake, napa.

Respond with ONLY a raw JSON object — no markdown, no backticks, no text before or after:
{
  "common_name": "primary identification common name",
  "scientific_name": "Genus species",
  "family": "taxonomic family",
  "kingdom": "Plantae|Fungi|Animalia|Chromista|other",
  "category": "mushrooms|greens|berries|fruits|nuts|coastal|fish|wildlife|bird|insect|marine|other",
  "confidence_pct": 82,
  "confidence": "high|medium|low",
  "confidence_explanation": "one sentence — what features confirm or limit certainty",
  "edible": "yes|no|with_preparation|unknown|not_applicable",
  "edibility_detail": "specific edibility info — preparation needed, parts used, toxicity if any",
  "identification_notes": "3-4 sentences on key diagnostic features visible in THIS photo",
  "distinguishing_features": ["feature 1", "feature 2", "feature 3"],
  "lookalike_warning": "dangerous lookalike and exact distinguishing features, or null",
  "lookalike_scientific": "scientific name of lookalike, or null",
  "lookalike_danger": "deadly|toxic|mildly_toxic|non_toxic_but_confusing|null",
  "harvest_tip": "practical field harvest tip, or null",
  "safety_note": "critical safety info, or null",
  "habitat": "specific NorCal habitat description",
  "in_season_months": [0,1,2,10,11],
  "foraging_regions": ["marin", "peninsula"],
  "inat_search": "best iNaturalist search query",
  "wiki_slug": "Wikipedia_Article_Slug",
  "alternatives": [
    { "common_name": "second candidate", "scientific_name": "Genus species", "confidence_pct": 12, "why": "one sentence" },
    { "common_name": "third candidate",  "scientific_name": "Genus species", "confidence_pct": 5,  "why": "one sentence" }
  ]
}`;

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: safeMime, data: image } },
            { text: PROMPT }
          ]
        }],
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          maxOutputTokens: 1800
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      let errMsg = `Gemini HTTP ${response.status}`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.error?.message) errMsg = errJson.error.message;
      } catch(e) {}
      return res.status(502).json({ error: errMsg });
    }

    const data = await response.json();

    // Check for Gemini errors
    if (data.error) return res.status(502).json({ error: data.error.message || 'Gemini error' });

    // Check finish reason
    const candidate = data.candidates?.[0];
    if (!candidate) return res.status(502).json({ error: 'No candidates in Gemini response' });

    const finishReason = candidate.finishReason;
    if (finishReason === 'SAFETY')    return res.status(422).json({ error: 'Gemini safety filter — try a different photo angle' });
    if (finishReason === 'RECITATION') return res.status(422).json({ error: 'Gemini recitation block — please try again' });

    // Extract text
    let rawText = candidate.content?.parts?.[0]?.text || '';
    rawText = rawText.trim();
    if (!rawText) return res.status(502).json({ error: 'Gemini returned empty response' });

    // Robustly extract JSON
    let jsonStr = rawText;
    // Strip markdown fences
    jsonStr = jsonStr.replace(/^[\s\S]*?```json\s*/i, '').replace(/\s*```[\s\S]*$/, '');
    // Fallback: find raw object braces
    if (jsonStr === rawText) {
      const start = rawText.indexOf('{');
      const end   = rawText.lastIndexOf('}');
      if (start !== -1 && end > start) jsonStr = rawText.slice(start, end + 1);
    }

    let result;
    try {
      result = JSON.parse(jsonStr.trim());
    } catch(e) {
      return res.status(502).json({ error: 'JSON parse failed', raw: rawText.slice(0, 500) });
    }

    if (!result.common_name) {
      return res.status(502).json({ error: 'Response missing common_name', keys: Object.keys(result) });
    }

    res.json(result);

  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: err.message || 'Internal proxy error' });
  }
});

app.listen(PORT, () => {
  console.log(`Cedar proxy listening on port ${PORT}`);
});
