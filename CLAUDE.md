# Cedar — Claude Code Project Brief

## What This Is

Cedar is a personal Northern California foraging app built as a single-page HTML application served by a Node.js/Express server. The server also acts as a proxy for the Gemini Vision API and Falling Fruit API to bypass browser CORS restrictions.

**Live URL:** <https://cedar-proxy.onrender.com>  
**GitHub:** <https://github.com/Crewdude213/cedar-proxy>  
**Deployed on:** Render.com (free tier, auto-deploys on every push to `main`)

-----

## Project Structure

```
cedar/
├── server.js       # Express server — serves app + 3 API proxy routes
├── grove.html      # The entire Cedar app (single file, ~2900 lines)
├── package.json    # Node dependencies (express only)
├── .env.example    # Environment variable template
├── .env            # YOUR ACTUAL KEYS — never commit this
├── .gitignore
└── CLAUDE.md       # This file
```

-----

## Logo

The Cedar logo is an embroidered patch badge (oval squircle, landscape orientation).

**Visual anatomy:**

- **Shape:** Rounded squircle — soft superellipse corners, landscape
- **Border:** Thick cream/off-white outer edge, thin inner rule
- **Color bands (top → bottom):**
  - `#243018` — dark forest (header band, wordmark)
  - `#3A5828` — mid forest green
  - `#5A7A40` — sage green
  - `#7A9450` — pale ground/khaki
- **Icon:** Three stylized geometric cedar/pine trees in cream (`#EEE8D0`)
- **Typography:** Bold rounded serif — “Cedar” in top band, “Foraging & Harvest” in bottom band
- **Cream color:** `#EEE8D0` — used for all text, tree icon, and border

**In the app:** Rendered as an inline SVG in the `.hdr` header element (44×38px).
The SVG uses `clipPath id="badge-c"` to clip all band rects and tree polygons to the badge shape.
Do not remove or rename `badge-c` — it is the clip path ID used by all child elements.

**Key SVG structure:**

```html
<svg width="44" height="38" viewBox="0 0 110 95">
  <rect .../> <!-- cream background fill -->
  <clipPath id="badge-c">...</clipPath>
  <g clip-path="url(#badge-c)">
    <!-- 4 color band rects -->
    <!-- inner border rect (stroke only) -->
    <!-- "Cedar" text element -->
    <!-- <g fill="#EEE8D0"> tree polygons + rects </g> -->
    <!-- "Foraging & Harvest" text element -->
  </g>
  <!-- outer cream border rect (stroke only) -->
</svg>
```

-----

## Architecture

### Server (server.js)

Five routes:

- `GET /`                              → serves `grove.html` (the full app)
- `GET /health`                        → JSON status check
- `POST /identify`                     → Gemini 2.0 Flash Vision proxy (receives base64 image, returns species ID JSON)
- `GET /ff`                            → Falling Fruit API proxy (receives bounds query param, returns location array)
- `GET /calendar`                      → serves `cedar-calendar-download.html` (calendar download page)
- `GET /cedar-foraging-calendar.ics`   → serves the .ics calendar file with correct MIME type

### Frontend (grove.html)

A complete single-file app with no build step, no framework, vanilla JS + CSS.

**Five tabs:**

1. **Month View** — foraging calendar by month, filterable by category and region
1. **Species View** — all 124 species with year-round availability grid
1. **Harvest** — seasonal harvest tracker with marine advisories
1. **Map** — Leaflet.js map with My Spots (personal pins) + Falling Fruit community layer + ⬇ Import FF bulk import
1. **ID** — Species photo identification (flora + fauna) via Gemini 2.0 Flash Vision

**Key data:**

- `SPECIES` array — 124 Bay Area species with monthly availability, categories, regions, habitat, difficulty, lookalike warnings
- `MY_SPOTS` — stored in `localStorage` under key `cedar_pins_v1`
- `CAT_COLORS` — category color map used throughout
- Map tiles: OpenStreetMap via Leaflet CDN

**API calls in grove.html:**

- `POST /identify` — species photo ID (base64 image → JSON result)
- `GET /ff?bounds=...` — Falling Fruit locations for map layer
- `GET https://ipapi.co/json/` — IP geolocation for map centering (direct, no proxy needed)

-----

## Environment Variables

|Variable        |Description                     |Where to get it    |
|----------------|--------------------------------|-------------------|
|`GEMINI_API_KEY`|Google Gemini API key           |aistudio.google.com|
|`PORT`          |Server port (auto-set by Render)|Set automatically  |

**Current key name:** “Cedar API key” in Google AI Studio  
**Do NOT hardcode keys in grove.html or server.js** — always use `process.env.GEMINI_API_KEY` in server.js

-----

## Deployment (Render.com)

- **Auto-deploys** on every push to GitHub `main` branch
- Build command: `npm install`
- Start command: `node server.js`
- Environment variable `GEMINI_API_KEY` is set in Render dashboard → Environment tab
- Free tier spins down after 15min inactivity — first request takes ~50s to wake up

-----

## Species Data Structure

Each species in the `SPECIES` array:

