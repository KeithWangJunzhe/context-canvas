import type { ContextBlock } from '../../types'
import {
  BuildCodexCanvasOptions,
  CodexCanvasDisposition,
  CodexCanvasPatch,
  CodexCanvasPolicyKey,
  CodexSessionImport,
  CodexTurnItem,
} from './types'

const defaultPolicy: Record<CodexCanvasPolicyKey, CodexCanvasDisposition> = {
  user: 'included',
  assistant_final: 'included',
  assistant_commentary: 'included',
  assistant_unknown: 'included',
  agent_message: 'included',
  tool_call: 'included',
  tool_output: 'included',
}

function summary(text: string, maxLength = 46) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized
}

function policyKey(item: CodexTurnItem): CodexCanvasPolicyKey {
  if (item.kind === 'tool_call') return 'tool_call'
  if (item.kind === 'tool_output') return 'tool_output'
  if (item.kind === 'agent_message') return 'agent_message'
  if (item.role === 'user') return 'user'
  if (item.phase === 'final_answer') return 'assistant_final'
  if (item.phase === 'commentary') return 'assistant_commentary'
  return 'assistant_unknown'
}

function blockText(item: CodexTurnItem) {
  if (item.kind === 'message') return item.text
  if (item.kind === 'agent_message') return item.text
  if (item.kind === 'tool_call') return item.input ? `${item.name}\n${item.input}` : item.name
  const toolName = item.name || item.callId
  return item.output ? `${toolName}\n${item.output}` : toolName
}

function speakerName(item: CodexTurnItem) {
  if (item.kind === 'tool_call') return `Tool call · ${item.name}`
  if (item.kind === 'tool_output') return `Tool output · ${item.name || item.callId}`
  if (item.kind === 'agent_message') return `Agent · ${item.author}`
  if (item.role === 'user') return 'User'
  if (item.phase === 'commentary') return 'Codex · commentary'
  if (item.phase === 'final_answer') return 'Codex · final'
  return 'Codex'
}

export function buildCodexCanvasPatch(session: CodexSessionImport, options: BuildCodexCanvasOptions): CodexCanvasPatch {
  const policy = { ...defaultPolicy, ...options.policy }
  const importedAt = new Date().toISOString()
  const nodes = session.turns.map((turn) => {
    const nodeId = options.createId('node_codex_turn')
    const userMessage = turn.items.find((item) => item.kind === 'message' && item.role === 'user')
    let sourceOrder = 0
    const blocks = turn.items.reduce<ContextBlock[]>((result, item) => {
      const disposition = policy[policyKey(item)]
      if (disposition === 'omit') return result
      result.push({
        id: options.createId('block_codex'),
        nodeId,
        type: 'message',
        role: item.kind === 'message' ? item.role : item.kind === 'agent_message' ? 'assistant' : 'tool',
        speakerName: speakerName(item),
        text: blockText(item),
        status: disposition,
        tags: [],
        sourceOrder: sourceOrder++,
      })
      return result
    }, [])
    const createdAt = turn.startedAt || session.session.createdAt || importedAt

    return {
      id: nodeId,
      type: 'chat' as const,
      title: `Turn ${turn.sequenceIndex + 1} · ${summary(userMessage?.kind === 'message' ? userMessage.text : 'Codex conversation')}`,
      sourceName: options.sourceFileName,
      sourcePath: options.sourceFileName,
      blocks,
      regions: [],
      createdAt,
      updatedAt: turn.completedAt || createdAt,
      codexImport: {
        codexSessionId: session.session.codexSessionId,
        codexThreadId: session.session.codexThreadId,
        codexTurnId: turn.codexTurnId,
        sequenceIndex: turn.sequenceIndex,
        startedAt: turn.startedAt,
        completedAt: turn.completedAt,
        status: turn.status,
        initiator: turn.initiator,
        sourceFormat: 'codex-rollout-jsonl' as const,
        sourceFileName: options.sourceFileName,
      },
    }
  })

  const chain = nodes.map((node) => node.id)
  if (options.connectStartAndEnd !== false) chain.unshift(options.startNodeId)
  if (options.connectStartAndEnd !== false) chain.push(options.endNodeId)
  const edges = chain.slice(0, -1).map((from, index) => ({
    id: options.createId('edge_codex_turn'),
    from,
    to: chain[index + 1],
    label: 'next turn',
  }))

  return { nodes, edges }
}
