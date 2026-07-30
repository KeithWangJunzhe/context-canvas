import { createServer } from 'vite'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function line(timestamp, type, payload) {
  return JSON.stringify({ timestamp, type, payload })
}

function taskStart(timestamp, turnId) {
  return line(timestamp, 'event_msg', { type: 'task_started', turn_id: turnId })
}

function userMessage(timestamp, message) {
  return line(timestamp, 'event_msg', { type: 'user_message', message })
}

function taskComplete(timestamp, turnId) {
  return line(timestamp, 'event_msg', { type: 'task_complete', turn_id: turnId })
}

function turnComplete(timestamp, turnId, lastAgentMessage) {
  return line(timestamp, 'event_msg', {
    type: 'turn_complete',
    turn_id: turnId,
    last_agent_message: lastAgentMessage,
  })
}

const server = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { parseCodexRolloutJsonl } = await server.ssrLoadModule('/src/features/codex-import/parseCodexRollout.ts')
  const { buildCodexCanvasPatch } = await server.ssrLoadModule('/src/features/codex-import/toCanvas.ts')
  const marker = 'CONTEXT_CANVAS_EXPORT_SYNTHETIC'
  const markerFixture = [
    line('2026-01-01T00:00:00.000Z', 'session_meta', { id: 'session-marker', cwd: '/tmp/marker-project' }),
    taskStart('2026-01-01T00:00:01.000Z', 'turn-1'),
    line('2026-01-01T00:00:02.000Z', 'turn_context', { turn_id: 'turn-1', cwd: '/tmp/marker-project' }),
    line('2026-01-01T00:00:03.000Z', 'response_item', {
      type: 'message',
      role: 'user',
      internal_chat_message_metadata_passthrough: { turn_id: 'turn-1' },
      content: [{ type: 'input_text', text: 'injected wrapper' }],
    }),
    userMessage('2026-01-01T00:00:04.000Z', 'real user message'),
    line('2026-01-01T00:00:05.000Z', 'event_msg', { type: 'agent_message', phase: 'commentary', message: 'working' }),
    line('2026-01-01T00:00:06.000Z', 'response_item', {
      id: 'assistant-1',
      type: 'message',
      role: 'assistant',
      phase: 'commentary',
      internal_chat_message_metadata_passthrough: { turn_id: 'turn-1' },
      content: [{ type: 'output_text', text: 'working' }],
    }),
    line('2026-01-01T00:00:07.000Z', 'response_item', {
      type: 'custom_tool_call',
      call_id: 'call-1',
      name: 'exec',
      input: 'pwd',
      internal_chat_message_metadata_passthrough: { turn_id: 'turn-1' },
    }),
    line('2026-01-01T00:00:08.000Z', 'response_item', {
      type: 'custom_tool_call_output',
      call_id: 'call-1',
      output: [{ type: 'input_text', text: '/tmp/marker-project' }],
      internal_chat_message_metadata_passthrough: { turn_id: 'turn-1' },
    }),
    taskComplete('2026-01-01T00:00:09.000Z', 'turn-1'),
    taskStart('2026-01-01T00:00:10.000Z', 'turn-marker'),
    userMessage('2026-01-01T00:00:11.000Z', `export ${marker}`),
    line('2026-01-01T00:00:12.000Z', 'event_msg', { type: 'agent_message', phase: 'final_answer', message: 'must be excluded' }),
  ].join('\n')

  const markerResult = parseCodexRolloutJsonl(markerFixture, { cutoffMarker: marker })
  assert(markerResult.ok, 'marker fixture should parse')
  assert(markerResult.data.turns.length === 1, 'marker turn and later records must be excluded')
  assert(markerResult.data.boundary.kind === 'marker', 'marker boundary should be reported')
  assert(markerResult.data.turns[0].items[0].text === 'real user message', 'event user_message must beat injected response user')
  assert(markerResult.data.stats.assistantMessageCount === 1, 'assistant event/response mirrors must be deduplicated')
  assert(markerResult.data.stats.toolCallCount === 1 && markerResult.data.stats.toolOutputCount === 1, 'tool call/output should be retained')

  const rollbackFixture = [
    line('2026-01-02T00:00:00.000Z', 'session_meta', { id: 'session-rollback' }),
    taskStart('2026-01-02T00:00:01.000Z', 'turn-a'),
    userMessage('2026-01-02T00:00:02.000Z', 'keep a'),
    taskComplete('2026-01-02T00:00:03.000Z', 'turn-a'),
    taskStart('2026-01-02T00:00:04.000Z', 'turn-b'),
    userMessage('2026-01-02T00:00:05.000Z', 'remove b'),
    line('2026-01-02T00:00:06.000Z', 'event_msg', { type: 'turn_aborted', turn_id: 'turn-b' }),
    line('2026-01-02T00:00:07.000Z', 'event_msg', { type: 'thread_rolled_back', num_turns: 1 }),
    taskStart('2026-01-02T00:00:08.000Z', 'turn-c'),
    userMessage('2026-01-02T00:00:09.000Z', 'keep c'),
    taskComplete('2026-01-02T00:00:10.000Z', 'turn-c'),
    '{"trailing":',
  ].join('\n')

  const rollbackResult = parseCodexRolloutJsonl(rollbackFixture)
  assert(rollbackResult.ok, 'rollback fixture should tolerate a partial final line')
  assert(rollbackResult.data.turns.map((turn) => turn.codexTurnId).join(',') === 'turn-a,turn-c', 'rollback should remove the last user turn only')
  assert(rollbackResult.data.stats.omittedTurnCount === 1, 'rollback omission should be counted')
  assert(rollbackResult.data.stats.invalidLineCount === 1, 'partial trailing line should be diagnosed')

  const extendedFixture = [
    line('2026-01-03T00:00:00.000Z', 'session_meta', {
      session_id: 'session-native',
      id: 'thread-native',
      cwd: '/tmp/extended-project',
    }),
    line('2026-01-03T00:00:01.000Z', 'event_msg', { type: 'turn_started', turn_id: 'turn-extended' }),
    userMessage('2026-01-03T00:00:02.000Z', 'exercise extended rollout records'),
    line('2026-01-03T00:00:03.000Z', 'response_item', {
      id: 'assistant-unknown',
      type: 'message',
      role: 'assistant',
      internal_chat_message_metadata_passthrough: { turn_id: 'turn-extended' },
      content: [{ type: 'output_text', text: 'shared final answer' }],
    }),
    line('2026-01-03T00:00:04.000Z', 'event_msg', {
      type: 'agent_message',
      message: 'shared final answer',
    }),
    line('2026-01-03T00:00:05.000Z', 'response_item', {
      id: 'subagent-message-1',
      type: 'agent_message',
      author: 'reviewer',
      recipient: 'root',
      internal_chat_message_metadata_passthrough: { turn_id: 'turn-extended' },
      content: [{ type: 'output_text', text: 'sub-agent result' }],
    }),
    line('2026-01-03T00:00:06.000Z', 'event_msg', {
      type: 'web_search_end',
      call_id: 'web-search-1',
      query: 'Codex rollout JSONL',
      results: [{ title: 'Codex docs', url: 'https://example.test/codex' }],
    }),
    turnComplete('2026-01-03T00:00:07.000Z', 'turn-extended', 'shared final answer'),
  ].join('\n')

  const extendedResult = parseCodexRolloutJsonl(extendedFixture)
  assert(extendedResult.ok, 'extended Codex records should parse')
  assert(extendedResult.data.session.codexSessionId === 'session-native', 'session_id must take priority over id')
  assert(extendedResult.data.session.codexThreadId === 'thread-native', 'session_meta.id must be retained as codexThreadId')
  assert(extendedResult.data.turns.length === 1, 'extended fixture should create one Turn')
  assert(extendedResult.data.turns[0].status === 'completed', 'turn_complete should complete the Turn')

  const assistantItems = extendedResult.data.turns[0].items.filter(
    (item) => item.kind === 'message' && item.role === 'assistant',
  )
  assert(assistantItems.length === 1, 'response-first/event unknown assistant mirrors must be deduplicated')
  assert(assistantItems[0].phase === 'final_answer', 'turn_complete.last_agent_message must upgrade the mirrored assistant to final')

  const agentItem = extendedResult.data.turns[0].items.find((item) => item.kind === 'agent_message')
  assert(agentItem?.author === 'reviewer' && agentItem.recipient === 'root', 'response_item.agent_message metadata should be retained')
  assert(agentItem?.text === 'sub-agent result', 'response_item.agent_message content should be retained')
  assert(extendedResult.data.stats.agentMessageCount === 1, 'agent message stats should be counted')

  const webCall = extendedResult.data.turns[0].items.find(
    (item) => item.kind === 'tool_call' && item.callId === 'web-search-1',
  )
  const webOutput = extendedResult.data.turns[0].items.find(
    (item) => item.kind === 'tool_output' && item.callId === 'web-search-1',
  )
  assert(webCall?.name === 'web_search' && webCall.input === 'Codex rollout JSONL', 'web_search_end should create a named tool call')
  assert(webOutput?.name === 'web_search' && webOutput.output.includes('Codex docs'), 'web_search_end results should create a paired tool output')

  const corruptMiddleFixture = [
    line('2026-01-04T00:00:00.000Z', 'session_meta', { session_id: 'session-corrupt', id: 'thread-corrupt' }),
    taskStart('2026-01-04T00:00:01.000Z', 'turn-corrupt'),
    userMessage('2026-01-04T00:00:02.000Z', 'must not import around corruption'),
    '{"broken":',
    taskComplete('2026-01-04T00:00:04.000Z', 'turn-corrupt'),
  ].join('\n')

  const corruptMiddleResult = parseCodexRolloutJsonl(corruptMiddleFixture)
  assert(!corruptMiddleResult.ok, 'a corrupt middle JSONL line must fail the import')
  assert(corruptMiddleResult.error.code === 'CORRUPT_JSONL', 'middle corruption should report CORRUPT_JSONL')

  const rollbackUnderflowFixture = [
    line('2026-01-05T00:00:00.000Z', 'session_meta', { session_id: 'session-underflow', id: 'thread-underflow' }),
    taskStart('2026-01-05T00:00:01.000Z', 'turn-underflow'),
    userMessage('2026-01-05T00:00:02.000Z', 'only one user Turn exists'),
    line('2026-01-05T00:00:03.000Z', 'event_msg', { type: 'thread_rolled_back', num_turns: 2 }),
  ].join('\n')

  const rollbackUnderflowResult = parseCodexRolloutJsonl(rollbackUnderflowFixture)
  assert(!rollbackUnderflowResult.ok, 'rollback underflow must fail the import')
  assert(rollbackUnderflowResult.error.code === 'ROLLBACK_UNDERFLOW', 'rollback underflow should report ROLLBACK_UNDERFLOW')

  let id = 0
  const patch = buildCodexCanvasPatch(markerResult.data, {
    startNodeId: 'node-start',
    endNodeId: 'node-end',
    createId: (prefix) => `${prefix}-${++id}`,
    sourceFileName: 'synthetic.jsonl',
  })
  assert(patch.nodes.length === 1 && patch.edges.length === 2, 'one Turn should create one node and Start/End edges')
  assert(patch.nodes[0].body === undefined, 'Codex nodes must not expose the generic Slice action')
  assert(patch.nodes[0].blocks[0].role === 'user' && patch.nodes[0].blocks[0].status === 'included', 'user block policy is incorrect')
  assert(patch.nodes[0].blocks.some((block) => block.role === 'tool' && block.status === 'needs_review'), 'tool blocks should default to needs_review')
  assert(patch.nodes[0].codexImport.codexTurnId === 'turn-1', 'Codex metadata should survive Canvas adaptation')

  console.log('Codex import verification passed: marker, identities, canonical messages, mirror dedupe/final upgrade, agents, web search, tools, rollback safety, JSONL integrity, and Canvas patch.')
} finally {
  await server.close()
}