```js
{
  name: "Golden Chanterelle",
  sci:  "Cantharellus californicus",
  cat:  "mushrooms",           // mushrooms|greens|berries|fruits|nuts|coastal|other
  group:"mushrooms",           // display group
  p:    [0,1,2,3,9,10,11],    // available months (0=Jan, 11=Dec)
  peak: [10,11,0,1],          // peak months
  regions: ["marin","east","peninsula","santacruz"],
  difficulty: "moderate",     // easy|moderate|hard
  habitat: "Oak woodland, mixed forest",
  lookalike: "Jack-o'-lantern mushroom (Omphalotus olivascens)",
  lookalike_danger: "toxic",
  notes: "The iconic Bay Area mushroom...",
  inat: "Cantharellus californicus"
}
```

-----

## My Spots Pin Structure

```js
{
  id:       "p_1716823445123",     // "p_" + Date.now() for user pins, "ff_..." for FF imports
  name:     "Golden Chanterelle spot",
  sci:      "Cantharellus californicus",
  cat:      "mushrooms",
  lat:      37.9234,
  lng:      -122.5123,
  notes:    "Under the big oak, north side of trail",
  public:   false,                 // true = visible to others (future feature)
  quality:  4,                     // 1-5 stars, 0 = unrated
  photos:   ["data:image/jpeg;base64,..."],  // base64 strings
  date:     "May 2026",
  harvests: [{ date: "Nov 2025", note: "Great haul, ~2lbs", quality: 5 }],
  fromFF:   false                  // true = imported from Falling Fruit
}
```

-----

## ID System (grove.html)

**Flow:**

1. User selects subject type (Auto/Plant/Mushroom/Animal/Bird/Insect/Fish/Marine)
1. User takes photo or selects from gallery → converted to base64
1. `runIDAnalysis()` POSTs `{image, mimeType, subject}` to `/identify`
1. Server forwards to Gemini 2.0 Flash with expert naturalist prompt
1. Returns JSON with: `common_name`, `scientific_name`, `confidence_pct`, `confidence`, `edible`, `lookalike_warning`, `in_season_months`, `alternatives[]`, etc.
1. `renderIDSuccess()` displays result with SVG confidence ring, season bar, local DB cross-reference, and external links

**Key functions:**

- `runIDAnalysis(base64, mimeType)` — main entry point
- `renderIDSuccess(result)` — renders full result card
- `renderIDError(msg)` — renders error state with troubleshooting tips
- `findLocalMatch(commonName, scientificName)` — cross-references against SPECIES array
- `jumpToSpecies(name)` — navigates to species in Month View

-----

## Map System (grove.html)

**Key functions:**

- `loadFFData()` — fetches Falling Fruit locations via `/ff` proxy for current map bounds
- `renderFFMarkers(locs)` — renders blue community markers on map
- `renderMyMarkers()` — renders amber personal pins
- `importFFSpots()` — bulk imports all Bay Area FF locations into My Spots (6-tile grid sweep, deduplicates by 50m proximity)
- `openPinSheet(pin)` — bottom drawer for personal pin details
- `openFFSheet(loc)` — bottom drawer for FF community location details
- `saveFFPin(loc)` — converts FF location to personal pin and saves
- `centerOnMe()` — browser geolocation → IP geolocation fallback chain

**Tile layer:** `L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')`

-----

## Known Issues / Future Work

- [ ] Render free tier cold start delay (~50s) — consider upgrading to $7/mo paid tier for instant response
- [ ] Map tile layer initialization — `L.tileLayer()` called without URL arg in initMapPanel (uses default OSM)
- [ ] Species count shows “124 species” in header — update if SPECIES array grows
- [ ] Falling Fruit import: FF API occasionally returns 429 rate limit — add retry logic
- [ ] Photos stored as base64 in localStorage — will hit storage limits with many large photos; migrate to IndexedDB
- [x] ID panel engine badge updated to “GEMINI 2.0”
- [ ] Marine advisories use Gemini knowledge (not live CDFW data) — consider scraping CDFW directly

-----

## Development Setup

```bash
# Clone
git clone https://github.com/Crewdude213/cedar-proxy.git cedar
cd cedar

# Install
npm install

# Create .env
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# Run locally
npm run dev
# App at http://localhost:3000
```

-----

## Design Tokens (CSS variables in grove.html)

```css
--bg:      #111315   /* main background */
--bg2:     #161A1D   /* panel backgrounds */
--surface: #1C1F23   /* elevated surfaces */
--card:    #262A30   /* card backgrounds */
--border:  #323842   /* borders */
--grid:    #2F3740   /* subtle dividers */
--text:    #F5F7FA   /* primary text */
--text2:   #A1AAB6   /* secondary text */
--text3:   #6B7280   /* tertiary/placeholder */
--amber:   #D97706   /* primary action color — amber/gold */
--amber-h: #F59E0B   /* amber hover */
--blue:    #38BDF8   /* links, info */
--green:   #22C55E   /* success/in-season */
--warn:    #FBBF24   /* warnings */
--err:     #EF4444   /* errors */
--inp:     #20252B   /* input backgrounds */
--unsel:   #2A3037   /* unselected states */
--r:       10px      /* border radius */
--r-sm:    7px       /* small border radius */
```