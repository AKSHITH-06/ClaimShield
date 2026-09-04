# ClaimShield

**Upload a rejected health-insurance claim and find out what happened to people with your exact rejection — with every conclusion traced back to the record it came from, or visibly marked as untraceable.**

Indian health-insurance decision support. Not a chatbot, not legal advice, and not a win-probability calculator.

---

## The problem

An Indian policyholder whose health claim is repudiated is told *that* they lost, rarely *why*, and almost never what to do next. The information they'd need is scattered across their policy wording, the rejection letter, IRDAI regulations, and consumer-commission decisions. The insurer has a claims team, a legal team and a TPA. The policyholder has a PDF and a deadline.

The gap isn't "explain this document." It's **"has anyone won a case like mine, on what argument, with what evidence — and what am I missing?"**

## What ClaimShield does

```
rejection letter (+ policy)
        ↓  /ingest      PDF → text, reviewed by the user before anything else runs
        ↓  /extract     LLM → structured Case Fingerprint (nulls, never guesses)
        ↓  /similar-cases   hybrid retrieval over the case corpus
        ↓  /case-intelligence  why it won/lost · evidence gaps · insurer counterarguments
        ↓  /assessment   comparable-case verdict (never a probability)
        ↓  /appeal       grievance letter + statutory escalation plan
```

## The Evidence Ledger — the part that matters

Most "AI + documents" demos produce fluent prose you cannot check. ClaimShield inverts that: **provenance is the interface.**

Every claim the system displays is a `GroundedClaim` carrying the corpus `case_id`, the exact `field`, and the **verbatim span** it was drawn from. The model is told to cite; then a validator checks the citation against the actual record:

1. Does the cited case exist in the corpus?
2. Is the cited field one a claim is allowed to cite?
3. **Does the quoted span actually appear in that field?** (normalised substring, then token-overlap for light rewording)

Claims that fail are stripped of provenance, marked unverified, excluded from the appeal letter, and **counted**. The UI shows the count:

> `18 of 21 claims traced to the case record · 3 dropped as unverified`

Click any chip (`case_014 · key_evidence`) to see the verbatim source text.

### It refuses to answer

`case_022` is flagged `insufficient_information`. Selecting it returns:

> **0 of 0 — declined to answer.** Records too incomplete to support any claim.

**No LLM call is made at all.** The endpoint short-circuits before reaching the model. `/appeal` additionally refuses to cite it as precedent, returning `no_citable_precedent` rather than quietly dropping it.

A system that declines when the record is too thin is worth more than one that always answers.

## Hybrid retrieval

The original scorer used `difflib.SequenceMatcher` on clause text — a character diff that rates "Clause 4.1" ≈ "Clause 4.2" as near-identical while missing that "PED exclusion" and "pre-existing condition waiting period" are the same legal issue. Replaced with three fused tiers:

| Tier | Weight | Implementation |
|---|---|---|
| Structured | 67% | Denial category 30%, factual 13%, insurer 12%, claim value 8%, forum 4% |
| Lexical | 15% | BM25 (`rank_bm25`) over the case narrative |
| Semantic | 18% | Dense embeddings (`fastembed`, `bge-small-en-v1.5`, 384-dim) |

**Tiers degrade explicitly.** If `fastembed` fails to load, its weight is redistributed (the total always sums to 1.0) and every match reports `retrieval_signals: {semantic: false}`, which the UI renders as a struck-through `semantic` pill. Ranking quality never changes silently.

## Open-source components

| Component | Licence | Where | Why this one | Without it |
|---|---|---|---|---|
| **FastAPI** | MIT | `backend/app/main.py` | Pydantic-native request/response validation means the schema *is* the contract | Hand-rolled validation on every endpoint |
| **Pydantic v2** | MIT | `app/core/schema.py` | One shared contract across backend, corpus and frontend | The dual-schema drift this project already suffered once |
| **rank_bm25** | Apache-2.0 | `app/core/retrieval.py` | Standard IR baseline, strong on legal terminology; pure Python, zero compiled deps | Back to character-diff clause matching |
| **fastembed** | Apache-2.0 | `app/core/retrieval.py` | Real dense embeddings via ONNX — no 2.5 GB torch install | No paraphrase sensitivity; "PED" wouldn't match "pre-existing condition" |
| **pdfplumber** | MIT | `/ingest` | Reliable text-layer extraction with per-page control | Users retyping rejection letters by hand |
| **Llama 3.3 70B Instruct** | Llama 3.3 Community | extraction, intelligence, appeal | Open weights, strong structured-JSON adherence | No extraction from free-form letters |
| **React 19 + Vite** | MIT | `Frontend-amogh/` | Fast HMR while iterating against a live backend | — |

