import type { SourceApp } from "../types";

export interface ContextTurnResolution {
  originalText: string;
  resolvedQuery: string;
  shouldRetrieve: boolean;
  confidence: number;
  reason: string;
}

export interface ContextRouterCandidate {
  id: string;
  title: string;
  sourceApp: SourceApp;
  updatedAt: string | null;
  sourcePostId: string | null;
  sourceMessageId: string | null;
  snippet: string;
  lexicalScore: number;
}

export interface ContextRerankDecision {
  candidateId: string;
  action: "include" | "exclude";
  confidence: number;
  reason: string;
  usefulFacts: string[];
  sourcePostId: string | null;
  sourceMessageId: string | null;
}

export interface ContextPack {
  router_version: "context-router-v1";
  resolved_query: string;
  relevance_confidence: number;
  reason: string;
  useful_facts: string[];
  snippet: string;
}
