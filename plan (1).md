# ClaimShield — Frontend (Person C) Plan

Role: Frontend. Consumes Person B's FastAPI backend, using Person A's case corpus. Reference: `claimshield_demo.html` (visual/UX reference only — hardcoded JS scoring in it must NOT ship).

## What changed vs. the first draft, and why

- **Dropped the Featherless-direct-call mode.** The task brief only asks for "React/Next calling B's actual API instead of the hardcoded JS scoring" + an offline fallback. A third live LLM provider, its own prompt set, and a settings modal to configure it is scope the brief never asked for, and every hour spent on it is an hour not spent on the 4 priority screens. If there's time left after the 4 screens + fallback are solid, it can come back as a stretch — not before.
- **Made "Demo Mode" automatic, not just a manual toggle.** The brief's own words are "nothing kills a demo like a judge thinking it's frozen" and B's status is "untested against live API." Treat the backend as likely-to-fail during the actual demo window: the app should detect a failed/slow call and silently drop into offline mode rather than requiring you to notice and click a toggle mid-demo.
- **Fixed the file paths.** The original plan used absolute Windows paths (`file:///c:/Users/ABHI/...`) which won't mean anything to an agent working in a fresh repo. Everything below is relative to the frontend project root.
- **Added an explicit data contract section.** B's `/extract` endpoint is the "riskiest single integration point" per the brief, and you can't build screens 1–2 against an API that doesn't exist yet. This plan defines the exact request/response shape frontend code should assume *now* (derived from the product spec's own schema), so you can build against a local mock and swap in B's real base URL later with minimal rework.
- **Tied the build order to real time pressure.** Added checkpoints so you always have something demoable, in the same priority order the brief already gave you.
- **Added the judge-facing trust requirements as UI requirements**, not just copy — the spec is explicit that the product must never look like it's inventing law, cases, or win probabilities.

---

## 1. Tech Stack

- **Vite + React + TypeScript** — fast HMR, matters when you're iterating against a flaky backend under time pressure.
- **Plain CSS with CSS variables** (no Tailwind config to fight with, no component library dependency risk). One `src/index.css` with the design tokens below.
- **lucide-react** for icons. Skip canvas-confetti and anything else non-essential — nice-to-have, add only after all 4 screens work end to end.

```
Frontend/
├── src/
│   ├── types/claim.ts
│   ├── data/cases.json          (copy of Person A's corpus, refreshed as it grows)
│   ├── data/demoFixtures.ts     (pre-baked hero + insufficient-info responses)
│   ├── services/api.ts          (single entry point, see §4)
│   ├── services/similarityEngine.ts  (offline-mode fallback scoring only)
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── StatusBadge.tsx      (Live Backend | Offline Demo, auto-detected)
│   │   └── screens/
│   │       ├── SimilarCasesScreen.tsx    (Priority 1)
│   │       ├── CaseDetailScreen.tsx      (Priority 2)
│   │       ├── UploadScreen.tsx          (Priority 3)
│   │       ├── FingerprintScreen.tsx     (Priority 3)
│   │       └── AppealScreen.tsx          (Priority 4)
│   └── App.tsx                  (5-screen router / step state machine)
├── .env.local                   (VITE_API_BASE_URL=http://localhost:8000)
└── package.json
```

---

## 2. Design Tokens (`src/index.css`)

```css
:root {
  --navy: #0B132B;
  --slate: #1C2541;
  --cyan: #48CAE4;
  --favorable: #10B981;   /* policyholder favorable, appeal allowed, settlement */
  --partial: #F59E0B;     /* partial relief, remanded, appeal pending, unknown */
  --unfavorable: #EF4444; /* insurer favorable, complaint dismissed, appeal dismissed */
}
```

