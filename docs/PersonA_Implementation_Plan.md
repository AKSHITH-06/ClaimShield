# ClaimShield — Dataset & Domain Implementation Plan (Person A)

**Owner:** Person A (dataset/domain)
**Status at start:** ~80% done per last check-in — 16 cases in a personal working `cases.json`.
**Critical sync issue — read this before doing anything else.**

---

## ⚠️ 0. Sync With Backend First — Do Not Skip

Backend (Person B) discovered an **existing scaffold** already in the repo at `backend/app/cases.json`, separate from whatever file you've been building locally. That scaffold currently has **7 stub cases** (agent-written, not yet real), and backend has already:
- Added a `claim_status` field and an `insufficient_information` marker case to it
- Wired `main.py` and `similarity.py` to read from `backend/app/cases.json` specifically (not a root-level file)

**Before you write a single case, confirm with Person B:**
1. Is `backend/app/cases.json` the file you should be editing directly, or does your 16-case file get merged/replace it?
2. What are the exact current field names in their schema? (They renamed `models.py` → `schema.py`, and added `claim_status` — your case objects must match this exactly or extraction/matching will silently break.)
3. Which `case_id` did backend already mark as `insufficient_information`? Don't duplicate or contradict it — confirm and either keep it or deliberately replace it with your own, but not both existing at once.

**Do not just drop your 16-case file in and overwrite theirs without checking field-for-field first.** This is the single most likely place for a silent integration break before demo.

---

## 1. Target Schema (confirm exact field names against `backend/app/schema.py` before writing cases — this is illustrative, not authoritative)

```json
{
  "case_id": "CASE_XXX",
  "insurer": "string",
  "insurance_type": "health",
  "claim_amount": 0,
  "rejection_reason": "ped_non_disclosure | waiting_period | policy_exclusion | documentation | partial_settlement",
  "condition": "string",
  "policy_start_date": "YYYY-MM-DD",
  "hospitalization_date": "YYYY-MM-DD",
  "claim_status": "rejected | partial",
  "outcome": "policyholder_favorable | insurer_favorable | partial_relief",
  "why_it_won_or_lost": "string",
  "successful_arguments": ["string"],
  "evidence_that_mattered": ["string"],
  "regulation_sources": ["string — must be real, traceable"],
  "summary": "string",
  "source_url": "string (only for real, non-synthetic cases)"
}
```

`rejection_reason` must be exactly one of the 5 fixed values — no free text, no variants. Backend's normalizer expects these exact strings.

---

## 2. Case Corpus — Target Composition

**Total target:** 20-22 cases (per last plan — expand from 16 if time allows, don't over-invest past this).

**Priority order for the additional cases:**
1. 2-3 more `ped_non_disclosure` cases — this is a demo category, needs depth
2. 2-3 more `waiting_period` cases — also a demo category
3. **Do not pad** `policy_exclusion`, `documentation`, or `partial_settlement` further unless time allows after 1 and 2 are done — spec explicitly says stop padding these.

**Real vs. synthetic — keep this honest and labeled:**
- Real cases (sourced from Council for Insurance Ombudsmen Annual Reports, cioins.co.in): include `source_url`, these are the ones a judge could click and check.
- Synthetic cases (manually written, realistic): no `source_url`, or explicitly marked `"synthetic": true` if the schema supports it — confirm with backend whether this flag exists or needs adding.

---

## 3. Task List, In Order

### 3.1 Resolve the sync issue (Section 0) — do this first, today, before writing more cases.

### 3.2 Spot-check the existing "real" cases
Backend's stub has some cases already in it (7 total, some real, some placeholder). For every case marked as real (has a `source_url`), open the actual Ombudsman Annual Report page/PDF it links to and confirm:
- The summarized facts don't contradict the source
- The `outcome` field matches what the report actually says
- The insurer name is spelled correctly and matches

**Why this matters:** a judge can click these links live. A mismatch here is the single fastest way to lose credibility mid-demo.

### 3.3 Expand the corpus
Write/add the 2-3 `ped_non_disclosure` and 2-3 `waiting_period` cases per Section 2 priority. Use the schema in Section 1 (confirmed against actual `schema.py`) exactly.

### 3.4 Write the "insufficient information" example
One case in the corpus should be genuinely thin — not enough facts/evidence to give a confident assessment. This is the direct answer to Judge Q1 ("how do you know the AI isn't hallucinating") — it needs to be a real, demoable case, not just a claim in a doc.

**Check Section 0 first** — backend may have already picked one. If so, review their choice and confirm it's genuinely thin enough to make the point convincingly; if not, propose a replacement and get backend to update the endpoint logic to point at your `case_id` instead.

### 3.5 Test against `/extract` once backend's endpoint is live
Write 2-3 realistic fake rejection letters (do not use real user documents — privacy). Feed each through Person B's `/extract` endpoint. Check the returned JSON:
- Every field lands correctly
- `rejection_reason` always resolves to one of the 5 fixed enum values, never a paraphrase
This is flagged as the #1 place extraction silently breaks — don't skip this test even if you're confident the letters are clear.

---

## 4. Verification Checklist (run before declaring done)

- [ ] Confirmed with Person B which file is the single source of truth for `cases.json`
- [ ] Schema field names match `schema.py` exactly (including `claim_status`)
- [ ] All 5 `source_url` real cases spot-checked against actual report content
- [ ] Corpus at 20-22 cases, weighted toward `ped_non_disclosure` and `waiting_period`
- [ ] Exactly one case clearly marked/agreed as the `insufficient_information` example
- [ ] 2-3 sample rejection letters written and tested against live `/extract`, confirmed clean JSON output
- [ ] No two cases have duplicate or conflicting `case_id` values

---

## 5. Handoff

Once verified, confirm with Person B that the final `cases.json` is in place at `backend/app/cases.json` (not a stray copy elsewhere), and that the server has been restarted to load it (`uvicorn app.main:app --reload --port 8000`, check case count in startup log matches your final total).

Then confirm with Person C that the demo "hero case" (the one pre-filled by the frontend's "use demo data" button) is one of your strongest, fully-verified real cases — not a synthetic placeholder.
