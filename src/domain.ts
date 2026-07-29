import { BlockStatus, BlockTag, ContextBlock, ContextNode, ImageRegion, Workspace } from './types'

const rolePattern = /^(user|assistant|system|tool|developer|用户|助手|human|ai|chatgpt|claude|codex)\s*[:：]/i

export function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

export function sliceTextToBlocks(text: string, nodeId: string, mode: 'chat' | 'document'): ContextBlock[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  if (mode === 'chat') {
    const blocks: ContextBlock[] = []
    let currentRole: ContextBlock['role'] = 'unknown'
    let currentLines: string[] = []

    const flush = () => {
      const content = currentLines.join('\n').trim()
      if (!content) return
      blocks.push({
        id: createId('block'),
        nodeId,
        type: 'message',
        role: currentRole,
        text: content,
        status: 'needs_review',
        tags: [],
      })
    }

    for (const line of normalized.split('\n')) {
      const match = line.match(rolePattern)
      if (match) {
        flush()
        const roleText = match[1].toLowerCase()
        currentRole =
          roleText === 'user' || roleText === 'human' || roleText === '用户'
            ? 'user'
            : roleText === 'assistant' || roleText === 'ai' || roleText === 'chatgpt' || roleText === 'claude' || roleText === 'codex' || roleText === '助手'
              ? 'assistant'
              : roleText === 'system' || roleText === 'developer'
                ? 'system'
                : roleText === 'tool'
                  ? 'tool'
                  : 'unknown'
        currentLines = [line.replace(rolePattern, '').trim()]
      } else {
        currentLines.push(line)
      }
    }

    flush()

    if (blocks.length > 1) return blocks
  }

  return normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({
      id: createId('block'),
      nodeId,
      type: mode === 'chat' ? 'message' : 'text',
      role: mode === 'chat' ? 'unknown' : undefined,
      text: part,
      status: mode === 'document' ? 'included' : 'needs_review',
      tags: [],
    }))
}

export function createTextNode(type: 'chat' | 'document' | 'note', title: string, body: string): ContextNode {
  const id = createId('node')
  const now = new Date().toISOString()
  const blocks =
    type === 'note'
      ? [
          {
            id: createId('block'),
            nodeId: id,
            type: 'note' as const,
            text: body,
            status: 'included' as const,
            tags: ['evidence' as const],
          },
        ]
      : sliceTextToBlocks(body, id, type === 'chat' ? 'chat' : 'document')

  return {
    id,
    type,
    title,
    body,
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

export function createImageNode(title: string, imageUrl: string, imageName: string): ContextNode {
  const now = new Date().toISOString()
  return {
    id: createId('node'),
    type: 'image',
    title,
    imageUrl,
    imageName,
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
  const included: string[] = []
  const imageRegions: string[] = []
  const excluded: string[] = []
  const questions: string[] = []

  const addBlock = (node: ContextNode, block: ContextBlock) => {
    const text = block.text?.trim()
    if (!text) return
    const reason = block.reason ? `\n  Reason: ${block.reason}` : ''
    const role = block.role ? ` (${block.role})` : ''
    const line = `- ${node.title}${role}: ${text}${reason}`
    if (block.status === 'pinned') pinned.push(line)
    if (block.status === 'included') included.push(line)
    if (block.status === 'excluded') excluded.push(line)
    if (block.tags.includes('question')) questions.push(line)
  }

  const addDocumentBody = (node: ContextNode, body: string) => {
    included.push([`### ${node.title}`, '', body].join('\n'))
  }

  const addRegion = (node: ContextNode, region: ImageRegion) => {
    const line = `- ${node.imageName || node.title} region [${region.box.join(', ')}]: ${region.label || 'Untitled region'}${region.note ? `\n  Note: ${region.note}` : ''}`
    if (region.status === 'excluded') excluded.push(line)
    else imageRegions.push(line)
  }

  workspace.nodes.forEach((node) => {
    if (node.type === 'start' || node.type === 'end' || node.type === 'bundle') return
    if (node.type === 'document') {
      const body = node.body?.trim()
      const hasExcludedDocument = node.blocks.some((block) => block.status === 'excluded' && !block.isGenerated)
      if (body && !hasExcludedDocument) {
        addDocumentBody(node, body)
      }
      node.blocks.forEach((block) => {
        if (hasExcludedDocument && block.status === 'included' && !block.isGenerated) addBlock(node, block)
        if (block.status === 'pinned' || block.status === 'excluded' || block.isGenerated) addBlock(node, block)
      })
      node.regions.forEach((region) => addRegion(node, region))
      return
    }
    node.blocks.forEach((block) => addBlock(node, block))
    node.regions.forEach((region) => addRegion(node, region))
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
    '## Included Evidence',
    included.join('\n') || '- None',
    '',
    '## Image Annotations',
    imageRegions.join('\n') || '- None',
    '',
    '## Excluded / Stale Context',
    excluded.join('\n') || '- None',
    '',
    '## Open Questions',
    questions.join('\n') || '- None',
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