Outcome → color mapping (spec §10 lists 9 outcome categories — don't hardcode a switch per category, bucket them):

| Bucket | Outcome categories | Color |
|---|---|---|
| Favorable | Policyholder favorable, Appeal allowed, Settlement | `--favorable` |
| Partial / uncertain | Partial relief, Claim remanded, Appeal pending, Unknown | `--partial` |
| Unfavorable | Insurer favorable, Complaint dismissed, Appeal dismissed | `--unfavorable` |

Put this mapping in one shared `getOutcomeBucket(outcome: string)` helper in `types/claim.ts` — every screen imports it, so a 10th outcome category showing up in A's data doesn't require touching 4 components.

---

## 3. Data Contract (`src/types/claim.ts`)

Mirror the product spec's actual schema (spec §25 Case Dataset Schema), not a guessed one:

```typescript
export type OutcomeCategory =
  | "Policyholder favorable" | "Insurer favorable" | "Partial relief"
  | "Complaint dismissed" | "Claim remanded" | "Settlement"
  | "Appeal pending" | "Appeal allowed" | "Appeal dismissed" | "Unknown";

export interface HistoricalCase {
  case_id: string;
  case_title: string;
  court: string;
  jurisdiction: string;
  case_number: string;
  date: string;
  insurer: string;
  insurance_type: "health";
  issue: string;
  denial_reason: string;
  policy_clause: string;
  facts: string;
  policyholder_argument: string;
  insurer_argument: string;
  court_reasoning: string;
  decision: string;
  outcome_category: OutcomeCategory;
  relief: string;
  case_status: string;
  source_url: string;
  source_document?: string;
  source_page_or_paragraph?: string;
}

export interface ExtractedFingerprint {
  insurer: string;
  insurance_type: "health";
  claim_amount: number;
  rejection_reason: string;
  condition: string;
  policy_start_date: string;
  hospitalization_date: string;
  claim_status: string;
  relevant_clause?: string;
  court_level?: string;
  // per field, so Fingerprint screen can show confidence pills + quoted snippet
  field_confidence?: Record<string, "high" | "medium" | "low">;
  field_source_quote?: Record<string, string>;
}

export interface SimilarCaseMatch {
  case: HistoricalCase;
  similarity_score: number;       // 0–100
  score_breakdown: {
    legal_issue: number; policy_clause: number; insurer: number;
    factual: number; claim_medical: number; court_level: number;
  };
  match_reasons: string[];        // ["Same insurer", "Same denial category (PED)"]
}

export type AssessmentLabel =
  | "Potentially Strong" | "Potentially Challengeable"
  | "Likely Consistent With Policy" | "Insufficient Information";

export interface CaseIntelligence {
  assessment: AssessmentLabel;
  assessment_rationale: string;     // must cite retrieved cases, never a % probability
  why_outcome_happened: { point: string; source_case_id: string }[];
  evidence_you_have: string[];
  missing_evidence: { item: string; why_it_matters: string }[];
  likely_insurer_arguments: { argument: string; what_can_address_it: string[] }[];
  grounding_note: string;            // e.g. "Based on 17 retrieved cases" or explicit insufficiency note
}

export interface AppealResult {
  letter_markdown: string;
  cited_case_ids: string[];         // must be a subset of retrieved case_ids — never invented
  action_plan: { step: number; label: string; detail: string }[];
}
```

---

## 4. API Service Layer (`src/services/api.ts`)

Two modes only: **Live** (Person B's FastAPI) and **Offline Demo** (local fixtures + `similarityEngine.ts`). Mode selection is automatic:

```typescript
async function callBackend<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000); // fail fast, don't hang the demo
  try {
    const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Backend ${path} returned ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}
```

Public functions, each tries live backend first and falls back to the offline path on **any** failure (network error, timeout, non-200, or JSON that fails to parse against the expected shape) — never let a raw error reach a screen:

- `extractClaim(policyText, rejectionText) → ExtractedFingerprint` — POST `/extract`
- `findSimilarCases(fingerprint) → SimilarCaseMatch[]` — POST `/similar-cases`
- `getCaseIntelligence(fingerprint, matchedCaseId) → CaseIntelligence` — POST `/case-intelligence`
- `generateAppeal(fingerprint, precedentIds, missingEvidence) → AppealResult` — POST `/appeal`

On fallback, set a global `mode` signal (`"live" | "offline"`) that `StatusBadge.tsx` reads — this is the only place mode is tracked; screens don't need to know which path answered them.

**Coordinate with Person B once, early:** confirm the 4 request/response shapes above match what `main.py` actually returns. If they've drifted, adjust `api.ts`'s parsing, not every screen — that's the whole point of centralizing it here.

---

## 5. Build Order (matches the brief's fallback priority — always keep something demoable)

1. **Screen 3 — Similar Cases (hero).** Aggregate outcome banner, filters (outcome / insurer / rejection category), match cards with score breakdown accordion + reason tags + outcome badge (color from §2 bucket mapping).
2. **Screen 4 — Case Detail.** Side-by-side facts, "Why outcome happened" (cited to source case, not asserted), Evidence Gap (green have-list / amber missing-list with reasons), Likely Insurer Counterarguments + rebuttal evidence, and an **Assessment badge** using the 4 `AssessmentLabel` values from §3 — never a percentage.
3. **Screens 1–2 — Upload / Fingerprint.** Text inputs (paste is fine, real file parsing is B's/A's problem, not yours) + two demo buttons: **"Pre-fill Hero Case"** and **"Load Insufficient-Info Case"** (this is your answer to Judge Q1 — make sure it's wired to a real fixture, not just claimed). Fingerprint screen shows confidence pills + source-quote badges + editable overrides before search.
4. **Screen 5 — Appeal + Action Plan.** Rendered markdown letter, cited precedents only from `cited_case_ids`, copy/download/print, numbered action plan (Internal Grievance → Ombudsman/Bima Bharosa → Consumer Commission).

Loading state: every one of the four API calls gets a skeleton/spinner with a short label ("Finding similar cases…") — this was already flagged as make-or-break for the demo, keep it non-negotiable.

---

## 6. Offline Demo Fixtures (`src/data/demoFixtures.ts`)

Two pre-baked, fully-populated response sets matching the §3 types exactly:

- **Hero case**: ABC Insurance / diabetes PED denial, with a realistic spread of similar cases and outcomes (mirrors spec's 17-cases / 9-favorable example).
- **Insufficient-info case**: one case where `assessment = "Insufficient Information"` and `grounding_note` explicitly says why (e.g., too few comparable cases retrieved, or key fingerprint fields missing) — this must render correctly, not just exist as data.

These are what "Pre-fill Hero Case" and "Load Insufficient-Info Case" load directly, bypassing the API entirely — zero-latency, no dependency on B's server being up.

---

## 7. Judge-facing Trust Requirements (build these into the UI, not just the docs)

- Never render a numeric win probability anywhere.
- Every "why it won/lost" bullet must show which source case it came from (case title or citation), not float unattributed.
- Appeal letter's cited cases must be visibly listed and traceable to `cited_case_ids` — no case name should appear in the letter body that isn't in that list.
- The Insufficient-Information state must look intentional (a clear badge/section), not like an empty or broken screen.
- A one-line disclaimer near the assessment badge: decision support, not a legal determination.

---

## 8. Verification

- `npm run build` — zero TS errors.
- Manual walkthrough: Pre-fill Hero Case → Fingerprint → Similar Cases → Case Detail → Appeal, fully offline (dev server up, backend killed) — must work end to end with no console errors and no infinite spinners.
- Kill the backend mid-session and confirm the status badge flips to "Offline Demo" and the in-flight screen still resolves within ~6s instead of hanging.
- Load Insufficient-Info Case and confirm Screen 4 shows the Insufficient Information assessment correctly, not a crash or blank state.

## 9. Cut list if time runs out (in order)

1. Featherless/any third live-LLM mode (already deferred above).
2. Print-to-PDF on the Appeal screen (copy/download markdown is enough).
3. Editable field overrides on Fingerprint screen (read-only extraction is enough).
4. Score-breakdown accordion animation — a static breakdown is fine.

Never cut: the offline fallback, the two demo buttons, or the Insufficient-Information case — those three are your actual insurance policy for the demo itself.
