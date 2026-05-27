export type IssueType = "BUG" | "SECURITY" | "PERFORMANCE" | "BEST_PRACTICE";

export interface DetectedIssue {
  file: string;
  line: number;
  chunk: string;
  issueType: IssueType;
}

export interface ReviewerResponse {
  issues: DetectedIssue[];
}

export interface ExplainerFixResponse {
  explanation: string;
  fixedCode: string;
  lineNumber: number;
}

export interface ReviewResult {
  file: string;
  lineNumber: number;
  explanation: string;
  fixedCode: string;
  issueType: string;
}

export interface OrchestratorConfig {
  reviewerModel: string;
  fixerModel: string;
  apiKey: string;
  baseURL?: string;
  cache?: boolean;
  semgrepFindings?: string; // serialized findings to nudge Agent 1
}
