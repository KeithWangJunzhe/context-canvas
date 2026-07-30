import {
  CODEX_IMPORT_SCHEMA_VERSION,
  CodexImportDiagnostic,
  CodexRolloutParseResult,
  CodexSourceRef,
  CodexTurnImport,
  CodexTurnItem,
  ParseCodexRolloutOptions,
} from './types'

type JsonObject = Record<string, unknown>

type ParsedRecord = {
  sourceLine: number
  type?: string
  timestamp?: string
  payload: JsonObject
}

type ResponseUserCandidate = {
  text: string
  source: CodexSourceRef
}

type TurnDraft = {
  codexTurnId: string
  sourceLine: number
  status: CodexTurnImport['status']
  startedAt?: string
  completedAt?: string
  cwd?: string
  model?: string
  eventUser?: ResponseUserCandidate
  responseUsers: ResponseUserCandidate[]
  items: CodexTurnItem[]
  rolledBack: boolean
  registeredAsUserTurn: boolean
  callNames: Map<string, string>
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function asInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

function normalizedText(value: unknown) {
  const text = asString(value)?.trim()
  return text || undefined
}

function normalizeTimestamp(value: unknown, fallback?: string) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000
    const date = new Date(milliseconds)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  if (typeof value === 'string') {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  return fallback
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function textFromContent(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (!Array.isArray(value)) return ''

  return value
    .map((part) => {
      if (typeof part === 'string') return part
      if (!isObject(part)) return ''
      const text = asString(part.text)
      if (text) return text
      if (part.type === 'image' || part.type === 'input_image') return '[image attachment]'
      return ''
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

function sourceFor(record: ParsedRecord, recordType: CodexSourceRef['recordType']): CodexSourceRef {
  return {
    recordType,
    sourceLine: record.sourceLine,
    timestamp: record.timestamp,
    recordId: asString(record.payload.id),
  }
}

function eventType(record: ParsedRecord) {
  return record.type === 'event_msg' ? asString(record.payload.type) : undefined
}

function eventTurnId(record: ParsedRecord) {
  return asString(record.payload.turn_id)
}

function isTurnStarted(type?: string) {
  return type === 'task_started' || type === 'turn_started'
}

function isTurnComplete(type?: string) {
  return type === 'task_complete' || type === 'turn_complete'
}

function responseTurnId(record: ParsedRecord) {
  if (record.type !== 'response_item') return undefined
  const metadata = record.payload.internal_chat_message_metadata_passthrough
  return isObject(metadata) ? asString(metadata.turn_id) : undefined
}

function userTextForMarker(record: ParsedRecord) {
  if (record.type === 'event_msg' && eventType(record) === 'user_message') {
    return normalizedText(record.payload.message)
  }
  if (record.type === 'response_item' && record.payload.type === 'message' && record.payload.role === 'user') {
    return textFromContent(record.payload.content)
  }
  return undefined
}

function parseRecords(jsonl: string, diagnostics: CodexImportDiagnostic[]) {
  const records: ParsedRecord[] = []
  const lines = jsonl.replace(/^\uFEFF/, '').split(/\r?\n/)
  const lastNonEmptyLine = lines.reduce((last, line, index) => (line.trim() ? index + 1 : last), 0)

  lines.forEach((line, index) => {
    const sourceLine = index + 1
    if (!line.trim()) return
    try {
      const parsed = JSON.parse(line) as unknown
      if (!isObject(parsed)) throw new Error('record is not an object')
      records.push({
        sourceLine,
        type: asString(parsed.type),
        timestamp: asString(parsed.timestamp),
        payload: isObject(parsed.payload) ? parsed.payload : {},
      })
    } catch {
      diagnostics.push({
        level: 'warning',
        code: sourceLine === lastNonEmptyLine ? 'TRAILING_PARTIAL_LINE' : 'INVALID_JSON_LINE',
        message: sourceLine === lastNonEmptyLine ? '文件末尾包含不完整的 JSONL 记录，已忽略。' : `第 ${sourceLine} 行不是有效 JSON，已忽略。`,
        sourceLine,
      })
    }
  })

  return records
}

function findMarkerBoundary(records: ParsedRecord[], marker: string) {
  let currentTurnId: string | undefined
  let fallbackTurn = 0
  const turnStartLines = new Map<string, number>()
  const lastUserTextByTurn = new Map<string, string>()
  const matches = new Map<string, { sourceLine: number; turnStartLine: number }>()

  for (const record of records) {
    const type = eventType(record)
    if (isTurnStarted(type)) {
      currentTurnId = eventTurnId(record) || `marker_fallback_${++fallbackTurn}`
      turnStartLines.set(currentTurnId, record.sourceLine)
    } else if (record.type === 'turn_context') {
      currentTurnId = eventTurnId(record) || currentTurnId
      if (currentTurnId && !turnStartLines.has(currentTurnId)) turnStartLines.set(currentTurnId, record.sourceLine)
    }

    const nativeResponseTurnId = responseTurnId(record)
    if (nativeResponseTurnId) {
      currentTurnId = nativeResponseTurnId
      if (!turnStartLines.has(nativeResponseTurnId)) turnStartLines.set(nativeResponseTurnId, record.sourceLine)
    }

    const userText = userTextForMarker(record)
    if (userText?.includes(marker)) {
      if (currentTurnId?.startsWith('marker_fallback_') && lastUserTextByTurn.has(currentTurnId) && lastUserTextByTurn.get(currentTurnId) !== userText) {
        currentTurnId = `marker_fallback_${++fallbackTurn}`
        turnStartLines.set(currentTurnId, record.sourceLine)
      }
      const markerTurnId = currentTurnId || `marker_user_${record.sourceLine}`
      matches.set(markerTurnId, {
        sourceLine: record.sourceLine,
        turnStartLine: turnStartLines.get(markerTurnId) || record.sourceLine,
      })
    }
    if (userText && currentTurnId) lastUserTextByTurn.set(currentTurnId, userText)

    if (isTurnComplete(type) || type === 'turn_aborted') currentTurnId = undefined
  }

  return matches
}

function parseFailure(error: CodexImportDiagnostic, diagnostics: CodexImportDiagnostic[]): CodexRolloutParseResult {
  return { ok: false, error, diagnostics: [...diagnostics, error] }
}

function assistantPhase(value: unknown): 'commentary' | 'final_answer' | 'unknown' {
  return value === 'commentary' || value === 'final_answer' ? value : 'unknown'
}

export function parseCodexRolloutJsonl(jsonl: string, options: ParseCodexRolloutOptions = {}): CodexRolloutParseResult {
  const diagnostics: CodexImportDiagnostic[] = []
  const allRecords = parseRecords(jsonl, diagnostics)
  const invalidMiddleLine = diagnostics.find((diagnostic) => diagnostic.code === 'INVALID_JSON_LINE')
  if (invalidMiddleLine) {
    return parseFailure(
      {
        level: 'error',
        code: 'CORRUPT_JSONL',
        message: `第 ${invalidMiddleLine.sourceLine} 行损坏，无法安全判断 Turn 或 rollback 边界，已停止导入。`,
        sourceLine: invalidMiddleLine.sourceLine,
      },
      diagnostics,
    )
  }
  if (allRecords.length === 0) {
    return parseFailure({ level: 'error', code: 'EMPTY_FILE', message: '文件中没有可读取的 JSONL 记录。' }, diagnostics)
  }

  let records = allRecords
  let boundary: { kind: 'eof' } | { kind: 'marker'; markerTurnId?: string; sourceLine: number } = { kind: 'eof' }
  if (options.cutoffMarker) {
    const markerMatches = findMarkerBoundary(allRecords, options.cutoffMarker)
    if (markerMatches.size > 1) {
      return parseFailure({ level: 'error', code: 'AMBIGUOUS_MARKER', message: '同一文件中有多个 Turn 包含导出标记，无法安全确定导入边界。' }, diagnostics)
    }
    const match = markerMatches.entries().next().value as [string, { sourceLine: number; turnStartLine: number }] | undefined
    if (match) {
      const [markerTurnId, markerRecord] = match
      records = allRecords.filter((record) => record.sourceLine < markerRecord.turnStartLine)
      boundary = { kind: 'marker', markerTurnId, sourceLine: markerRecord.sourceLine }
    } else if (options.markerMode === 'required') {
      return parseFailure({ level: 'error', code: 'MARKER_NOT_FOUND', message: '没有在用户消息中找到本次导出标记。' }, diagnostics)
    }
  }

  const sessionIds = new Set<string>()
  const threadIds = new Set<string>()
  let sessionCreatedAt: string | undefined
  let sessionCwd: string | undefined
  let cliVersion: string | undefined
  let sessionSource: string | undefined

  for (const record of records) {
    if (record.type !== 'session_meta') continue
    const sessionId = asString(record.payload.session_id) || asString(record.payload.id)
    const threadId = asString(record.payload.id)
    if (sessionId) sessionIds.add(sessionId)
    if (threadId) threadIds.add(threadId)
    sessionCreatedAt ||= normalizeTimestamp(record.payload.timestamp, record.timestamp)
    sessionCwd ||= asString(record.payload.cwd)
    cliVersion ||= asString(record.payload.cli_version)
    sessionSource ||= asString(record.payload.source)
  }

  if (sessionIds.size === 0) {
    return parseFailure({ level: 'error', code: 'SESSION_ID_MISSING', message: '这不像完整的 Codex rollout：没有找到 session_meta.payload.session_id 或 id。' }, diagnostics)
  }
  if (sessionIds.size > 1) {
    return parseFailure({ level: 'error', code: 'MULTIPLE_SESSIONS', message: '文件中混入了多个 Codex session，已停止导入。' }, diagnostics)
  }

  const codexSessionId = [...sessionIds][0]
  const codexThreadId = threadIds.size === 1 ? [...threadIds][0] : undefined
  const drafts = new Map<string, TurnDraft>()
  const draftOrder: TurnDraft[] = []
  const effectiveUserTurnStack: TurnDraft[] = []
  const seenResponseIds = new Set<string>()
  let currentTurnId: string | undefined
  let fallbackTurnIndex = 0
  let omittedTurnCount = 0

  const ensureDraft = (turnId: string, record: ParsedRecord) => {
    const existing = drafts.get(turnId)
    if (existing) return existing
    const draft: TurnDraft = {
      codexTurnId: turnId,
      sourceLine: record.sourceLine,
      status: 'in_progress',
      startedAt: record.timestamp,
      responseUsers: [],
      items: [],
      rolledBack: false,
      registeredAsUserTurn: false,
      callNames: new Map(),
    }
    drafts.set(turnId, draft)
    draftOrder.push(draft)
    return draft
  }

  const currentDraft = (record: ParsedRecord) => {
    if (!currentTurnId) currentTurnId = `legacy_${codexSessionId}_${++fallbackTurnIndex}`
    return ensureDraft(currentTurnId, record)
  }

  const registerUserTurn = (draft: TurnDraft) => {
    if (draft.registeredAsUserTurn) return
    draft.registeredAsUserTurn = true
    effectiveUserTurnStack.push(draft)
  }

  for (const record of records) {
    const type = eventType(record)

    if (isTurnStarted(type)) {
      currentTurnId = eventTurnId(record) || `legacy_${codexSessionId}_${++fallbackTurnIndex}`
      const draft = ensureDraft(currentTurnId, record)
      draft.startedAt = normalizeTimestamp(record.payload.started_at, record.timestamp) || draft.startedAt
      continue
    }

    if (record.type === 'turn_context') {
      currentTurnId = eventTurnId(record) || currentTurnId || `legacy_${codexSessionId}_${++fallbackTurnIndex}`
      const draft = ensureDraft(currentTurnId, record)
      draft.cwd ||= asString(record.payload.cwd)
      draft.model ||= asString(record.payload.model)
      draft.startedAt ||= record.timestamp
      continue
    }

    if (type === 'user_message') {
      const text = normalizedText(record.payload.message)
      if (!text) continue
      let draft = currentDraft(record)
      if (draft.codexTurnId.startsWith('legacy_') && (Boolean(draft.eventUser) || draft.items.length > 0)) {
        currentTurnId = `legacy_${codexSessionId}_${++fallbackTurnIndex}`
        draft = ensureDraft(currentTurnId, record)
      }
      if (draft.eventUser && draft.eventUser.text !== text) {
        diagnostics.push({ level: 'warning', code: 'MULTIPLE_EVENT_USERS', message: `Turn ${draft.codexTurnId} 中出现了多个不同的 user_message，保留第一条。`, sourceLine: record.sourceLine })
      } else {
        draft.eventUser ||= { text, source: sourceFor(record, 'event_msg') }
      }
      registerUserTurn(draft)
      continue
    }

    if (type === 'agent_message') {
      const text = normalizedText(record.payload.message)
      if (!text) continue
      const draft = currentDraft(record)
      const phase = assistantPhase(record.payload.phase)
      const mirrored = draft.items.some(
        (item) =>
          item.kind === 'message' &&
          item.role === 'assistant' &&
          item.text === text &&
          ((item.phase || 'unknown') === phase || item.phase === 'unknown' || phase === 'unknown'),
      )
      if (!mirrored) draft.items.push({ kind: 'message', role: 'assistant', phase, text, source: sourceFor(record, 'event_msg') })
      continue
    }

    if (isTurnComplete(type)) {
      const turnId = eventTurnId(record) || currentTurnId
      if (!turnId) continue
      const draft = ensureDraft(turnId, record)
      draft.status = 'completed'
      draft.startedAt ||= normalizeTimestamp(record.payload.started_at, record.timestamp)
      draft.completedAt = normalizeTimestamp(record.payload.completed_at, record.timestamp)
      const lastMessage = normalizedText(record.payload.last_agent_message)
      if (lastMessage) {
        const existingLastMessage = draft.items.findIndex(
          (item) => item.kind === 'message' && item.role === 'assistant' && item.text === lastMessage,
        )
        if (existingLastMessage >= 0) {
          const existing = draft.items[existingLastMessage]
          if (existing.kind === 'message' && existing.phase === 'unknown') {
            draft.items[existingLastMessage] = { ...existing, phase: 'final_answer' }
          }
        } else {
          draft.items.push({ kind: 'message', role: 'assistant', phase: 'final_answer', text: lastMessage, source: sourceFor(record, 'task_complete') })
        }
      }
      if (currentTurnId === turnId) currentTurnId = undefined
      continue
    }

    if (type === 'turn_aborted') {
      const turnId = eventTurnId(record) || currentTurnId
      if (!turnId) continue
      const draft = ensureDraft(turnId, record)
      draft.status = 'aborted'
      draft.completedAt = normalizeTimestamp(record.payload.completed_at, record.timestamp)
      if (currentTurnId === turnId) currentTurnId = undefined
      continue
    }

    if (type === 'thread_rolled_back') {
      const count = Math.max(0, asInteger(record.payload.num_turns) || 0)
      if (count > effectiveUserTurnStack.length) {
        return parseFailure(
          {
            level: 'error',
            code: 'ROLLBACK_UNDERFLOW',
            message: `rollback 要移除 ${count} 个用户 Turn，但当前只识别出 ${effectiveUserTurnStack.length} 个，已停止导入。`,
            sourceLine: record.sourceLine,
          },
          diagnostics,
        )
      }
      for (let index = 0; index < count; index += 1) {
        const rolledBack = effectiveUserTurnStack.pop()
        if (!rolledBack) break
        if (!rolledBack.rolledBack) omittedTurnCount += 1
        rolledBack.rolledBack = true
        if (currentTurnId === rolledBack.codexTurnId) currentTurnId = undefined
      }
      continue
    }

    if (type === 'web_search_end') {
      const draft = currentDraft(record)
      const callId = asString(record.payload.call_id) || `web_search_${record.sourceLine}`
      const query = normalizedText(record.payload.query)
      const input = query || stringifyValue(record.payload.action).trim() || 'web search'
      draft.callNames.set(callId, 'web_search')
      draft.items.push({
        kind: 'tool_call',
        callId,
        name: 'web_search',
        input,
        source: sourceFor(record, 'event_msg'),
      })
      draft.items.push({
        kind: 'tool_output',
        callId,
        name: 'web_search',
        output: stringifyValue(record.payload.results).trim(),
        source: sourceFor(record, 'event_msg'),
      })
      continue
    }

    if (record.type !== 'response_item') continue
    const responseId = asString(record.payload.id)
    if (responseId && seenResponseIds.has(responseId)) continue
    if (responseId) seenResponseIds.add(responseId)
    const nativeResponseTurnId = responseTurnId(record)
    if (nativeResponseTurnId) {
      currentTurnId = nativeResponseTurnId
      ensureDraft(nativeResponseTurnId, record)
    }

    if (record.payload.type === 'message') {
      const role = asString(record.payload.role)
      const text = textFromContent(record.payload.content)
      if (!text) continue
      const draft = currentDraft(record)
      if (role === 'user') {
        let userDraft = draft
        if (!nativeResponseTurnId && draft.codexTurnId.startsWith('legacy_') && draft.registeredAsUserTurn && draft.items.length > 0) {
          currentTurnId = `legacy_${codexSessionId}_${++fallbackTurnIndex}`
          userDraft = ensureDraft(currentTurnId, record)
        }
        userDraft.responseUsers.push({ text, source: sourceFor(record, 'response_item') })
        registerUserTurn(userDraft)
      } else if (role === 'assistant') {
        const phase = assistantPhase(record.payload.phase)
        const responseMessage: CodexTurnItem = {
          kind: 'message',
          role: 'assistant',
          phase,
          text,
          source: sourceFor(record, 'response_item'),
        }
        const mirroredEventIndex = draft.items.findIndex(
          (item) =>
            item.kind === 'message' &&
            item.role === 'assistant' &&
            item.source.recordType === 'event_msg' &&
            item.text === text &&
            ((item.phase || 'unknown') === phase || item.phase === 'unknown' || phase === 'unknown'),
        )
        if (mirroredEventIndex >= 0) draft.items[mirroredEventIndex] = responseMessage
        else draft.items.push(responseMessage)
      }
      continue
    }

    if (record.payload.type === 'agent_message') {
      const text = textFromContent(record.payload.content)
      if (!text) continue
      const draft = currentDraft(record)
      draft.items.push({
        kind: 'agent_message',
        author: asString(record.payload.author) || 'sub-agent',
        recipient: asString(record.payload.recipient) || 'root',
        text,
        source: sourceFor(record, 'response_item'),
      })
      continue
    }

    if (record.payload.type === 'custom_tool_call' || record.payload.type === 'function_call') {
      const draft = currentDraft(record)
      const callId = asString(record.payload.call_id) || `call_${record.sourceLine}`
      const name = asString(record.payload.name) || 'tool'
      const input = stringifyValue(record.payload.input ?? record.payload.arguments).trim()
      draft.callNames.set(callId, name)
      draft.items.push({
        kind: 'tool_call',
        callId,
        name,
        input,
        status: asString(record.payload.status),
        source: sourceFor(record, 'response_item'),
      })
      continue
    }

    if (record.payload.type === 'custom_tool_call_output' || record.payload.type === 'function_call_output') {
      const draft = currentDraft(record)
      const callId = asString(record.payload.call_id) || `call_${record.sourceLine}`
      const output = textFromContent(record.payload.output) || stringifyValue(record.payload.output).trim()
      draft.items.push({
        kind: 'tool_output',
        callId,
        name: draft.callNames.get(callId),
        output,
        source: sourceFor(record, 'response_item'),
      })
    }
  }

  const turns: CodexTurnImport[] = []
  for (const draft of draftOrder) {
    if (draft.rolledBack) continue
    const user = draft.eventUser || draft.responseUsers[draft.responseUsers.length - 1]
    if (!user) {
      if (draft.items.length > 0) {
        diagnostics.push({
          level: 'warning',
          code: 'TURN_WITHOUT_USER',
          message: `Turn ${draft.codexTurnId} 没有可确认的真实用户消息，未生成节点。`,
          sourceLine: draft.sourceLine,
        })
      }
      continue
    }

    const items = draft.items.map((item) =>
      item.kind === 'tool_output' && !item.name ? { ...item, name: draft.callNames.get(item.callId) } : item,
    )
    turns.push({
      codexTurnId: draft.codexTurnId,
      sequenceIndex: turns.length,
      status: draft.status,
      initiator: draft.eventUser ? 'user' : 'unknown',
      initiatorEvidence: draft.eventUser ? 'event_msg.user_message' : 'response_item.user',
      startedAt: draft.startedAt,
      completedAt: draft.completedAt,
      cwd: draft.cwd,
      model: draft.model,
      items: [{ kind: 'message', role: 'user', text: user.text, source: user.source }, ...items],
    })
  }

  if (turns.length === 0) {
    return parseFailure({ level: 'error', code: 'NO_USER_TURNS', message: '没有找到可导入的用户 Turn。请确认拖入的是完整 Codex rollout JSONL。' }, diagnostics)
  }

  const assistantMessageCount = turns.reduce(
    (count, turn) => count + turn.items.filter((item) => item.kind === 'message' && item.role === 'assistant').length,
    0,
  )
  const agentMessageCount = turns.reduce((count, turn) => count + turn.items.filter((item) => item.kind === 'agent_message').length, 0)
  const toolCallCount = turns.reduce((count, turn) => count + turn.items.filter((item) => item.kind === 'tool_call').length, 0)
  const toolOutputCount = turns.reduce((count, turn) => count + turn.items.filter((item) => item.kind === 'tool_output').length, 0)
  const firstTimestamp = sessionCreatedAt || records.find((record) => record.timestamp)?.timestamp
  const lastTimestamp = [...records].reverse().find((record) => record.timestamp)?.timestamp

  return {
    ok: true,
    data: {
      schemaVersion: CODEX_IMPORT_SCHEMA_VERSION,
      sourceFormat: 'codex-rollout-jsonl',
      sourceFileName: options.sourceFileName,
      boundary,
      session: {
        codexSessionId,
        codexThreadId,
        createdAt: sessionCreatedAt,
        cwd: sessionCwd || turns.find((turn) => turn.cwd)?.cwd,
        cliVersion,
        source: sessionSource,
      },
      turns,
      diagnostics,
      stats: {
        sourceRecordCount: records.length,
        importedTurnCount: turns.length,
        omittedTurnCount,
        assistantMessageCount,
        agentMessageCount,
        toolCallCount,
        toolOutputCount,
        invalidLineCount: diagnostics.filter((item) => item.code === 'INVALID_JSON_LINE' || item.code === 'TRAILING_PARTIAL_LINE').length,
        firstTimestamp,
        lastTimestamp,
      },
    },
  }
}