Served through Featherless (a commercial host for open-weight models). The **model weights** are open; the **serving** is not — stated plainly rather than claimed as a fully open stack.

## Reliability

LLM output is never trusted at face value:

- `rejection_reason` is keyword-normalised onto 5 enum values server-side, or set to `null`
- Assessment verdicts normalise to 3 values and **default to `insufficient_information`**, never to the favorable verdict
- A verdict whose supporting claims all fail validation is downgraded to `confidence: low`
- Malformed JSON → HTTP 422 with a displayable message, never a partial render
- `/appeal` has a template fallback so the screen always renders, labelled `generated_by: template_fallback`
- Citations containing "illustrative" or "synthetic" are filtered out of user-facing output

**Offline mode is honest.** With the backend down, the app doesn't replay canned responses. It ranks with the same weights (semantic tier reported inactive) and passes the corpus record's own fields through as claims whose provenance is exact by construction. `extract` — which has no honest offline substitute — surfaces an error instead of a fiction.

## Corpus

22 cases: 10 PED non-disclosure, 7 waiting period, 2 documentation, 2 partial settlement, 1 exclusion. One (`case_022`) is the deliberate insufficient-information marker.

**The case records are illustrative, built for the MVP — not verified published judgments.** They are labelled as such in the data and flagged `illustrative` in the UI. Scraping and verifying real NCDRC orders was out of scope for the build window, and presenting synthetic records as real judgments would be the exact failure this project is designed against.

**The regulatory provisions are real** and separated from the case narrative — Insurance Act 1938 s.45, IRDAI (Protection of Policyholders' Interests) Regulations 2017, IRDAI (Health Insurance) Regulations 2016, Insurance Ombudsman Rules 2017, Consumer Protection Act 2019. Only these reach the appeal letter's citation list.

## Running it

```bash
# Backend  (Python 3.12 — 3.14 lacks wheels for the retrieval deps)
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp -n .env.example .env     # -n = never clobber an existing key; then add your key
uvicorn app.main:app --reload --port 8000     # docs at /docs

# Frontend  (Node 20.19+ or 22.12+)
cd Frontend-amogh
nvm use && npm install
npm run dev                                    # http://localhost:5173
```

`GET /` reports corpus size and which retrieval tiers came up:

```json
{"status":"ok","corpus_cases":22,"retrieval_tiers":{"structured":true,"lexical":true,"semantic":true}}
```

After editing the corpus, re-sync the frontend's offline snapshot:

```bash
node scripts/sync-corpus.mjs
```

### Environment

| Variable | Where | Purpose |
|---|---|---|
| `FEATHERLESS_API_KEY` | `backend/.env` | LLM inference. Required for `/extract`, `/case-intelligence`, `/assessment`, `/appeal` |
| `VITE_API_BASE_URL` | `Frontend-amogh/.env.local` | Backend URL, defaults to `http://localhost:8000` |

> **Keep your key out of the repo.** `backend/.env` is tracked on `main` (with an old key
> committed into it), so `git checkout main` will **overwrite** your `.env` and switching to a
> branch where it is untracked will **delete** it. Until that is fixed on `main`, set the key as
> a shell variable instead — `load_dotenv()` does not override an already-set variable, so this
> wins over whatever git writes to the file:
>
> ```bash
> export FEATHERLESS_API_KEY=your_key_here   # add to ~/.zshrc to persist
> ```

> **Security note:** a Featherless key was previously committed to this public repo (`08b2bc9`…`47d8179`). It has been untracked and **must be treated as compromised — rotate it.** It remains in git history.

## Demo flow

1. Drop a rejection-letter PDF in → text extracted, shown for review
2. Extract → Case Fingerprint with per-field confidence and source spans
3. Find similar cases → precedents ranked, each showing which retrieval tiers fired
4. Open the top match → every claim provenance-chipped; click one to see the verbatim span
5. Point at the Grounding Audit strip
6. Select `case_022` → **"Declined to answer."** No AI call made
7. Generate appeal → cites only verified precedents + real regulatory provisions

## Limitations

- Case records are illustrative, not verified judgments (see Corpus)
- No OCR — scanned/photo PDFs are rejected with a message, not silently returned empty
- Health insurance only; motor/life/travel are out of scope
- Retrieval is over 22 cases, not a national corpus
- The assessment describes what comparable records show. It is not a prediction, and ClaimShield does not represent anyone

## What's next

Real corpus ingestion from Indian Kanoon / NCDRC with citation verification; OCR for scanned documents; policy-clause-level retrieval rather than case-level; multilingual input.
