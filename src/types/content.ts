export type Verdict = "approve" | "reject";

export type DocumentZone = "proof" | "watch" | "exception";

export interface DeskDocument {
  id: string;
  label: string;
  kind: string;
  summary: string;
  expected_zone: DocumentZone;
}

export interface CaseClarification {
  question: string;
  answer: string;
}

export interface CaseOutcome {
  verdict: Verdict;
  reason: string;
  policy: string;
}

export interface DeskCase {
  id: string;
  visitor: string;
  story: string;
  facts: string[];
  documents: DeskDocument[];
  clarification?: CaseClarification;
  outcome: CaseOutcome;
}

export interface DeskDay {
  day: number;
  title: string;
  intro: string;
  pacing: string;
  theory: string;
  bullet_points: string[];
  cases: DeskCase[];
}

