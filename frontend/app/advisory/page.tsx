"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { AnalysisResult, AdvisoryOutput } from "../types";
import { Header } from "../../components/Header";

function typeStyle(type: AdvisoryOutput["type"]) {
  switch (type) {
    case "FACT":
      return "bg-[var(--color-brand-navy)]/5 text-[var(--color-brand-navy)] border-[var(--color-brand-navy)]/30";
    case "ASSUMPTION":
      return "bg-amber-50 text-amber-800 border-amber-300";
    case "ADVICE":
      return "bg-[var(--color-brand-rose)]/15 text-[var(--color-brand-rose-deep)] border-[var(--color-brand-rose)]";
  }
}

function confidenceStyle(conf: AdvisoryOutput["confidence"]) {
  switch (conf) {
    case "high":   return "text-[var(--color-brand-navy)]";
    case "medium": return "text-amber-700";
    case "low":    return "text-[var(--color-brand-rose-deep)]";
  }
}

function AdvisoryCard({ output, delay = 0 }: { output: AdvisoryOutput; delay?: number }) {
  return (
    <div
      className="bg-[var(--color-brand-surface)] border border-[var(--color-brand-line)] rounded-xl p-4 motion-safe:animate-fade-in-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold tracking-wider rounded border ${typeStyle(output.type)}`}
        >
          {output.type}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--color-brand-ink)] mb-2">{output.statement}</p>
          <p className="text-xs text-[var(--color-brand-muted)]">Source: {output.source}</p>
          <p className={`text-xs font-medium mt-1 ${confidenceStyle(output.confidence)}`}>
            Confidence: {output.confidence}
          </p>
        </div>
      </div>
    </div>
  );
}

function GuidedDiagnosis({ raw }: { raw: string }) {
  let items: Array<{ issue: string; impact: string; fix_step: string }> = [];
  let parseError = false;

  try {
    const parsed = JSON.parse(raw);
    items = parsed.guidance || [];
  } catch {
    parseError = true;
  }

  if (parseError || items.length === 0) {
    return (
      <div className="bg-white border border-[var(--color-brand-line)] rounded-lg p-5 whitespace-pre-wrap text-sm text-[var(--color-brand-ink)]">
        {raw}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div
          key={i}
          className="bg-white border border-[var(--color-brand-rose)] rounded-lg p-4 motion-safe:animate-fade-in-up"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <p className="text-sm font-semibold text-[var(--color-brand-navy)] mb-1.5">
            {i + 1}. {item.issue}
          </p>
          <p className="text-sm text-[var(--color-brand-muted)] mb-3">
            <span className="font-medium text-[var(--color-brand-ink)]">Impact:</span>{" "}
            {item.impact}
          </p>
          <div className="bg-[var(--color-brand-rose)]/10 border border-[var(--color-brand-rose)]/40 rounded p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-brand-rose-deep)] mb-1">
              Fix step
            </p>
            <p className="text-sm text-[var(--color-brand-ink)]">{item.fix_step}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function AiDisclosureBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3 bg-[var(--color-brand-surface)] border border-[var(--color-brand-line)] border-l-4 border-l-[var(--color-brand-navy)]/30 rounded-lg text-xs text-[var(--color-brand-muted)] mb-5 motion-safe:animate-fade-in-up">
      <p>
        <span className="font-semibold text-[var(--color-brand-ink)]">AI-generated output.</span>{" "}
        This analysis was produced by Claude (Anthropic). All outputs require human review before action.
      </p>
      <button
        onClick={onDismiss}
        className="shrink-0 text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)] leading-none text-sm"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

export default function AdvisoryPage() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("analysis_result");
      if (raw) setResult(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  if (!result) {
    return (
      <main className="min-h-screen bg-[var(--color-brand-cream)] flex flex-col">
        <Header current="advisory" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-[var(--color-brand-muted)]">
            <p className="text-lg mb-3">No readiness report yet.</p>
            <Link
              href="/"
              className="text-[var(--color-brand-navy)] hover:text-[var(--color-brand-rose-deep)] underline text-sm"
            >
              ← Run a check first
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const { readiness, advisory_outputs, guided_response, blocked_reason } = result;

  return (
    <main className="min-h-screen bg-[var(--color-brand-cream)] flex flex-col">
      <Header current="advisory" />

      <div className="max-w-3xl mx-auto w-full px-6 sm:px-8 py-10 flex-1">
        {!bannerDismissed && (
          <AiDisclosureBanner onDismiss={() => setBannerDismissed(true)} />
        )}

        {readiness.advice_ready ? (
          <>
            <div className="mb-6 p-4 bg-[var(--color-brand-navy)]/5 border border-[var(--color-brand-navy)]/20 rounded-lg text-sm text-[var(--color-brand-navy)] motion-safe:animate-fade-in-up">
              Data-quality checks passed — advisory outputs below are grounded in verified data.
              Each is tagged FACT, ASSUMPTION, or ADVICE with a source citation.
            </div>
            <div className="space-y-3">
              {(advisory_outputs || []).map((output, i) => (
                <AdvisoryCard key={i} output={output} delay={i * 60} />
              ))}
              {(!advisory_outputs || advisory_outputs.length === 0) && (
                <p className="text-[var(--color-brand-muted)] text-sm">
                  No advisory outputs returned. The LLM call may have failed — check LangWatch traces.
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 p-4 bg-[var(--color-status-blocker-bg)] border border-[var(--color-status-blocker)]/30 border-l-4 border-l-[var(--color-status-blocker)] rounded-lg motion-safe:animate-fade-in-up">
              <p className="text-sm font-semibold text-[var(--color-status-blocker)] mb-1">
                Advisory blocked{blocked_reason ? ` — ${blocked_reason}` : ""}
              </p>
              <p className="text-sm text-[var(--color-brand-ink)]">
                Issues found that must be resolved before a closing advisory can run.
                Below is an AI-generated fix guide based on the failing checks.
              </p>
            </div>

            <div className="mb-6 flex items-center gap-3">
              <Link
                href="/fix-plan"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-brand-navy)] text-[var(--color-brand-cream)] text-sm font-medium hover:bg-[var(--color-brand-navy-soft)] transition-colors"
              >
                Generate Fix Plan →
              </Link>
              <span className="text-xs text-[var(--color-brand-muted)]">
                Claude proposes specific Exact Online actions · you review and approve
              </span>
            </div>

            {guided_response ? (
              <GuidedDiagnosis raw={guided_response} />
            ) : (
              <p className="text-[var(--color-brand-muted)] text-sm">No guided response available.</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
