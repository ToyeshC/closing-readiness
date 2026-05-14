// Centralized API surface. Replaces inline fetch + API_URL constants across pages.

import type { AnalysisResult, SourceLine } from "../app/types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface AuthStatus {
  authenticated: boolean;
  division_id: number | null;
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const r = await fetch(`${API_URL}/auth/exact/status`);
  if (!r.ok) throw new Error(`Auth status failed: ${r.status}`);
  return r.json();
}

export async function runReadiness(
  periodStart: string,
  periodEnd: string,
): Promise<AnalysisResult> {
  const r = await fetch(
    `${API_URL}/api/v1/readiness?period_start=${periodStart}&period_end=${periodEnd}`,
    { method: "POST" },
  );
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Readiness check failed (${r.status})${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  return r.json();
}

export async function fetchSources(checkId: string): Promise<SourceLine[]> {
  const r = await fetch(`${API_URL}/api/v1/readiness/${checkId}/sources`);
  if (!r.ok) throw new Error(`Source fetch failed: ${r.status}`);
  return r.json();
}

export function authRedirectUrl(): string {
  return `${API_URL}/auth/exact/redirect`;
}
