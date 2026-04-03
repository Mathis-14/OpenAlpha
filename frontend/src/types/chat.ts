import type {
  QuantGreeksMetric,
  QuantGreeksResult,
  QuantOptionChain,
  QuantPayoffResult,
  QuantSurfaceResult,
  QuantYieldCurveResult,
} from "@/types/api";

export type ChatAgentType = "alpha" | "quant-alpha";

export interface ToolCallEntry {
  type: "tool_call";
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultEntry {
  type: "tool_result";
  name: string;
  success: boolean;
  error?: string;
}

export interface TextEntry {
  type: "text";
  content: string;
}

export interface ErrorEntry {
  type: "error";
  message: string;
}

export interface DisplayMetricEntry {
  type: "display_metric";
  metrics: { label: string; value: string }[];
}

export interface DisplayChartEntry {
  type: "display_chart";
  symbol: string;
  period: string;
  points: { date: number; close: number }[];
}

export interface DisplayDownloadEntry {
  type: "display_download";
  href: string;
  label: string;
  description: string;
}

export interface DisplayAboutEntry {
  type: "display_about";
  href: string;
  label: string;
  description: string;
  githubHref: string;
  linkedinHref: string;
}

export interface DisplayQuantChainEntry {
  type: "display_quant_chain";
  chain: QuantOptionChain;
}

export interface DisplayQuantGreeksEntry {
  type: "display_quant_greeks";
  result: QuantGreeksResult;
  preferredMetric?: QuantGreeksMetric;
}

export interface DisplayQuantYieldCurveEntry {
  type: "display_quant_yield_curve";
  curve: QuantYieldCurveResult;
}

export interface DisplayQuantSurfaceEntry {
  type: "display_quant_surface";
  surface: QuantSurfaceResult;
}

export interface DisplayQuantPayoffEntry {
  type: "display_quant_payoff";
  payoff: QuantPayoffResult;
}

export type ChatEntry =
  | ToolCallEntry
  | ToolResultEntry
  | TextEntry
  | ErrorEntry
  | DisplayMetricEntry
  | DisplayChartEntry
  | DisplayDownloadEntry
  | DisplayAboutEntry
  | DisplayQuantChainEntry
  | DisplayQuantGreeksEntry
  | DisplayQuantYieldCurveEntry
  | DisplayQuantSurfaceEntry
  | DisplayQuantPayoffEntry;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  entries?: ChatEntry[];
}

export interface ConversationMeta {
  id: string;
  title: string;
  agentType: ChatAgentType;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}
