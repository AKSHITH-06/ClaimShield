/**
 * ClaimShield API layer.
 *
 * Talks to the FastAPI backend with a short timeout, and falls back to the offline engine so
 * a demo never sits on a frozen screen. The fallback is honest: it uses the same corpus, the
 * same scoring rules, and passes corpus text through with exact provenance instead of
 * replaying pre-baked responses for whatever case the user happened to click.
 *
 * Errors are thrown, not swallowed into a fake success. Callers render an error state.
 */

import type {
  AppealResult,
  CaseAssessment,
  CaseIntelligence,
  CorpusCase,
  ExtractedFingerprint,
  IngestResult,
  SimilarCaseMatch,
} from "../types/claim";
import corpusSnapshot from "../data/corpus.generated.json";
import { toSimilarCaseMatch } from "./adapters";
import { rankCorpus } from "./similarityEngine";
import {
  offlineAppeal,
  offlineAssessment,
  offlineCaseIntelligence,
} from "./offlineIntelligence";

export const HISTORICAL_CORPUS = corpusSnapshot as CorpusCase[];

const CORPUS_BY_ID = new Map(HISTORICAL_CORPUS.map((c) => [c.id, c]));

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// Extraction and generation are LLM calls and legitimately slow; ranking is not.
const TIMEOUT_FAST = 8000;
const TIMEOUT_LLM = 90000;

export type ApiMode = "live" | "offline";

type ModeListener = (mode: ApiMode) => void;
const modeListeners = new Set<ModeListener>();
let currentMode: ApiMode = "live";

export function getApiMode(): ApiMode {
  return currentMode;
}

export function subscribeApiMode(listener: ModeListener): () => void {
  modeListeners.add(listener);
  listener(currentMode);
  return () => modeListeners.delete(listener);
}

function setApiMode(mode: ApiMode) {
  if (currentMode !== mode) {
    currentMode = mode;
    modeListeners.forEach((l) => l(mode));
  }
}

/** Error carrying the backend's message so the UI can show something actionable. */
export class ApiError extends Error {
  slug: string;
  status?: number;

  constructor(message: string, slug = "request_failed", status?: number) {
    super(message);
    this.name = "ApiError";
    this.slug = slug;
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init: RequestInit,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal });

    if (!res.ok) {
      // The backend returns {error, message} on every failure path — surface the message.
      let slug = "request_failed";
      let message = `Request to ${path} failed (HTTP ${res.status}).`;
      try {
        const body = await res.json();
        if (body?.message) message = body.message;
        if (body?.error) slug = body.error;
      } catch {
        /* non-JSON error body — keep the generic message */
      }
      // A 4xx means the backend is up and rejecting us, so this is not offline.
      setApiMode("live");
      throw new ApiError(message, slug, res.status);
    }

    const data = (await res.json()) as T;
    setApiMode("live");
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function post<T>(path: string, body: unknown, timeoutMs = TIMEOUT_FAST): Promise<T> {
  return request<T>(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    timeoutMs
  );
}

/** True when the failure means "backend unreachable" rather than "backend said no". */
function isUnreachable(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === undefined;
  return true; // network error, abort, DNS failure
}

/** Fingerprint -> the payload shape the backend's CaseFingerprint expects. */
function toBackendFingerprint(fp: ExtractedFingerprint) {
  return {
    id: fp.id || "user_active_case",
    insurer: fp.insurer,
    insurance_type: "health",
    claim_amount: fp.claim_amount || null,
    rejection_reason: fp.rejection_reason || null,
    condition: fp.condition,
    treatment_type: fp.treatment_type || null,
    policy_start_date: fp.policy_start_date || null,
    hospitalization_date: fp.hospitalization_date || null,
    claim_date: fp.claim_date || null,
    claim_status: fp.claim_status || null,
    relevant_policy_clause: fp.relevant_clause || null,
    disclosure_issue: fp.disclosure_issue ?? false,
    documentation_issue: fp.documentation_issue ?? false,
    court_level: fp.court_level || "unknown",
    jurisdiction: fp.jurisdiction || null,
  };
}

