// OpenClaw 2026.9.6 exports this runtime API without its declaration file.
declare module "openclaw/plugin-sdk/session-transcript-runtime" {
  type TranscriptEntry = {
    role: string;
    message: { content?: unknown };
  };

  type VisibleMessageDelta =
    | {
        kind: "page";
        cursor: string;
        entries: TranscriptEntry[];
        hasMore: boolean;
      }
    | { kind: "reset"; cursor: string; reason: string }
    | { kind: "unavailable"; reason: string }
    | { kind: "missing" };

  export function readSessionTranscriptVisibleMessageDelta(params: {
    sessionKey: string;
    sessionId: string;
    cursor?: string;
    maxMessages?: number;
    maxBytes?: number;
  }): Promise<VisibleMessageDelta>;
}
