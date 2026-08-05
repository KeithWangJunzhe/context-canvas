import { BlockStatus, BlockTag, ContextBlock, ContextNode, ImageRegion, TextBoxShape, Workspace } from './types'

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
        status: 'included',
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
        status: 'included',
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
              status: 'included',
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

export function createTextBoxNode(shape: TextBoxShape = 'rectangle'): ContextNode {
  const now = new Date().toISOString()
  return {
    id: createId('node'),
    type: 'text_box',
    title: `${shape}_1`,
    body: '',
    shape,
    backgroundColor: '#f5f9ff',
    blocks: [],
    regions: [],
    canvasWidth: 176,
    canvasHeight: 92,
    createdAt: now,
    updatedAt: now,
  }
}

export function textBoxFallbackTitle(workspace: Workspace, nodeId: string, shape: TextBoxShape): string {
  const count = workspace.nodes.filter(
    (node) => node.id !== nodeId && node.type === 'text_box' && (node.shape || 'rectangle') === shape,
  ).length + 1
  return `${shape}_${count}`
}

export function textBoxTitleFromBody(body: string, fallbackTitle: string): string {
  const normalized = body.replace(/\s+/g, ' ').trim()
  if (!normalized) return fallbackTitle

  const tokens = normalized.match(/[\u3400-\u9fff]|[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []
  if (tokens.length === 0) return fallbackTitle
  const selectedTokens = tokens.slice(0, 5)
  const title = selectedTokens.reduce((result, token, index) => {
    if (index === 0) return token
    const previous = selectedTokens[index - 1]
    const bothLatin = /[A-Za-z0-9]/.test(previous) && /[A-Za-z0-9]/.test(token)
    return `${result}${bothLatin ? ' ' : ''}${token}`
  }, '')
  return tokens.length > 5 ? `${title}...` : title
}

export function isTextBoxFallbackTitle(title: string, shape: TextBoxShape = 'rectangle'): boolean {
  return new RegExp(`^${shape}_[0-9]+$`).test(title)
}

export function statusLabel(status: BlockStatus) {
  return status.replace('_', ' ')
}

export function toggleTag(tags: BlockTag[], tag: BlockTag) {
  return tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag]
}

function isContextNode(node: ContextNode) {
  return node.type !== 'start' && node.type !== 'end' && node.type !== 'bundle'
}

function isTextBoxNode(node: ContextNode): boolean {
  return node.type === 'text_box'
}

function shouldReadStatus(status: BlockStatus) {
  return status === 'pinned' || status === 'included'
}

function shouldSkipStatus(status: BlockStatus) {
  return status === 'excluded' || status === 'needs_review'
}

function actorLabel(block: ContextBlock) {
  return block.speakerName || (block.role && block.role !== 'unknown' ? block.role : '')
}

function connectionLabel(label: string) {
  return label.trim() || 'related'
}

function sourceConnections(workspace: Workspace, node: ContextNode) {
  return workspace.edges
    .filter((edge) => edge.from === node.id || edge.to === node.id)
    .map((edge) => {
      const from = workspace.nodes.find((item) => item.id === edge.from)
      const to = workspace.nodes.find((item) => item.id === edge.to)
      return {
        id: edge.id,
        label: connectionLabel(edge.label),
        from: {
          id: edge.from,
          title: from?.title || edge.from,
        },
        to: {
          id: edge.to,
          title: to?.title || edge.to,
        },
        summary: `${from?.title || edge.from} --${connectionLabel(edge.label)}--> ${to?.title || edge.to}`,
      }
    })
}

function blockToMarkdownLine(block: ContextBlock) {
  const text = block.text?.trim()
  if (!text) return ''
  const actor = actorLabel(block)
  const actorText = actor ? ` (${actor})` : ''
  const reason = block.reason ? `\n  Reason: ${block.reason}` : ''
  return `- [${block.status}]${actorText ? `${actorText}:` : ''} ${text}${reason}`
}

function regionToMarkdownLine(node: ContextNode, region: ImageRegion) {
  const details = [
    region.kind ? `type=${region.kind}` : '',
    region.color ? `color=${region.color}` : '',
    region.fontFamily ? `font=${region.fontFamily}` : '',
  ].filter(Boolean)
  const detailText = details.length > 0 ? ` (${details.join(', ')})` : ''
  return `- [${region.status}] ${node.imageName || node.title} region [${region.box.join(', ')}]${detailText}: ${region.label || 'Untitled region'}${region.note ? `\n  Note: ${region.note}` : ''}`
}

export type BundleOutputOptions = {
  includeConnections?: boolean
}

function connectionTreeLines(workspace: Workspace) {
  const nodesById = new Map(workspace.nodes.map((node) => [node.id, node]))
  const outgoing = new Map<string, typeof workspace.edges>()
  workspace.edges.forEach((edge) => outgoing.set(edge.from, [...(outgoing.get(edge.from) || []), edge]))
  const lines: string[] = []
  const listed = new Set<string>()

  const walk = (nodeId: string, prefix: string, path: Set<string>) => {
    const edges = outgoing.get(nodeId) || []
    edges.forEach((edge, index) => {
      const target = nodesById.get(edge.to)
      if (!target) return
      const branch = index === edges.length - 1 ? '`--' : '|--'
      const nextPrefix = `${prefix}${index === edges.length - 1 ? '   ' : '|  '}`
      const cycle = path.has(target.id)
      const alreadyListed = listed.has(target.id)
      lines.push(`${prefix}${branch} ${connectionLabel(edge.label)} -> ${target.title}${cycle ? ' (cycle)' : alreadyListed ? ' (see above)' : ''}`)
      if (!cycle && !alreadyListed) {
        listed.add(target.id)
        walk(target.id, nextPrefix, new Set([...path, target.id]))
      }
    })
  }

  const start = nodesById.get('node_start') || workspace.nodes.find((node) => node.type === 'start')
  if (start && (outgoing.get(start.id) || []).length > 0) {
    lines.push(`- ${start.title}`)
    listed.add(start.id)
    walk(start.id, '  ', new Set([start.id]))
  }

  const connected = new Set(workspace.edges.flatMap((edge) => [edge.from, edge.to]))
  const incoming = new Set(workspace.edges.map((edge) => edge.to))
  const otherRoots = workspace.nodes.filter((node) => connected.has(node.id) && !listed.has(node.id) && !incoming.has(node.id))
  const otherComponents = otherRoots.length > 0
    ? otherRoots
    : workspace.nodes.filter((node) => connected.has(node.id) && !listed.has(node.id)).slice(0, 1)
  if (otherComponents.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push('- Other connected context')
    otherComponents.forEach((node) => {
      lines.push(`  \`-- ${node.title}`)
      listed.add(node.id)
      walk(node.id, '     ', new Set([node.id]))
    })
  }

  const unconnected = workspace.nodes.filter((node) => isContextNode(node) && !connected.has(node.id))
  if (unconnected.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push('- Unconnected context')
    unconnected.forEach((node) => lines.push(`  \`-- ${node.title}`))
  }
  return lines
}

function connectionToJson(connection: ReturnType<typeof sourceConnections>[number]) {
  return {
    id: connection.id,
    label: connection.label,
    from: connection.from,
    to: connection.to,
    summary: connection.summary,
  }
}

function blockToJson(block: ContextBlock) {
  return {
    id: block.id,
    type: block.type,
    status: block.status,
    role: block.role,
    speakerName: block.speakerName,
    text: block.text || '',
    tags: block.tags,
    reason: block.reason,
    sourceOrder: block.sourceOrder,
  }
}

function regionToJson(region: ImageRegion) {
  return {
    id: region.id,
    kind: region.kind || 'bbox',
    status: region.status,
    box: region.box,
    label: region.label,
    note: region.note,
    color: region.color,
    fontFamily: region.fontFamily,
    tags: region.tags,
  }
}

function skippedBlockIndex(block: ContextBlock) {
  return {
    id: block.id,
    type: block.type,
    status: block.status,
    role: block.role,
    speakerName: block.speakerName,
    tags: block.tags,
    reason: block.reason,
    sourceOrder: block.sourceOrder,
    expand_available: true,
  }
}

function skippedRegionIndex(region: ImageRegion) {
  return {
    id: region.id,
    kind: region.kind || 'bbox',
    status: region.status,
    label: region.label,
    tags: region.tags,
    note: region.note,
    expand_available: true,
  }
}

export function generateBundleMarkdown(workspace: Workspace, options: BundleOutputOptions = {}) {
  const sourceSections: string[] = []

  workspace.nodes.forEach((node) => {
    if (!isContextNode(node)) return
    if (isTextBoxNode(node)) {
      const text = node.body?.trim()
      if (!text) return
      const shape = node.shape || 'rectangle'
      const meaning = node.shapeMeaning?.trim()
      sourceSections.push(
        [
          `### ${node.title}`,
          '',
          `- [included] Text box: ${text}`,
          `  Shape: ${shape}${meaning ? ` (${meaning})` : ''}`,
        ].join('\n'),
      )
      return
    }
    const included: string[] = []
    const imageRegions: string[] = []

    node.blocks.forEach((block) => {
      if (!shouldReadStatus(block.status)) return
      const line = blockToMarkdownLine(block)
      if (!line) return
      included.push(line)
    })

    node.regions.forEach((region) => {
      if (!shouldReadStatus(region.status)) return
      const line = regionToMarkdownLine(node, region)
      imageRegions.push(line)
    })

    const imagePath = node.type === 'image' ? node.sourcePath || node.imageName || node.title : ''
    if (included.length === 0 && imageRegions.length === 0 && !imagePath) return

    sourceSections.push(
      [
        `### ${node.title}`,
        '',
        ...(imagePath ? [`- Image path: ${imagePath}`, ''] : []),
        included.join('\n'),
        ...(imageRegions.length > 0 ? ['', '#### Image Annotations', imageRegions.join('\n')] : []),
      ].join('\n'),
    )
  })

  return [
    '# Context Bundle',
    '',
    `Generated from: ${workspace.title}`,
    `Updated: ${new Date().toLocaleString()}`,
    '',
    'Read this bundle as curated context. Use pinned and included items by default; skip excluded and needs_review material unless the user explicitly asks to revisit it.',
    '',
    ...(options.includeConnections !== false
      ? ['## Context Flow', '', ...(connectionTreeLines(workspace).join('\n') || '- No connections'), '']
      : []),
    '## Context Sources',
    sourceSections.join('\n\n') || '- None',
    '',
  ].join('\n')
}

export function generateBundleJson(workspace: Workspace, options: BundleOutputOptions = {}) {
  const nodes = workspace.nodes
    .filter(isContextNode)
    .map((node) => {
      if (isTextBoxNode(node)) {
        const text = node.body?.trim()
        if (!text) return null
        return {
          id: node.id,
          title: node.title,
          kind: 'text_box',
          text,
          shape: node.shape || 'rectangle',
          shape_meaning: node.shapeMeaning?.trim() || undefined,
          ...(options.includeConnections === false ? {} : { connections: sourceConnections(workspace, node).map(connectionToJson) }),
        }
      }
      const blocks = node.blocks.filter((block) => shouldReadStatus(block.status)).map(blockToJson)
      const regions = node.regions.filter((region) => shouldReadStatus(region.status)).map(regionToJson)
      if (blocks.length === 0 && regions.length === 0 && node.type !== 'image') return null
      return {
        id: node.id,
        title: node.title,
        kind: node.type,
        source: {
          name: node.sourceName || node.imageName || node.title,
          path: node.sourcePath || node.imageName,
        },
        ...(options.includeConnections === false ? {} : { connections: sourceConnections(workspace, node).map(connectionToJson) }),
        blocks,
        image_regions: regions,
      }
    })
    .filter((node): node is NonNullable<typeof node> => Boolean(node))

  const skipped_nodes = workspace.nodes
    .filter(isContextNode)
    .map((node) => {
      const skippedBlocks = node.blocks.filter((block) => shouldSkipStatus(block.status)).map(skippedBlockIndex)
      const skippedRegions = node.regions.filter((region) => shouldSkipStatus(region.status)).map(skippedRegionIndex)
      if (skippedBlocks.length === 0 && skippedRegions.length === 0) return null
      return {
        id: node.id,
        title: node.title,
        kind: node.type,
        skipped_blocks: skippedBlocks,
        skipped_image_regions: skippedRegions,
      }
    })
    .filter((node): node is NonNullable<typeof node> => Boolean(node))

  return {
    _meta: {
      schema: 'context-canvas.agent-bundle.v1',
      generatedFrom: workspace.title,
      updatedAt: new Date().toISOString(),
      read_policy: 'Use pinned and included content by default. Excluded and needs_review items are indexed only and should be skipped unless explicitly requested.',
      local_workspace_note: 'This JSON is an agent-readable context bundle, not a full canvas restore file. Use Export workspace for local UI state.',
    },
    ...(options.includeConnections === false ? {} : { relations: workspace.edges.map((edge) => {
      const from = workspace.nodes.find((node) => node.id === edge.from)
      const to = workspace.nodes.find((node) => node.id === edge.to)
      return {
        id: edge.id,
        label: connectionLabel(edge.label),
        from: {
          id: edge.from,
          title: from?.title || edge.from,
        },
        to: {
          id: edge.to,
          title: to?.title || edge.to,
        },
        summary: `${from?.title || edge.from} --${connectionLabel(edge.label)}--> ${to?.title || edge.to}`,
      }
    }) }),
    nodes,
    skipped_nodes,
  }
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