/* ─── 1. Ingest a document ─────────────────────────────────────────────── */

export async function ingestDocument(file: File): Promise<IngestResult> {
  const form = new FormData();
  form.append("file", file);
  try {
    return await request<IngestResult>("/ingest", { method: "POST", body: form }, 30000);
  } catch (err) {
    if (isUnreachable(err)) {
      setApiMode("offline");
      throw new ApiError(
        "File parsing needs the backend, which is not reachable. Paste the text in instead.",
        "backend_unreachable"
      );
    }
    throw err;
  }
}

/* ─── 2. Extract the case fingerprint ─────────────────────────────────── */

interface ExtractResponse {
  fingerprint: Record<string, unknown>;
  extraction_confidence?: "high" | "medium" | "low";
  fields_needing_review?: string[];
  source_spans?: Record<string, string>;
}

export async function extractClaim(
  policyText: string,
  rejectionText: string,
  additionalText = ""
): Promise<ExtractedFingerprint> {
  // Extraction is an LLM read of the user's own document. There is no honest offline
  // substitute, so a failure here surfaces as an error rather than a plausible fiction.
  let res: ExtractResponse;
  try {
    res = await post<ExtractResponse>(
      "/extract",
      {
        policy_text: policyText,
        rejection_text: rejectionText,
        additional_text: additionalText,
      },
      TIMEOUT_LLM
    );
  } catch (err) {
    if (isUnreachable(err)) {
      setApiMode("offline");
      throw new ApiError(
        "Reading your document needs the backend, which is not reachable. Start it with " +
          "`uvicorn app.main:app --port 8000`, then try again.",
        "backend_unreachable"
      );
    }
    throw err;
  }

  const fp = (res.fingerprint ?? {}) as Record<string, string | number | boolean | null>;
  const confidence = res.extraction_confidence ?? "low";
  const needsReview = res.fields_needing_review ?? [];

  // Per-field confidence: a field the backend flagged for review is low regardless of the
  // overall score, and a field that came back null is not presented as extracted.
  const fieldConfidence: Record<string, "high" | "medium" | "low"> = {};
  for (const key of ["insurer", "rejection_reason", "condition", "claim_amount"]) {
    if (fp[key] == null) fieldConfidence[key] = "low";
    else fieldConfidence[key] = needsReview.includes(key) ? "low" : confidence;
  }

  return {
    id: "user_active_case",
    insurer: (fp.insurer as string) || "",
    insurance_type: "health",
    claim_amount: typeof fp.claim_amount === "number" ? fp.claim_amount : 0,
    rejection_reason: (fp.rejection_reason as string) || "",
    condition: (fp.condition as string) || "",
    treatment_type: (fp.treatment_type as string) || undefined,
    policy_start_date: (fp.policy_start_date as string) || "",
    hospitalization_date: (fp.hospitalization_date as string) || "",
    claim_date: (fp.claim_date as string) || undefined,
    claim_status: (fp.claim_status as string) || "",
    relevant_clause: (fp.relevant_policy_clause as string) || "",
    court_level: (fp.court_level as string) || "unknown",
    jurisdiction: (fp.jurisdiction as string) || undefined,
    disclosure_issue: Boolean(fp.disclosure_issue),
    documentation_issue: Boolean(fp.documentation_issue),
    field_confidence: fieldConfidence,
    field_source_quote: res.source_spans ?? {},
    fields_needing_review: needsReview,
  };
}

/* ─── 3. Find similar cases ───────────────────────────────────────────── */

export async function findSimilarCases(
  fingerprint: ExtractedFingerprint,
  topK = 5
): Promise<SimilarCaseMatch[]> {
  try {
    const raw = await post<Parameters<typeof toSimilarCaseMatch>[0][]>(
      "/similar-cases",
      { fingerprint: toBackendFingerprint(fingerprint), top_k: topK },
      TIMEOUT_FAST
    );
    if (Array.isArray(raw) && raw.length) return raw.map(toSimilarCaseMatch);
    return [];
  } catch (err) {
    if (!isUnreachable(err)) throw err;
    // Same corpus, same weights, semantic tier reported inactive.
    console.warn("Backend unreachable — ranking with the offline engine.");
    setApiMode("offline");
    return rankCorpus(fingerprint, HISTORICAL_CORPUS, topK);
  }
}

