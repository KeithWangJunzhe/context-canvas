import { BlockStatus, BlockTag, ContextBlock, ContextNode, ImageRegion, Workspace } from './types'

const rolePattern = /^(user|assistant|system|tool|developer|用户|助手|human|ai|chatgpt|claude|codex)\s*[:：]/i
const speakerPattern = /^([^:：\n]{1,24})\s*[:：]\s*/
const sentencePattern = /[^。！？.!?\n]+[。！？.!?]?/g

export function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

function roleFromText(roleText: string): ContextBlock['role'] {
  const normalizedRole = roleText.toLowerCase()
  if (normalizedRole === 'user' || normalizedRole === 'human' || normalizedRole === '用户') return 'user'
  if (
    normalizedRole === 'assistant' ||
    normalizedRole === 'ai' ||
    normalizedRole === 'chatgpt' ||
    normalizedRole === 'claude' ||
    normalizedRole === 'codex' ||
    normalizedRole === '助手'
  ) {
    return 'assistant'
  }
  if (normalizedRole === 'system' || normalizedRole === 'developer') return 'system'
  if (normalizedRole === 'tool') return 'tool'
  return 'unknown'
}

function splitSentences(text: string) {
  return (text.match(sentencePattern) || [text]).map((part) => part.trim()).filter(Boolean)
}

function chunkParts(parts: string[], size: number) {
  const chunks: string[] = []
  for (let index = 0; index < parts.length; index += size) {
    chunks.push(parts.slice(index, index + size).join(' ').trim())
  }
  return chunks.filter(Boolean)
}

function blockStart(text: string, part: string, searchFrom: number) {
  const index = text.indexOf(part, searchFrom)
  return index >= 0 ? index : searchFrom
}

export function sliceTextToBlocks(text: string, nodeId: string, mode: 'chat' | 'document' | 'note'): ContextBlock[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  if (mode === 'chat') {
    const blocks: ContextBlock[] = []
    let currentRole: ContextBlock['role'] = 'unknown'
    let currentSpeaker = ''
    let currentLines: string[] = []
    let searchFrom = 0

    const flush = () => {
      const content = currentLines.join('\n').trim()
      if (!content) return
      const sourceOrder = blockStart(normalized, content, searchFrom)
      searchFrom = sourceOrder + content.length
      blocks.push({
        id: createId('block'),
        nodeId,
        type: 'message',
        role: currentRole,
        speakerName: currentSpeaker || undefined,
        text: content,
        status: 'needs_review',
        tags: [],
        sourceOrder,
      })
    }

    for (const line of normalized.split('\n')) {
      const match = line.match(rolePattern)
      const speakerMatch = match ? null : line.match(speakerPattern)
      if (match || speakerMatch) {
        flush()
        currentRole = match ? roleFromText(match[1]) : 'unknown'
        currentSpeaker = match ? match[1] : speakerMatch?.[1].trim() || ''
        currentLines = [line.replace(match ? rolePattern : speakerPattern, '').trim()]
      } else {
        currentLines.push(line)
      }
    }

    flush()

    if (blocks.length > 1) return blocks

    searchFrom = 0
    return splitSentences(normalized).map((sentence) => {
      const sourceOrder = blockStart(normalized, sentence, searchFrom)
      searchFrom = sourceOrder + sentence.length
      return {
        id: createId('block'),
        nodeId,
        type: 'message',
        role: 'unknown',
        text: sentence,
        status: 'needs_review',
        tags: [],
        sourceOrder,
      }
    })
  }

  const paragraphParts = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
  const parts =
    paragraphParts.length > 1
      ? paragraphParts
      : chunkParts(splitSentences(normalized), 5)
  let searchFrom = 0

  return parts
    .map((part) => {
      const sourceOrder = blockStart(normalized, part, searchFrom)
      searchFrom = sourceOrder + part.length
      return {
        id: createId('block'),
        nodeId,
        type: mode === 'note' ? 'note' : 'text',
        text: part,
        status: 'included',
        tags: [],
        sourceOrder,
      }
    })
}

