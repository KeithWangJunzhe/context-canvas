import type { BlockStatus, ContextEdge, ContextNode } from '../../types'

export const CODEX_IMPORT_SCHEMA_VERSION = 'context-canvas.codex-session.v1' as const

export type CodexImportDiagnostic = {
  level: 'warning' | 'error'
  code: string
  message: string
  sourceLine?: number
}

export type CodexSourceRef = {
  recordType: 'event_msg' | 'response_item' | 'task_complete'
  sourceLine: number
  timestamp?: string
  recordId?: string
}

export type CodexTurnItem =
  | {
      kind: 'message'
      role: 'user' | 'assistant'
      phase?: 'commentary' | 'final_answer' | 'unknown'
      text: string
      source: CodexSourceRef
    }
  | {
      kind: 'tool_call'
      callId: string
      name: string
      input: string
      status?: string
      source: CodexSourceRef
    }
  | {
      kind: 'tool_output'
      callId: string
      name?: string
      output: string
      source: CodexSourceRef
    }
  | {
      kind: 'agent_message'
      author: string
      recipient: string
      text: string
      source: CodexSourceRef
    }

export type CodexTurnImport = {
  codexTurnId: string
  sequenceIndex: number
  status: 'completed' | 'aborted' | 'in_progress'
  initiator: 'user' | 'automation' | 'unknown'
  initiatorEvidence: 'event_msg.user_message' | 'response_item.user' | 'none'
  startedAt?: string
  completedAt?: string
  cwd?: string
  model?: string
  items: CodexTurnItem[]
}

export type CodexImportStats = {
  sourceRecordCount: number
  importedTurnCount: number
  omittedTurnCount: number
  assistantMessageCount: number
  agentMessageCount: number
  toolCallCount: number
  toolOutputCount: number
  invalidLineCount: number
  firstTimestamp?: string
  lastTimestamp?: string
}

export type CodexSessionImport = {
  schemaVersion: typeof CODEX_IMPORT_SCHEMA_VERSION
  sourceFormat: 'codex-rollout-jsonl'
  sourceFileName?: string
  boundary:
    | { kind: 'eof' }
    | {
        kind: 'marker'
        markerTurnId?: string
        sourceLine: number
      }
  session: {
    codexSessionId: string
    codexThreadId?: string
    createdAt?: string
    cwd?: string
    cliVersion?: string
    source?: string
  }
  turns: CodexTurnImport[]
  diagnostics: CodexImportDiagnostic[]
  stats: CodexImportStats
}

export type CodexUsedContextCandidate = {
  id: string
  path: string
  kind: 'document' | 'image' | 'unknown'
  content?: string
  evidence: string[]
  confidence: 'observed' | 'mentioned'
}

export type ParseCodexRolloutOptions = {
  sourceFileName?: string
  cutoffMarker?: string
  markerMode?: 'optional' | 'required'
}

export type CodexRolloutParseResult =
  | { ok: true; data: CodexSessionImport }
  | { ok: false; error: CodexImportDiagnostic; diagnostics: CodexImportDiagnostic[] }

export type CodexCanvasPolicyKey =
  | 'user'
  | 'assistant_final'
  | 'assistant_commentary'
  | 'assistant_unknown'
  | 'agent_message'
  | 'tool_call'
  | 'tool_output'

export type CodexCanvasDisposition = BlockStatus | 'omit'

export type BuildCodexCanvasOptions = {
  startNodeId: string
  endNodeId: string
  createId: (prefix: string) => string
  sourceFileName?: string
  connectStartAndEnd?: boolean
  policy?: Partial<Record<CodexCanvasPolicyKey, CodexCanvasDisposition>>
}

export type CodexTurnMetadata = {
  codexSessionId: string
  codexThreadId?: string
  codexTurnId: string
  sequenceIndex: number
  startedAt?: string
  completedAt?: string
  status: CodexTurnImport['status']
  initiator: CodexTurnImport['initiator']
  sourceFormat: 'codex-rollout-jsonl'
  sourceFileName?: string
}

export type CodexTurnNode = ContextNode & {
  type: 'chat'
  codexImport: CodexTurnMetadata
}

export type CodexCanvasPatch = {
  nodes: CodexTurnNode[]
  edges: ContextEdge[]
}

export type CodexImportPayload = {
  patch: CodexCanvasPatch
  session: CodexSessionImport
  sourceFileName: string
  splitTurns: boolean
  connectStartAndEnd: boolean
  usedContextCandidates: CodexUsedContextCandidate[]
  selectedUsedContextIds: string[]
}

export type CodexExportRequest = {
  marker: string
  prompt: string
  createdAt: string
}