/* ─── 4. Case intelligence ────────────────────────────────────────────── */

export async function getCaseIntelligence(
  fingerprint: ExtractedFingerprint,
  matchedCaseId: string,
  userDocuments: string[]
): Promise<CaseIntelligence> {
  try {
    return await post<CaseIntelligence>(
      "/case-intelligence",
      {
        user_fingerprint: toBackendFingerprint(fingerprint),
        matched_case_id: matchedCaseId,
        user_documents: userDocuments,
      },
      TIMEOUT_LLM
    );
  } catch (err) {
    if (!isUnreachable(err)) throw err;
    const record = CORPUS_BY_ID.get(matchedCaseId);
    if (!record) throw new ApiError(`No case record for ${matchedCaseId}.`, "case_not_found");
    console.warn("Backend unreachable — passing the case record through offline.");
    setApiMode("offline");
    return offlineCaseIntelligence(record, userDocuments);
  }
}

/* ─── 5. Assessment ───────────────────────────────────────────────────── */

export async function getAssessment(
  fingerprint: ExtractedFingerprint,
  matchedCaseIds: string[]
): Promise<CaseAssessment> {
  try {
    return await post<CaseAssessment>(
      "/assessment",
      {
        user_fingerprint: toBackendFingerprint(fingerprint),
        matched_case_ids: matchedCaseIds,
      },
      TIMEOUT_LLM
    );
  } catch (err) {
    if (!isUnreachable(err)) throw err;
    console.warn("Backend unreachable — computing the assessment from outcome counts.");
    setApiMode("offline");
    const records = matchedCaseIds
      .map((id) => CORPUS_BY_ID.get(id))
      .filter((c): c is CorpusCase => Boolean(c));
    return offlineAssessment(records);
  }
}

/* ─── 6. Appeal ───────────────────────────────────────────────────────── */

export async function generateAppeal(
  fingerprint: ExtractedFingerprint,
  precedentIds: string[],
  missingEvidence: string[] = []
): Promise<AppealResult> {
  try {
    const res = await post<{
      appeal_letter: string;
      action_plan: string[];
      citations_used: string[];
      precedents_cited: string[];
      precedents_excluded: string[];
      generated_by?: "llm" | "template_fallback";
    }>(
      "/appeal",
      {
        user_fingerprint: toBackendFingerprint(fingerprint),
        precedent_case_ids: precedentIds,
        missing_evidence: missingEvidence,
      },
      TIMEOUT_LLM
    );

    return {
      letter_markdown: res.appeal_letter,
      action_plan: res.action_plan ?? [],
      citations_used: res.citations_used ?? [],
      precedents_cited: res.precedents_cited ?? precedentIds,
      precedents_excluded: res.precedents_excluded ?? [],
      generated_by: res.generated_by,
    };
  } catch (err) {
    if (!isUnreachable(err)) throw err;
    console.warn("Backend unreachable — drafting the appeal from the template.");
    setApiMode("offline");
    const records = precedentIds
      .map((id) => CORPUS_BY_ID.get(id))
      .filter((c): c is CorpusCase => Boolean(c));
    return offlineAppeal(fingerprint, records, missingEvidence);
  }
}

/* ─── Health ──────────────────────────────────────────────────────────── */

export interface BackendHealth {
  status: string;
  corpus_cases: number;
  retrieval_tiers: { structured: boolean; lexical: boolean; semantic: boolean };
}

/** Probed once on load so the status badge reflects reality before the first real call. */
export async function checkHealth(): Promise<BackendHealth | null> {
  try {
    const res = await request<BackendHealth>("/", { method: "GET" }, 3000);
    return res;
  } catch {
    setApiMode("offline");
    return null;
  }
}
