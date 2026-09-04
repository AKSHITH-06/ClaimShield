import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import type { ScreenStep } from "./components/Header";
import { Header } from "./components/Header";
import { UploadScreen } from "./components/screens/UploadScreen";
import { FingerprintScreen } from "./components/screens/FingerprintScreen";
import { SimilarCasesScreen } from "./components/screens/SimilarCasesScreen";
import { CaseDetailScreen } from "./components/screens/CaseDetailScreen";
import { AppealScreen } from "./components/screens/AppealScreen";

import type {
  AppealResult,
  CaseAssessment,
  CaseIntelligence,
  ExtractedFingerprint,
  SimilarCaseMatch,
} from "./types/claim";

import {
  checkHealth,
  extractClaim,
  findSimilarCases,
  generateAppeal,
  getAssessment,
  getCaseIntelligence,
} from "./services/api";

interface StepError {
  step: ScreenStep;
  message: string;
}

export const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<ScreenStep>("upload");

  const [fingerprint, setFingerprint] = useState<ExtractedFingerprint | null>(null);
  const [similarMatches, setSimilarMatches] = useState<SimilarCaseMatch[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<SimilarCaseMatch | null>(null);
  const [caseIntelligence, setCaseIntelligence] = useState<CaseIntelligence | null>(null);
  const [assessment, setAssessment] = useState<CaseAssessment | null>(null);
  const [appealResult, setAppealResult] = useState<AppealResult | null>(null);

  /** Documents the user says they hold. Drives the evidence-gap comparison. */
  const [userDocuments, setUserDocuments] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState<StepError | null>(null);
  /** The last action, so the error state can offer a real retry. */
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);

  // Probe the backend once so the status badge is accurate before the first real call.
  useEffect(() => {
    void checkHealth();
  }, []);

  const canNavigateTo = (step: ScreenStep): boolean => {
    if (step === "upload") return true;
    if (step === "fingerprint") return !!fingerprint;
    if (step === "similar") return similarMatches.length > 0;
    if (step === "detail") return !!selectedMatch && !!caseIntelligence;
    if (step === "appeal") return !!appealResult;
    return false;
  };

  const handleReset = () => {
    setCurrentStep("upload");
    setFingerprint(null);
    setSimilarMatches([]);
    setSelectedMatch(null);
    setCaseIntelligence(null);
    setAssessment(null);
    setAppealResult(null);
    setUserDocuments([]);
    setError(null);
    setRetryAction(null);
  };

  /**
   * Every async step goes through here so a failure always produces a visible, retryable
   * error instead of clearing the spinner and silently leaving the user where they were.
   */
  const run = useCallback(
    async (step: ScreenStep, message: string, task: () => Promise<void>, retry: () => void) => {
      setIsLoading(true);
      setLoadingMessage(message);
      setError(null);
      try {
        await task();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Something went wrong. Please try again.";
        setError({ step, message: msg });
        setRetryAction(() => retry);
      } finally {
        setIsLoading(false);
        setLoadingMessage("");
      }
    },
    []
  );

  const handleAnalyze = (policyText: string, rejectionText: string, documents: string[]) => {
    const go = () =>
      void run(
        "upload",
        "Extracting structured facts and source spans from your rejection letter…",
        async () => {
          const extracted = await extractClaim(policyText, rejectionText);
          setFingerprint(extracted);
          setUserDocuments(documents);
          setCurrentStep("fingerprint");
        },
        go
      );
    go();
  };

  const handleConfirmFingerprint = (confirmed: ExtractedFingerprint) => {
    const go = () =>
      void run(
        "fingerprint",
        "Ranking the case corpus — structured, lexical and semantic retrieval…",
        async () => {
          setFingerprint(confirmed);
          const matches = await findSimilarCases(confirmed);
          setSimilarMatches(matches);
          setSelectedMatch(matches[0] ?? null);
          setCurrentStep("similar");

          // Assessment covers the whole matched set, so it is computed here rather than
          // per-case. A failure must not block the matches the user can already see.
          try {
            const a = await getAssessment(
              confirmed,
              matches.map((m) => m.case.case_id)
            );
            setAssessment(a);
          } catch {
            setAssessment(null);
          }
        },
        go
      );
    go();
  };

  const handleSelectCase = (match: SimilarCaseMatch) => {
    const go = () =>
      void run(
        "similar",
        "Tracing arguments, evidence and counterarguments back to the case record…",
        async () => {
          if (!fingerprint) return;
          setSelectedMatch(match);
          const intel = await getCaseIntelligence(
            fingerprint,
            match.case.case_id,
            userDocuments
          );
          setCaseIntelligence(intel);
          setCurrentStep("detail");
        },
        go
      );
    go();
  };

  const handleProceedToAppeal = () => {
    const go = () =>
      void run(
        "detail",
        "Drafting the grievance letter and statutory escalation plan…",
        async () => {
          if (!fingerprint || !selectedMatch) return;
          // Only verified gaps go into the letter — an unverified claim must not become a
          // factual assertion in something the user sends to their insurer.
          const missing = (caseIntelligence?.missing_evidence ?? [])
            .filter((c) => c.verified)
            .map((c) => c.text);
          const appeal = await generateAppeal(
            fingerprint,
            [selectedMatch.case.case_id],
            missing
          );
          setAppealResult(appeal);
          setCurrentStep("appeal");
        },
        go
      );
    go();
  };

  return (
    <div className="app-container">
      <Header
        currentStep={currentStep}
        onStepClick={setCurrentStep}
        canNavigateTo={canNavigateTo}
        onReset={handleReset}
      />

      {error && (
        <div className="notice error" style={{ marginBottom: 20 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <strong>That step didn&rsquo;t complete.</strong>
            <p style={{ marginTop: 4, color: "var(--text-muted)" }}>{error.message}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {retryAction && (
                <button className="btn-secondary" onClick={() => retryAction()}>
                  <RotateCcw size={14} /> <span>Try again</span>
                </button>
              )}
              <button className="btn-secondary" onClick={() => setError(null)}>
                <span>Dismiss</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="loading-state">
          <div className="spinner" />
          <div style={{ fontSize: "1rem", fontWeight: 600 }}>
            {loadingMessage || "Working…"}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", maxWidth: 460 }}>
            Every claim produced here is checked against the case corpus before it is shown.
          </div>
        </div>
      )}

      {!isLoading && (
        <main>
          {currentStep === "upload" && (
            <UploadScreen onAnalyze={handleAnalyze} isLoading={isLoading} />
          )}

          {currentStep === "fingerprint" && fingerprint && (
            <FingerprintScreen
              initialFingerprint={fingerprint}
              onConfirmFingerprint={handleConfirmFingerprint}
              onBack={() => setCurrentStep("upload")}
              isLoading={isLoading}
            />
          )}

          {currentStep === "similar" && fingerprint && (
            <SimilarCasesScreen
              fingerprint={fingerprint}
              matches={similarMatches}
              assessment={assessment}
              onSelectCase={handleSelectCase}
              onBack={() => setCurrentStep("fingerprint")}
            />
          )}

          {currentStep === "detail" && fingerprint && selectedMatch && caseIntelligence && (
            <CaseDetailScreen
              userFingerprint={fingerprint}
              selectedMatch={selectedMatch}
              intelligence={caseIntelligence}
              assessment={assessment}
              onProceedToAppeal={handleProceedToAppeal}
              onBack={() => setCurrentStep("similar")}
            />
          )}

          {currentStep === "appeal" && fingerprint && appealResult && (
            <AppealScreen
              appealResult={appealResult}
              fingerprint={fingerprint}
              onRestart={handleReset}
              onBack={() => setCurrentStep("detail")}
            />
          )}
        </main>
      )}
    </div>
  );
};

export default App;
