import type { CodexSessionImport, CodexTurnItem, CodexUsedContextCandidate } from './types'

const pathPattern = /(?:^|["'\s`])((?:(?:\.?\.?\/|\/|[A-Za-z]:[\\/])?[^\s"'`<>]+[\\/])?[^\s"'`<>]+\.(?:md|markdown|txt|docx|tsx?|jsx?|json|ya?ml|toml|css|html|png|jpe?g|gif|webp|svg))(?:$|["'\s`])/gi
const extensionPattern = /\.(md|markdown|txt|docx|tsx?|jsx?|json|ya?ml|toml|css|html|png|jpe?g|gif|webp|svg)$/i

function cleanPath(value: string) {
  return value.replace(/[),.;:]+$/, '').replace(/\\/g, '/')
}

function pathsFromText(text: string) {
  const paths: string[] = []
  for (const match of text.matchAll(pathPattern)) {
    const path = cleanPath(match[1])
    if (!paths.includes(path)) paths.push(path)
  }
  return paths
}

function kindForPath(path: string): CodexUsedContextCandidate['kind'] {
  const extension = path.match(extensionPattern)?.[1]?.toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension || '')) return 'image'
  if (extension) return 'document'
  return 'unknown'
}

function isReadLikeTool(name: string) {
  return /read|cat|open|file|document|image/i.test(name)
}

function itemOutput(items: CodexTurnItem[], callId: string) {
  const output = items.find((item) => item.kind === 'tool_output' && item.callId === callId)
  return output?.kind === 'tool_output' ? output.output.trim() : ''
}

export function extractUsedContextCandidates(session: CodexSessionImport): CodexUsedContextCandidate[] {
  const candidates = new Map<string, CodexUsedContextCandidate>()

  for (const turn of session.turns) {
    for (const item of turn.items) {
      const texts = item.kind === 'tool_call'
        ? [item.input]
        : item.kind === 'tool_output'
          ? [item.output]
          : item.kind === 'message' || item.kind === 'agent_message'
            ? [item.text]
            : []
      const paths = texts.flatMap(pathsFromText)
      for (const path of paths) {
        const key = path.toLowerCase()
        const existing = candidates.get(key)
        const output = item.kind === 'tool_call' && isReadLikeTool(item.name) ? itemOutput(turn.items, item.callId) : undefined
        const next: CodexUsedContextCandidate = existing || {
          id: `used_context_${candidates.size + 1}`,
          path,
          kind: kindForPath(path),
          evidence: [],
          confidence: 'mentioned',
        }
        next.evidence = Array.from(new Set([...next.evidence, `Turn ${turn.sequenceIndex + 1} · ${item.kind === 'tool_call' ? item.name : 'message'}`]))
        if (output && output.length > 0 && next.kind === 'document') {
          next.content = next.content || output
          next.confidence = 'observed'
        }
        candidates.set(key, next)
      }
    }
  }

  return Array.from(candidates.values())
}
