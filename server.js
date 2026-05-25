// // Cedar Foraging App — Server + Gemini Vision Proxy
// Serves the Cedar app at / and proxies Gemini Vision at /identify

const express = require('express');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 3000;

// ── CORS ──
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Body parser — 20mb for base64 images ──
app.use(express.json({ limit: '20mb' }));

// ── Serve Cedar app ──
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'grove.html'));
});

// ── Health check ──
app.get('/health', (req, res) => {
  res.json({ status: 'Cedar proxy running', model: 'gemini-2.0-flash' });
});

// ── Gemini Vision proxy endpoint ──
app.post('/identify', async (req, res) => {
  const { image, mimeType, subject } = req.body;

  if (!image)    return res.status(400).json({ error: 'Missing image field (base64)' });
  if (!mimeType) return res.status(400).json({ error: 'Missing mimeType field' });

  const VALID   = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const safeMime = VALID.includes(mimeType) ? mimeType : 'image/jpeg';

  const subjectContexts = {
    auto:     'You may be looking at any living organism — plant, fungus, animal, bird, insect, fish, or marine invertebrate.',
    plant:    'Focus: likely a plant. Examine leaf shape, venation, stem, flowers, fruit, and growth habit.',
    mushroom: 'Focus: likely a fungus or mushroom. Examine cap shape, color, gill attachment and color, stem features (ring, volva), spore print clues, and substrate.',
    animal:   'Focus: likely a mammal or reptile. Examine body size, fur/scale pattern, facial features, and field marks.',
    bird:     'Focus: likely a bird. Examine plumage, bill shape, leg color, wing pattern, tail shape, and overall size.',
    insect:   'Focus: likely an insect, spider, or arthropod. Examine body segments, wing pattern, antennae, leg count, and coloration.',
    fish:     'Focus: likely a fish. Examine fin placement, scale pattern, lateral line, body shape, and coloration.',
    marine:   'Focus: likely a marine/intertidal organism — seaweed, shellfish, sea star, crab, nudibranch, etc.',
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
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: safeMime, data: image } },
          { text: PROMPT }
        ]}],
        generationConfig: { temperature: 0.2, topP: 0.8, maxOutputTokens: 1800 },
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
      try { const j = JSON.parse(errText); if (j.error?.message) errMsg = j.error.message; } catch(e) {}
      return res.status(502).json({ error: errMsg });
    }

    const data = await response.json();
    if (data.error) return res.status(502).json({ error: data.error.message || 'Gemini error' });

    const candidate = data.candidates?.[0];
    if (!candidate) return res.status(502).json({ error: 'No candidates in Gemini response' });

    const finishReason = candidate.finishReason;
    if (finishReason === 'SAFETY')     return res.status(422).json({ error: 'Safety filter triggered — try a different photo angle' });
    if (finishReason === 'RECITATION') return res.status(422).json({ error: 'Recitation block — please try again' });

    let rawText = candidate.content?.parts?.[0]?.text || '';
    rawText = rawText.trim();
    if (!rawText) return res.status(502).json({ error: 'Empty response from Gemini' });

    // Extract JSON robustly
    let jsonStr = rawText;
    jsonStr = jsonStr.replace(/^[\s\S]*?```json\s*/i, '').replace(/\s*```[\s\S]*$/, '');
    if (jsonStr === rawText) {
      const s = rawText.indexOf('{'), e = rawText.lastIndexOf('}');
      if (s !== -1 && e > s) jsonStr = rawText.slice(s, e + 1);
    }

    let result;
    try { result = JSON.parse(jsonStr.trim()); }
    catch(e) { return res.status(502).json({ error: 'JSON parse failed', raw: rawText.slice(0, 500) }); }

    if (!result.common_name) return res.status(502).json({ error: 'Response missing common_name', keys: Object.keys(result) });

    res.json(result);

  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});


// ── Falling Fruit proxy endpoint ──
// Forwards requests to fallingfruit.org/api/0.3/locations server-side
// so the Cedar app avoids CORS restrictions calling FF directly.
app.get('/ff', async (req, res) => {
  const { bounds, limit = 200 } = req.query;
  if (!bounds) return res.status(400).json({ error: 'Missing bounds parameter' });

  const FF_URL = `https://fallingfruit.org/api/0.3/locations?muni=false&locale=en&limit=${limit}&bounds=${encodeURIComponent(bounds)}`;

  try {
    const response = await fetch(FF_URL, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Cedar-Foraging-App/1.0' }
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Falling Fruit HTTP ${response.status}` });
    }

    const data = await response.json();
    res.json(data);

  } catch (err) {
    console.error('FF proxy error:', err);
    res.status(500).json({ error: err.message || 'Falling Fruit proxy error' });
  }
});

app.listen(PORT, () => console.log(`Cedar running on port ${PORT}`));

app.get('/calendar', (req, res) => {
  res.sendFile(path.join(__dirname, 'cedar-calendar-download.html'));
});
app.get('/cedar-foraging-calendar.ics', (req, res) => {
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="cedar-foraging-calendar.ics"');
  res.sendFile(path.join(__dirname, 'cedar-foraging-calendar.ics'));
});