export function createTextNode(type: 'chat' | 'document' | 'note', title: string, body: string, sourceName?: string, sourcePath?: string): ContextNode {
  const id = createId('node')
  const now = new Date().toISOString()
  const blocks =
    type === 'note' ? sliceTextToBlocks(body, id, 'note') : sliceTextToBlocks(body, id, type === 'chat' ? 'chat' : 'document')

  return {
    id,
    type,
    title,
    body,
    sourceName,
    sourcePath,
    blocks:
      blocks.length > 0 || !body.trim()
        ? blocks
        : [
            {
              id: createId('block'),
              nodeId: id,
              type: type === 'chat' ? 'message' : 'text',
              role: type === 'chat' ? 'unknown' : undefined,
              text: body,
              status: type === 'document' ? 'included' : 'needs_review',
              tags: [],
            },
          ],
    regions: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function createImageNode(title: string, imageUrl: string, imageName: string, imageMime?: string, imageSize?: number, sourcePath?: string): ContextNode {
  const now = new Date().toISOString()
  return {
    id: createId('node'),
    type: 'image',
    title,
    sourceName: imageName,
    sourcePath,
    imageUrl,
    imageName,
    imageMime,
    imageSize,
    blocks: [],
    regions: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function statusLabel(status: BlockStatus) {
  return status.replace('_', ' ')
}

export function toggleTag(tags: BlockTag[], tag: BlockTag) {
  return tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag]
}

export function generateBundleMarkdown(workspace: Workspace) {
  const pinned: string[] = []
  const sourceSections: string[] = []

  const addBlock = (node: ContextNode, block: ContextBlock) => {
    const text = block.text?.trim()
    if (!text) return ''
    const reason = block.reason ? `\n  Reason: ${block.reason}` : ''
    const role = block.speakerName || block.role ? ` (${block.speakerName || block.role})` : ''
    const line = `- ${node.title}${role}: ${text}${reason}`
    if (block.status === 'pinned') pinned.push(line)
    return line
  }

  const addDocumentBody = (node: ContextNode, body: string) => {
    return [`#### Full Document`, '', body].join('\n')
  }

  const addRegion = (node: ContextNode, region: ImageRegion) => {
    const details = [
      region.kind ? `type=${region.kind}` : '',
      region.color ? `color=${region.color}` : '',
      region.fontFamily ? `font=${region.fontFamily}` : '',
    ].filter(Boolean)
    const detailText = details.length > 0 ? ` (${details.join(', ')})` : ''
    return `- ${node.imageName || node.title} region [${region.box.join(', ')}]${detailText}: ${region.label || 'Untitled region'}${region.note ? `\n  Note: ${region.note}` : ''}`
  }

  const sourceConnections = (node: ContextNode) => {
    const related = workspace.edges.filter((edge) => edge.from === node.id || edge.to === node.id)
    if (related.length === 0) return ['- None']
    return related.map((edge) => {
      const peerId = edge.from === node.id ? edge.to : edge.from
      const peer = workspace.nodes.find((item) => item.id === peerId)
      const direction = edge.from === node.id ? 'To' : 'From'
      return `- ${direction} ${peer?.title || peerId}: ${edge.label || 'related'}`
    })
  }

  workspace.nodes.forEach((node) => {
    if (node.type === 'start' || node.type === 'end' || node.type === 'bundle') return
    const included: string[] = []
    const imageRegions: string[] = []
    const excluded: string[] = []
    const questions: string[] = []
    const sourceName = node.sourceName || node.imageName || node.title
    const sourcePath = node.sourcePath || node.imageName || 'Unavailable in browser import'

    if (node.type === 'document') {
      const body = node.body?.trim()
      const hasExcludedDocument = node.blocks.some((block) => block.status === 'excluded' && !block.isGenerated)
      if (body && !hasExcludedDocument) {
        included.push(addDocumentBody(node, body))
      }
      node.blocks.forEach((block) => {
        const line = addBlock(node, block)
        if (!line) return
        if (hasExcludedDocument && block.status === 'included' && !block.isGenerated) included.push(line)
        if ((block.status === 'included' && block.isGenerated) || block.status === 'pinned') included.push(line)
        if (block.status === 'excluded') excluded.push(line)
        if (block.tags.includes('question')) questions.push(line)
      })
    } else {
      node.blocks.forEach((block) => {
        const line = addBlock(node, block)
        if (!line) return
        if (block.status === 'included' || block.status === 'pinned') included.push(line)
        if (block.status === 'excluded') excluded.push(line)
        if (block.tags.includes('question')) questions.push(line)
      })
    }
    node.regions.forEach((region) => {
      const line = addRegion(node, region)
      if (region.status === 'excluded') excluded.push(line)
      else imageRegions.push(line)
    })

    sourceSections.push(
      [
        `### ${node.title}`,
        '',
        `- Type: ${node.type}`,
        `- File name: ${sourceName}`,
        `- Source path: ${sourcePath}`,
        '- Connections:',
        ...sourceConnections(node),
        '',
        '#### Included Evidence',
        included.join('\n') || '- None',
        '',
        '#### Image Annotations',
        imageRegions.join('\n') || '- None',
        '',
        '#### Excluded / Stale Context',
        excluded.join('\n') || '- None',
        '',
        '#### Open Questions',
        questions.join('\n') || '- None',
      ].join('\n'),
    )
  })

  return [
    '# Context Bundle',
    '',
    `Generated from: ${workspace.title}`,
    `Updated: ${new Date().toLocaleString()}`,
    '',
    '## Pinned Requirements',
    pinned.join('\n') || '- None',
    '',
    '## Context Sources',
    sourceSections.join('\n\n') || '- None',
    '',
  ].join('\n')
}

export function downloadText(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
