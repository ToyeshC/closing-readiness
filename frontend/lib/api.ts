// Centralized API surface. Replaces inline fetch + API_URL constants across pages.

import type { AnalysisResult, FixPlan, FixPlanItem, SourceLine } from "../app/types";

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

export async function fetchFixPlan(): Promise<FixPlan> {
  const r = await fetch(`${API_URL}/api/v1/fix-plan`, { method: "POST" });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Fix plan failed (${r.status})${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  return r.json();
}

export async function fetchSingleCheckFix(checkId: string): Promise<FixPlanItem> {
  const r = await fetch(`${API_URL}/api/v1/fix-plan/single`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ check_id: checkId }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Single fix failed (${r.status})${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  return r.json();
}

export async function approveFixPlan(
  planId: string,
  approvedItems: string[],
  notes: string,
): Promise<{ logged: boolean; plan_id: string; approved_items: string[] }> {
  const r = await fetch(`${API_URL}/api/v1/fix-plan/${planId}/approve`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved_items: approvedItems, notes }),
  });
  if (!r.ok) throw new Error(`Approve failed: ${r.status}`);
  return r.json();
}
