import { ChangeEvent, DragEvent, PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  Edge,
  Handle,
  MarkerType,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Connection,
  EdgeChange,
  NodeChange,
} from '@xyflow/react'
import {
  Archive,
  ArrowLeft,
  BoxSelect,
  Download,
  FileText,
  Flag,
  HardDrive,
  Image as ImageIcon,
  Link,
  Maximize2,
  MessageSquareText,
  MousePointer2,
  NotebookPen,
  Pilcrow,
  Play,
  Plus,
  Redo2,
  Scissors,
  Sparkles,
  Trash2,
  Undo2,
} from 'lucide-react'
import mammoth from 'mammoth/mammoth.browser'
import {
  createId,
  createImageNode,
  createTextNode,
  downloadText,
  generateBundleMarkdown,
  statusLabel,
  toggleTag,
} from './domain'
import { sampleWorkspace } from './sample'
import { BlockStatus, BlockTag, ContextBlock, ContextEdge, ContextNode, Workspace } from './types'

const statusOptions: BlockStatus[] = ['included', 'excluded', 'pinned', 'needs_review']
const tagOptions: BlockTag[] = ['requirement', 'decision', 'question', 'assumption', 'evidence', 'noise', 'bug', 'ui']
type TextImportType = 'chat' | 'document' | 'note'
type ImportResult = { ok: boolean; notice?: string }
type OutputFormat = 'md' | 'txt' | 'json'
type ImageTool = 'bbox' | 'text'
type ImageAnnotationDraft = {
  kind: ImageTool
  box: [number, number, number, number]
  color: string
  fontFamily?: string
}
type ContextFlowData = ContextNode & {
  outputFormat?: OutputFormat
  onOutputFormatChange?: (format: OutputFormat) => void
  onDownloadBundle?: () => void
}
type ContextFlowNode = Node<ContextFlowData>

const docxMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const startNodeId = 'node_start'
const endNodeId = 'node_end'
const localWorkspaceKey = 'context-canvas.workspace.v1'
const imageAnnotationColors = ['#1f6feb', '#d1242f', '#2da44e', '#bf8700', '#8250df']
const imageTextFonts = ['Inter', 'Georgia', 'Menlo', 'Arial', 'Courier New']

function createSystemNode(id: string, type: 'start' | 'end', title: string): ContextNode {
  const now = new Date().toISOString()
  return {
    id,
    type,
    title,
    createdAt: now,
    updatedAt: now,
    regions: [],
    blocks: [],
  }
}

function withSystemNodes(workspace: Workspace): Workspace {
  const legacyBundleIds = workspace.nodes.filter((node) => node.type === 'bundle').map((node) => node.id)
  const nodes = workspace.nodes.map((node) => (node.type === 'bundle' ? { ...node, id: endNodeId, type: 'end' as const, title: 'End' } : node))
  const hasStart = nodes.some((node) => node.id === startNodeId || node.type === 'start')
  const hasEnd = nodes.some((node) => node.id === endNodeId || node.type === 'end')
  return {
    ...workspace,
    nodes: [
      ...(hasStart ? [] : [createSystemNode(startNodeId, 'start', 'Start')]),
      ...nodes,
      ...(hasEnd ? [] : [createSystemNode(endNodeId, 'end', 'End')]),
    ],
    edges: workspace.edges.map((edge) => ({
      ...edge,
      from: legacyBundleIds.includes(edge.from) ? endNodeId : edge.from,
      to: legacyBundleIds.includes(edge.to) ? endNodeId : edge.to,
    })),
    activeBundleId: endNodeId,
  }
}

function loadStoredWorkspace() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(localWorkspaceKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Workspace
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null
    return withSystemNodes(parsed)
  } catch {
    return null
  }
}

function saveStoredWorkspace(workspace: Workspace) {
  try {
    window.localStorage.setItem(localWorkspaceKey, JSON.stringify(workspace))
    return true
  } catch {
    return false
  }
}

function sourceTitle(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') || 'Imported source'
}

function isTextSourceFile(file: File) {
  return /\.(md|markdown|txt)$/i.test(file.name) || /^text\//.test(file.type)
}

function isDocxFile(file: File) {
  return /\.docx$/i.test(file.name) || file.type === docxMimeType
}

function formatMammothMessages(messages: Array<{ type?: string; message?: string }>) {
  const readableMessages = messages
    .map((message) => message.message?.trim())
    .filter((message): message is string => Boolean(message))
  if (readableMessages.length === 0) return ''
  return ` Mammoth reported: ${readableMessages.slice(0, 2).join(' ')}`
}

async function extractDocxText(file: File) {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return {
    text: result.value.replace(/\r\n/g, '\n').trim(),
    messages: result.messages,
  }
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('The browser did not return image data as text.'))
    }
    reader.onerror = () => reject(reader.error || new Error('The browser could not read the image file.'))
    reader.readAsDataURL(file)
  })
}

function bundleDownload(format: OutputFormat, markdown: string, workspace: Workspace) {
  if (format === 'json') {
    return {
      filename: 'context-bundle.json',
      mime: 'application/json',
      content: JSON.stringify(
        {
          generatedFrom: workspace.title,
          updatedAt: new Date().toISOString(),
          format,
          markdown,
          workspace,
        },
        null,
        2,
      ),
    }
  }

  return {
    filename: format === 'md' ? 'context-bundle.md' : 'context-bundle.txt',
    mime: format === 'md' ? 'text/markdown' : 'text/plain',
    content: markdown,
  }
}

function addTag(tags: BlockTag[], tag: BlockTag) {
  return tags.includes(tag) ? tags : [...tags, tag]
}

function nodeIcon(type: ContextNode['type']) {
  if (type === 'start') return <Play size={16} />
  if (type === 'end') return <Flag size={16} />
  if (type === 'chat') return <MessageSquareText size={16} />
  if (type === 'image') return <ImageIcon size={16} />
  if (type === 'note') return <NotebookPen size={16} />
  if (type === 'bundle') return <Archive size={16} />
  return <FileText size={16} />
}

function countByStatus(node: ContextNode, status: BlockStatus) {
  return node.blocks.filter((block) => block.status === status).length + node.regions.filter((region) => region.status === status).length
}

function ContextNodeCard({ data, selected }: NodeProps<ContextFlowNode>) {
  const contextNode = data as ContextFlowData
  const total = contextNode.blocks.length + contextNode.regions.length
  const isStart = contextNode.type === 'start'
  const isEnd = contextNode.type === 'end'
  return (
    <div className={`canvas-node ${selected ? 'is-selected' : ''} node-${contextNode.type}`}>
      {!isStart && <Handle type="target" position={Position.Left} />}
      <div className="node-header">
        <span className="node-icon">{nodeIcon(contextNode.type)}</span>
        <span className="node-title">{contextNode.title}</span>
      </div>
      <div className="node-meta">
        <span>{contextNode.type}</span>
        <span>{total} blocks</span>
      </div>
      {!isStart && !isEnd && contextNode.type !== 'bundle' && (
        <div className="status-strip">
          <span className="pill pinned">{countByStatus(contextNode, 'pinned')} pin</span>
          <span className="pill included">{countByStatus(contextNode, 'included')} in</span>
          <span className="pill excluded">{countByStatus(contextNode, 'excluded')} out</span>
          <span className="pill needs_review">{countByStatus(contextNode, 'needs_review')} review</span>
        </div>
      )}
      {contextNode.type === 'bundle' && <div className="bundle-note">Exports active context</div>}
      {isStart && <div className="bundle-note">Import or connect sources from here.</div>}
      {isEnd && (
        <div className="end-node-controls nodrag nopan">
          <select
            value={contextNode.outputFormat || 'md'}
            onChange={(event) => contextNode.onOutputFormatChange?.(event.target.value as OutputFormat)}
          >
            <option value="md">Markdown</option>
            <option value="txt">Text</option>
            <option value="json">JSON</option>
          </select>
          <button onClick={() => contextNode.onDownloadBundle?.()}>
            <Download size={14} />
            Export
          </button>
        </div>
      )}
      {!isEnd && <Handle type="source" position={Position.Right} />}
    </div>
  )
}

const nodeTypes = { context: ContextNodeCard }

function makeFlowNodes(workspace: Workspace): ContextFlowNode[] {
  return workspace.nodes.map((node, index) => {
    const sourceIndex = workspace.nodes.filter((item) => item.type !== 'start' && item.type !== 'end').findIndex((item) => item.id === node.id)
    const position =
      node.type === 'start'
        ? { x: 40, y: 260 }
        : node.type === 'end'
          ? { x: 900, y: 260 }
          : { x: 300 + (sourceIndex % 2) * 280, y: 130 + Math.floor(Math.max(sourceIndex, 0) / 2) * 190 }
    return {
      id: node.id,
      type: 'context',
      position,
      data: node,
    }
  })
}

function makeFlowEdges(workspace: Workspace): Edge[] {
  return workspace.edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    label: edge.label,
    markerEnd: { type: MarkerType.ArrowClosed },
    className: 'context-edge',
  }))
}

function isFileDrag(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes('Files')
}

function ImportPanel({
  onClose,
  onAddText,
  onImportFile,
}: {
  onClose: () => void
  onAddText: (type: TextImportType, title: string, body: string) => void
  onImportFile: (file: File) => Promise<ImportResult>
}) {
  const [type, setType] = useState<TextImportType>('chat')
  const [title, setTitle] = useState('Imported source')
  const [body, setBody] = useState('')
  const [fileNotice, setFileNotice] = useState('')

  const onImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setFileNotice('')
    const result = await onImportFile(file)
    event.target.value = ''
    if (!result.ok && result.notice) setFileNotice(result.notice)
    if (result.ok) onClose()
  }

  const onSourceFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setFileNotice('')
    const result = await onImportFile(file)
    event.target.value = ''
    if (!result.ok && result.notice) setFileNotice(result.notice)
    if (result.ok) onClose()
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2>Import Context</h2>
            <p>Paste text, choose a local markdown/plain-text/docx file, or add a screenshot.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close import panel">
            x
          </button>
        </div>

        <div className="segmented">
          <button className={type === 'chat' ? 'active' : ''} onClick={() => setType('chat')}>
            Chat
          </button>
          <button className={type === 'document' ? 'active' : ''} onClick={() => setType('document')}>
            Document
          </button>
          <button className={type === 'note' ? 'active' : ''} onClick={() => setType('note')}>
            Note
          </button>
        </div>

        <label className="field">
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>

        <label className="field">
          <span>Source text</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Paste copied chat or notes here..."
            rows={10}
          />
        </label>

        <div className="modal-actions">
          <div className="import-file-actions">
            <label className="secondary-button file-picker">
              <FileText size={16} />
              Add document
              <input type="file" accept=".md,.markdown,.txt,.docx,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onSourceFile} />
            </label>
            <label className="secondary-button file-picker">
              <ImageIcon size={16} />
              Add image
              <input type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" onChange={onImage} />
            </label>
          </div>
          <button
            className="primary-button"
            onClick={() => {
              if (!body.trim()) return
              onAddText(type, title.trim() || 'Untitled source', body)
              onClose()
            }}
          >
            <Scissors size={16} />
            Slice into blocks
          </button>
        </div>
        {fileNotice && <div className="import-inline-warning">{fileNotice}</div>}
      </div>
    </div>
  )
}

function MarkdownPreview({
  node,
  onAddSelection,
  onUpdateBlock,
  onDeleteBlock,
  variant = 'panel',
}: {
  node: ContextNode
  onAddSelection: (status: BlockStatus, text: string) => void
  onUpdateBlock: (blockId: string, patch: Partial<ContextBlock>) => void
  onDeleteBlock?: (blockId: string) => void
  variant?: 'panel' | 'workspace'
}) {
  const [selectedText, setSelectedText] = useState('')
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number } | null>(null)
  const fallbackBody = typeof node.body === 'string' ? node.body.trim() : ''
  const annotationBlocks = node.blocks.filter((block) => block.isGenerated && block.text?.trim())
  const previewBlocks =
    node.blocks.filter((block) => !block.isGenerated).length > 0
      ? node.blocks.filter((block) => !block.isGenerated)
      : fallbackBody
        ? [
            {
              id: `${node.id}_raw_preview`,
              nodeId: node.id,
              type: 'text' as const,
              text: fallbackBody,
              status: 'included' as const,
              tags: [],
            },
          ]
        : []

  const captureSelection = () => {
    const selection = window.getSelection()
    const text = selection?.toString().trim() || ''
    if (!selection || !text || selection.rangeCount === 0) {
      setSelectedText('')
      setSelectionMenu(null)
      return
    }

    const rect = selection.getRangeAt(0).getBoundingClientRect()
    setSelectedText(text)
    setSelectionMenu({
      x: Math.min(window.innerWidth - 190, Math.max(12, rect.left + rect.width / 2 - 90)),
      y: Math.max(76, rect.top - 42),
    })
  }

  const addSelection = (status: BlockStatus) => {
    if (!selectedText) return
    onAddSelection(status, selectedText)
    setSelectedText('')
    setSelectionMenu(null)
    window.getSelection()?.removeAllRanges()
  }

  return (
    <section className={`panel-section md-reader-section ${variant === 'workspace' ? 'md-reader-workspace' : ''}`}>
      <div className="section-heading-row">
        <div>
          <h3>{variant === 'workspace' ? node.title : 'Markdown Preview'}</h3>
          <p>Select text in the preview, then mark it for the bundle. The original local file is read-only and will not be changed.</p>
        </div>
        <span className="role-chip">{previewBlocks.length} blocks</span>
      </div>

      <div className="selection-toolbar">
        <span>{selectedText ? `${Math.min(selectedText.length, 999)} chars selected` : 'No text selected'}</span>
        <button disabled={!selectedText} onClick={() => addSelection('pinned')}>
          Pin
        </button>
        <button disabled={!selectedText} onClick={() => addSelection('included')}>
          Include
        </button>
        <button disabled={!selectedText} onClick={() => addSelection('excluded')}>
          Ignore
        </button>
      </div>

      {selectionMenu && (
        <div className="floating-selection-menu" style={{ left: selectionMenu.x, top: selectionMenu.y }}>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => addSelection('pinned')}>
            Pin
          </button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => addSelection('included')}>
            Include
          </button>
          <button onMouseDown={(event) => event.preventDefault()} onClick={() => addSelection('excluded')}>
            Ignore
          </button>
        </div>
      )}

      <article className="md-reader" onMouseUp={captureSelection} onKeyUp={captureSelection}>
        {previewBlocks.length === 0 && (
          <div className="md-empty">
            <FileText size={22} />
            <h4>No readable text was imported</h4>
            <p>The file node was created, but no readable document text came through. Try importing again, or paste the document text directly.</p>
          </div>
        )}
        {previewBlocks.map((block) => (
          <MarkdownBlock
            key={block.id}
            block={block}
            annotations={annotationBlocks}
            onUpdate={(patch) => {
              if (node.blocks.some((item) => item.id === block.id)) onUpdateBlock(block.id, patch)
              else onAddSelection(patch.status || 'included', block.text || '')
            }}
            onDelete={node.blocks.some((item) => item.id === block.id) ? () => onDeleteBlock?.(block.id) : undefined}
          />
        ))}
      </article>
    </section>
  )
}

function DocumentWorkspace({
  node,
  onAddBlock,
  onUpdateBlock,
  onDeleteBlock,
  onExit,
}: {
  node: ContextNode
  onAddBlock: (nodeId: string, block: Omit<ContextBlock, 'id' | 'nodeId'>) => void
  onUpdateBlock: (nodeId: string, blockId: string, patch: Partial<ContextBlock>) => void
  onDeleteBlock: (nodeId: string, blockId: string) => void
  onExit: () => void
}) {
  return (
    <div className="document-workspace">
      <div className="document-workspace-bar">
        <button className="secondary-button" onClick={onExit}>
          <ArrowLeft size={16} />
          Save & Back
        </button>
        <span>Changes are saved in the workspace automatically.</span>
      </div>
      <MarkdownPreview
        node={node}
        variant="workspace"
        onAddSelection={(status, text) =>
          onAddBlock(node.id, {
            type: 'text',
            text,
            status,
            tags: status === 'pinned' ? ['requirement'] : status === 'excluded' ? ['noise'] : ['evidence'],
            reason: 'Selected from local document preview.',
            isGenerated: true,
          })
        }
        onUpdateBlock={(blockId, patch) => onUpdateBlock(node.id, blockId, patch)}
        onDeleteBlock={(blockId) => onDeleteBlock(node.id, blockId)}
      />
    </div>
  )
}

function nextBlockStatus(current: BlockStatus, target: BlockStatus) {
  if (target === 'included') return 'included'
  return current === target ? 'included' : target
}

function HighlightedText({ text, annotations }: { text: string; annotations: ContextBlock[] }) {
  const matches = annotations
    .map((annotation) => ({
      text: annotation.text?.trim() || '',
      status: annotation.status,
    }))
    .filter((annotation) => annotation.text && text.includes(annotation.text))
    .sort((a, b) => b.text.length - a.text.length)

  if (matches.length === 0) return <>{text}</>

  const annotation = matches[0]
  const parts = text.split(annotation.text)
  return (
    <>
      {parts.map((part, index) => (
        <span key={`${annotation.text}_${index}`}>
          {part}
          {index < parts.length - 1 && <mark className={`inline-mark status-${annotation.status}`}>{annotation.text}</mark>}
        </span>
      ))}
    </>
  )
}

function MarkdownBlock({
  block,
  annotations = [],
  onUpdate,
  onDelete,
}: {
  block: ContextBlock
  annotations?: ContextBlock[]
  onUpdate: (patch: Partial<ContextBlock>) => void
  onDelete?: () => void
}) {
  const text = block.text || ''
  const lines = text.split('\n')
  const firstLine = lines[0]?.trim() || ''
  const isHeading = /^#{1,6}\s+/.test(firstLine)
  const isFence = /^```/.test(firstLine)
  const isList = lines.every((line) => !line.trim() || /^(\s*[-*+]\s+|\s*\d+\.\s+)/.test(line))

  return (
    <div className={`md-block status-${block.status}`}>
      <div className="md-block-actions">
        <button
          className={block.status === 'pinned' ? 'active' : ''}
          onClick={() => onUpdate({ status: nextBlockStatus(block.status, 'pinned'), tags: addTag(block.tags, 'requirement') })}
        >
          Pin
        </button>
        <button className={block.status === 'included' ? 'active' : ''} onClick={() => onUpdate({ status: 'included', tags: addTag(block.tags, 'evidence') })}>
          Include
        </button>
        <button
          className={block.status === 'excluded' ? 'active' : ''}
          onClick={() => onUpdate({ status: nextBlockStatus(block.status, 'excluded'), tags: addTag(block.tags, 'noise') })}
        >
          Ignore
        </button>
        {onDelete && (
          <button className="danger-action" onClick={onDelete} aria-label="Delete block">
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {isFence ? (
        <pre>{text.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '')}</pre>
      ) : isHeading ? (
        <h4>
          <HighlightedText text={firstLine.replace(/^#{1,6}\s+/, '')} annotations={annotations} />
        </h4>
      ) : isList ? (
        <ul>
          {lines
            .map((line) => line.replace(/^(\s*[-*+]\s+|\s*\d+\.\s+)/, '').trim())
            .filter(Boolean)
            .map((line, index) => (
              <li key={`${block.id}_${index}`}>
                <HighlightedText text={line} annotations={annotations} />
              </li>
            ))}
        </ul>
      ) : (
        <p>
          <HighlightedText text={text} annotations={annotations} />
        </p>
      )}
    </div>
  )
}

function BlockEditor({
  block,
  onUpdate,
  onDelete,
}: {
  block: ContextBlock
  onUpdate: (patch: Partial<ContextBlock>) => void
  onDelete: () => void
}) {
  const setStatus = (status: BlockStatus) => onUpdate({ status: nextBlockStatus(block.status, status) })
  return (
    <div className={`block-card status-${block.status}`}>
      <div className="block-toolbar">
        {block.role && <span className="role-chip">{block.role}</span>}
        <select value={block.status} onChange={(event) => onUpdate({ status: event.target.value as BlockStatus })}>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {statusLabel(status)}
            </option>
          ))}
        </select>
        <button className="icon-button danger-action" onClick={onDelete} aria-label="Delete block">
          <Trash2 size={14} />
        </button>
      </div>
      <div className="quick-status-row">
        <button className={block.status === 'pinned' ? 'active' : ''} onClick={() => setStatus('pinned')}>
          Pin
        </button>
        <button className={block.status === 'included' ? 'active' : ''} onClick={() => setStatus('included')}>
          Include
        </button>
        <button className={block.status === 'excluded' ? 'active' : ''} onClick={() => setStatus('excluded')}>
          Ignore
        </button>
      </div>
      <textarea value={block.text || ''} onChange={(event) => onUpdate({ text: event.target.value })} />
      <div className="tag-row">
        {tagOptions.map((tag) => (
          <button
            key={tag}
            className={block.tags.includes(tag) ? 'tag active' : 'tag'}
            onClick={() => onUpdate({ tags: toggleTag(block.tags, tag) })}
          >
            {tag}
          </button>
        ))}
      </div>
      <input
        className="reason-input"
        value={block.reason || ''}
        onChange={(event) => onUpdate({ reason: event.target.value })}
        placeholder="Reason or note..."
      />
    </div>
  )
}

function ImageInspector({
  node,
  onAddRegion,
  variant = 'panel',
  zoom = 100,
}: {
  node: ContextNode
  onAddRegion: (annotation: ImageAnnotationDraft) => void
  variant?: 'panel' | 'workspace'
  zoom?: number
}) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [tool, setTool] = useState<ImageTool>('bbox')
  const [color, setColor] = useState(imageAnnotationColors[0])
  const [fontFamily, setFontFamily] = useState(imageTextFonts[0])
  const [draft, setDraft] = useState<ImageAnnotationDraft | null>(null)
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null)

  const pointFromEvent = (event: PointerEvent<HTMLDivElement>) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return null
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100))
    return { x, y }
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!node.imageUrl) return
    const point = pointFromEvent(event)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setStartPoint(point)
    const defaultBox: [number, number, number, number] = tool === 'text' ? [point.x, point.y, 18, 8] : [point.x, point.y, 0, 0]
    setDraft({ kind: tool, box: defaultBox, color, fontFamily: tool === 'text' ? fontFamily : undefined })
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!startPoint) return
    const point = pointFromEvent(event)
    if (!point) return
    const left = Math.min(startPoint.x, point.x)
    const top = Math.min(startPoint.y, point.y)
    const width = Math.abs(point.x - startPoint.x)
    const height = Math.abs(point.y - startPoint.y)
    if (tool === 'text') {
      setDraft({ kind: 'text', box: [left, top, Math.max(18, width), Math.max(8, height)], color, fontFamily })
    } else {
      setDraft({ kind: 'bbox', box: [left, top, width, height], color })
    }
  }

  const onPointerUp = () => {
    if (draft) {
      if (draft.kind === 'text') {
        onAddRegion(draft)
      } else if (draft.box[2] > 2 && draft.box[3] > 2) {
        onAddRegion(draft)
      }
    }
    setDraft(null)
    setStartPoint(null)
  }

  return (
    <div>
      <div className="image-tool-panel">
        <div className="segmented compact">
          <button className={tool === 'bbox' ? 'active' : ''} onClick={() => setTool('bbox')}>
            <BoxSelect size={14} />
            Box
          </button>
          <button className={tool === 'text' ? 'active' : ''} onClick={() => setTool('text')}>
            <Pilcrow size={14} />
            Text
          </button>
        </div>
        <div className="swatch-row" aria-label="Annotation color">
          {imageAnnotationColors.map((item) => (
            <button
              key={item}
              className={item === color ? 'swatch active' : 'swatch'}
              style={{ backgroundColor: item }}
              onClick={() => setColor(item)}
              aria-label={`Use color ${item}`}
            />
          ))}
        </div>
        <select className="image-font-select" value={fontFamily} onChange={(event) => setFontFamily(event.target.value)} disabled={tool !== 'text'}>
          {imageTextFonts.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
      </div>
      <div className={`image-stage-scroll ${variant === 'workspace' ? 'is-workspace' : ''}`}>
        <div
          className="image-stage"
          ref={stageRef}
          style={{ width: `${zoom}%` }}
          onDragStart={(event) => event.preventDefault()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {node.imageUrl ? <img src={node.imageUrl} alt={node.title} draggable={false} onDragStart={(event) => event.preventDefault()} /> : <div className="empty-image">No image</div>}
          {node.regions.map((region) => (
            <div
              key={region.id}
              className={`image-annotation ${region.kind === 'text' ? 'text-box' : 'bbox'} status-${region.status}`}
              style={{
                left: `${region.box[0]}%`,
                top: `${region.box[1]}%`,
                width: `${region.box[2]}%`,
                height: `${region.box[3]}%`,
                borderColor: region.color || imageAnnotationColors[0],
                color: region.color || imageAnnotationColors[0],
                fontFamily: region.fontFamily,
              }}
            >
              <span style={{ backgroundColor: region.color || imageAnnotationColors[0] }}>{region.label || (region.kind === 'text' ? 'Text' : 'region')}</span>
            </div>
          ))}
          {draft && (
            <div
              className={`image-annotation ${draft.kind === 'text' ? 'text-box' : 'bbox'} draft`}
              style={{
                left: `${draft.box[0]}%`,
                top: `${draft.box[1]}%`,
                width: `${draft.box[2]}%`,
                height: `${draft.box[3]}%`,
                borderColor: draft.color,
                color: draft.color,
                fontFamily: draft.fontFamily,
              }}
            />
          )}
        </div>
      </div>
      <p className="hint">{tool === 'bbox' ? 'Drag on the image to draw a bounding box.' : 'Click or drag on the image to place a text box.'}</p>
    </div>
  )
}

function ImageWorkspace({
  node,
  onAddRegion,
  onExit,
}: {
  node: ContextNode
  onAddRegion: (nodeId: string, annotation: ImageAnnotationDraft) => void
  onExit: () => void
}) {
  const [zoom, setZoom] = useState(140)
  return (
    <div className="document-workspace image-workspace">
      <div className="document-workspace-bar">
        <button className="secondary-button" onClick={onExit}>
          <ArrowLeft size={16} />
          Save & Back
        </button>
        <label className="zoom-control">
          <span>Zoom {zoom}%</span>
          <input type="range" min={100} max={240} step={10} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
        </label>
      </div>
      <div className="image-workspace-inner">
        <ImageInspector node={node} variant="workspace" zoom={zoom} onAddRegion={(annotation) => onAddRegion(node.id, annotation)} />
      </div>
    </div>
  )
}

function Inspector({
  node,
  edge,
  edgeFrom,
  edgeTo,
  onUpdateNode,
  onUpdateEdge,
  onDeleteEdge,
  onUpdateBlock,
  onAddRegion,
  onUpdateRegion,
  onDeleteRegion,
  onAddBlock,
  onDeleteBlock,
  onOpenImageWorkspace,
}: {
  node?: ContextNode
  edge?: ContextEdge
  edgeFrom?: ContextNode
  edgeTo?: ContextNode
  onUpdateNode: (nodeId: string, patch: Partial<ContextNode>) => void
  onUpdateEdge: (edgeId: string, patch: Partial<ContextEdge>) => void
  onDeleteEdge: (edgeId: string) => void
  onUpdateBlock: (nodeId: string, blockId: string, patch: Partial<ContextBlock>) => void
  onAddRegion: (nodeId: string, annotation: ImageAnnotationDraft) => void
  onUpdateRegion: (nodeId: string, regionId: string, patch: { label?: string; note?: string; status?: BlockStatus; color?: string; fontFamily?: string }) => void
  onDeleteRegion: (nodeId: string, regionId: string) => void
  onAddBlock: (nodeId: string, block: Omit<ContextBlock, 'id' | 'nodeId'>) => void
  onDeleteBlock: (nodeId: string, blockId: string) => void
  onOpenImageWorkspace: (nodeId: string) => void
}) {
  if (edge) {
    return (
      <aside className="inspector">
        <div className="inspector-header">
          <span className="node-icon">
            <Link size={16} />
          </span>
          <input value={edge.label} onChange={(event) => onUpdateEdge(edge.id, { label: event.target.value })} />
        </div>
        <section className="panel-section">
          <h3>Connection</h3>
          <div className="edge-editor">
            <div>
              <span>From</span>
              <strong>{edgeFrom?.title || edge.from}</strong>
            </div>
            <div>
              <span>To</span>
              <strong>{edgeTo?.title || edge.to}</strong>
            </div>
            <label className="field">
              <span>Label</span>
              <input value={edge.label} onChange={(event) => onUpdateEdge(edge.id, { label: event.target.value })} placeholder="related" />
            </label>
            <button className="secondary-button danger-action wide" onClick={() => onDeleteEdge(edge.id)}>
              <Trash2 size={16} />
              Delete connection
            </button>
          </div>
        </section>
      </aside>
    )
  }

  if (!node) {
    return (
      <aside className="inspector">
        <div className="empty-state">
          <MousePointer2 size={22} />
          <h2>Select a node</h2>
          <p>Use the canvas to inspect sources, edit blocks, and prepare a bundle.</p>
        </div>
      </aside>
    )
  }

  return (
    <aside className="inspector">
      <div className="inspector-header">
        <span className="node-icon">{nodeIcon(node.type)}</span>
        <input value={node.title} onChange={(event) => onUpdateNode(node.id, { title: event.target.value })} />
      </div>

      {node.type === 'image' && (
        <>
          <button className="secondary-button wide" onClick={() => onOpenImageWorkspace(node.id)}>
            <Maximize2 size={16} />
            Zoom edit
          </button>
          <ImageInspector node={node} onAddRegion={(annotation) => onAddRegion(node.id, annotation)} />
        </>
      )}

      {node.regions.length > 0 && (
        <section className="panel-section">
          <h3>Image Regions</h3>
          {node.regions.map((region) => (
            <div className={`block-card status-${region.status}`} key={region.id}>
              <div className="block-toolbar">
                <span className="role-chip">{region.kind === 'text' ? 'text' : 'bbox'}</span>
                <select value={region.status} onChange={(event) => onUpdateRegion(node.id, region.id, { status: event.target.value as BlockStatus })}>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>
                <button className="icon-button danger-action" onClick={() => onDeleteRegion(node.id, region.id)} aria-label="Delete image annotation">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="region-style-row">
                {imageAnnotationColors.map((item) => (
                  <button
                    key={item}
                    className={item === (region.color || imageAnnotationColors[0]) ? 'swatch active' : 'swatch'}
                    style={{ backgroundColor: item }}
                    onClick={() => onUpdateRegion(node.id, region.id, { color: item })}
                    aria-label={`Use color ${item}`}
                  />
                ))}
              </div>
              {region.kind === 'text' && (
                <select value={region.fontFamily || imageTextFonts[0]} onChange={(event) => onUpdateRegion(node.id, region.id, { fontFamily: event.target.value })}>
                  {imageTextFonts.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>
              )}
              <input value={region.label} onChange={(event) => onUpdateRegion(node.id, region.id, { label: event.target.value })} placeholder="Label" />
              <textarea value={region.note} onChange={(event) => onUpdateRegion(node.id, region.id, { note: event.target.value })} placeholder="Region note" />
            </div>
          ))}
        </section>
      )}

      {node.type === 'start' && (
        <div className="empty-state">
          <Play size={22} />
          <h2>Start Node</h2>
          <p>This is the default entry point for source context. New imports stay unconnected until you decide how the canvas should flow.</p>
        </div>
      )}

      {node.type !== 'start' && node.type !== 'end' && node.type !== 'image' && node.type !== 'bundle' && (
        <section className="panel-section">
          <h3>{node.type === 'document' ? 'Structured Blocks' : 'Blocks'}</h3>
          {node.type === 'document' && (
            <p className="hint">Preview and selection live in the center reader. This panel edits the structured blocks that feed the bundle.</p>
          )}
          {node.blocks.map((block) => (
            <BlockEditor key={block.id} block={block} onUpdate={(patch) => onUpdateBlock(node.id, block.id, patch)} onDelete={() => onDeleteBlock(node.id, block.id)} />
          ))}
        </section>
      )}

      {node.type === 'bundle' && (
        <div className="empty-state">
          <Archive size={22} />
          <h2>Bundle Node</h2>
          <p>This node represents the current output package. Use the preview panel to inspect what Codex will see.</p>
        </div>
      )}

      {node.type === 'end' && (
        <div className="empty-state">
          <Flag size={22} />
          <h2>End Node</h2>
          <p>This is the default output point. Use its canvas controls or the top Bundle button to export the current bundle.</p>
        </div>
      )}
    </aside>
  )
}

function BundlePreview({
  generated,
  draft,
  isDirty,
  onDraftChange,
  onReset,
}: {
  generated: string
  draft: string
  isDirty: boolean
  onDraftChange: (value: string) => void
  onReset: () => void
}) {
  const [mode, setMode] = useState<'edit' | 'generated'>('edit')

  return (
    <aside className="bundle-preview">
      <div className="preview-header">
        <div>
          <div className="eyebrow">Output / Use</div>
          <h2>Bundle Preview</h2>
        </div>
        <Link size={16} />
      </div>
      <div className="preview-mode-row">
        <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>
          Edit
        </button>
        <button className={mode === 'generated' ? 'active' : ''} onClick={() => setMode('generated')}>
          Generated
        </button>
        <button disabled={!isDirty} onClick={onReset}>
          Reset
        </button>
      </div>
      {mode === 'edit' ? (
        <textarea
          className="bundle-editor"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          spellCheck={false}
        />
      ) : (
        <pre>{generated}</pre>
      )}
    </aside>
  )
}

export function App() {
  const initialWorkspace = useMemo(() => loadStoredWorkspace() || withSystemNodes(sampleWorkspace), [])
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace)
  const [flowNodes, setFlowNodes] = useState<ContextFlowNode[]>(() => makeFlowNodes(initialWorkspace))
  const [flowEdges, setFlowEdges] = useState<Edge[]>(() => makeFlowEdges(initialWorkspace))
  const [selectedNodeId, setSelectedNodeId] = useState<string>(() => initialWorkspace.nodes.find((node) => node.type !== 'start' && node.type !== 'end')?.id || startNodeId)
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null)
  const [activeImageId, setActiveImageId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [importNotice, setImportNotice] = useState('')
  const [bundleDraft, setBundleDraft] = useState('')
  const [bundleDraftEdited, setBundleDraftEdited] = useState(false)
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('md')
  const [saveNotice, setSaveNotice] = useState(() => (loadStoredWorkspace() ? 'Loaded local workspace' : 'Autosave ready'))
  const [saveToast, setSaveToast] = useState('')
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const historyPastRef = useRef<Workspace[]>([])
  const historyFutureRef = useRef<Workspace[]>([])

  const selectedNode = workspace.nodes.find((node) => node.id === selectedNodeId)
  const selectedEdge = selectedEdgeId ? workspace.edges.find((edge) => edge.id === selectedEdgeId) : undefined
  const selectedEdgeFrom = selectedEdge ? workspace.nodes.find((node) => node.id === selectedEdge.from) : undefined
  const selectedEdgeTo = selectedEdge ? workspace.nodes.find((node) => node.id === selectedEdge.to) : undefined
  const activeDocument = activeDocumentId ? workspace.nodes.find((node) => node.id === activeDocumentId && node.type === 'document') : undefined
  const activeImage = activeImageId ? workspace.nodes.find((node) => node.id === activeImageId && node.type === 'image') : undefined
  const bundle = useMemo(() => generateBundleMarkdown(workspace), [workspace])
  const bundleToDownload = bundleDraftEdited ? bundleDraft : bundle
  const downloadBundle = useCallback(() => {
    const payload = bundleDownload(outputFormat, bundleToDownload, workspace)
    downloadText(payload.filename, payload.content, payload.mime)
  }, [bundleToDownload, outputFormat, workspace])

  useEffect(() => {
    if (!bundleDraftEdited) setBundleDraft(bundle)
  }, [bundle, bundleDraftEdited])

  useEffect(() => {
    setSaveNotice(saveStoredWorkspace(workspace) ? 'Saved locally' : 'Local save failed')
  }, [workspace])

  useEffect(() => {
    if (!saveToast) return
    const timeout = window.setTimeout(() => setSaveToast(''), 1800)
    return () => window.clearTimeout(timeout)
  }, [saveToast])

  useEffect(() => {
    if (selectedNode) return
    setSelectedNodeId(workspace.nodes.find((node) => node.type !== 'start' && node.type !== 'end')?.id || startNodeId)
  }, [selectedNode, workspace.nodes])

  useEffect(() => {
    if (activeDocumentId && !activeDocument) setActiveDocumentId(null)
    if (activeImageId && !activeImage) setActiveImageId(null)
  }, [activeDocument, activeDocumentId, activeImage, activeImageId])

  useEffect(() => {
    if (selectedEdgeId && !selectedEdge) setSelectedEdgeId(null)
  }, [selectedEdge, selectedEdgeId])

  useEffect(() => {
    setFlowNodes((current) =>
      workspace.nodes.map((contextNode, index) => {
        const existing = current.find((node) => node.id === contextNode.id)
        const data =
          contextNode.type === 'end'
            ? {
                ...contextNode,
                outputFormat,
                onOutputFormatChange: setOutputFormat,
                onDownloadBundle: downloadBundle,
              }
            : contextNode
        if (existing) return { ...existing, data }
        return {
          id: contextNode.id,
          type: 'context',
          position: { x: 140 + index * 42, y: 140 + index * 28 },
          data,
        }
      }),
    )
    setFlowEdges(makeFlowEdges(workspace))
  }, [downloadBundle, outputFormat, workspace])

  const updateWorkspace = (updater: (workspace: Workspace) => Workspace) => {
    setWorkspace((current) => {
      const next = withSystemNodes({ ...updater(current), updatedAt: new Date().toISOString() })
      if (JSON.stringify(next) !== JSON.stringify(current)) {
        historyPastRef.current = [...historyPastRef.current.slice(-49), current]
        historyFutureRef.current = []
      }
      return next
    })
  }

  const undoWorkspace = () => {
    const previous = historyPastRef.current[historyPastRef.current.length - 1]
    if (!previous) return
    historyPastRef.current = historyPastRef.current.slice(0, -1)
    historyFutureRef.current = [workspace, ...historyFutureRef.current.slice(0, 49)]
    setWorkspace(previous)
  }

  const redoWorkspace = () => {
    const next = historyFutureRef.current[0]
    if (!next) return
    historyFutureRef.current = historyFutureRef.current.slice(1)
    historyPastRef.current = [...historyPastRef.current.slice(-49), workspace]
    setWorkspace(next)
  }

  const addNode = (node: ContextNode) => {
    updateWorkspace((current) => ({
      ...current,
      nodes: [...current.nodes, node],
    }))
    setSelectedNodeId(node.id)
    setSelectedEdgeId(null)
    setActiveDocumentId(node.type === 'document' ? node.id : null)
    setActiveImageId(node.type === 'image' ? node.id : null)
  }

  const deleteSource = (nodeId: string) => {
    const node = workspace.nodes.find((item) => item.id === nodeId)
    if (!node || node.type === 'start' || node.type === 'end') return
    updateWorkspace((current) => ({
      ...current,
      nodes: current.nodes.filter((item) => item.id !== nodeId),
      edges: current.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
    }))
    if (activeDocumentId === nodeId) setActiveDocumentId(null)
    if (activeImageId === nodeId) setActiveImageId(null)
    if (selectedNodeId === nodeId) {
      const fallback = workspace.nodes.find((item) => item.id !== nodeId && item.type !== 'start' && item.type !== 'end') || workspace.nodes.find((item) => item.id === startNodeId)
      setSelectedNodeId(fallback?.id || startNodeId)
    }
  }

  const saveWorkspaceLocally = () => {
    const ok = saveStoredWorkspace(workspace)
    if (ok) historyFutureRef.current = []
    setSaveNotice(ok ? 'Saved locally' : 'Local save failed')
    setSaveToast(ok ? 'Saved successfully' : 'Local save failed')
  }

  const importFile = async (file: File): Promise<ImportResult> => {
    setImportNotice('')
    if (/\.(png|jpe?g)$/i.test(file.name) || ['image/png', 'image/jpeg'].includes(file.type)) {
      try {
        const dataUrl = await fileToDataUrl(file)
        addNode(createImageNode(sourceTitle(file.name), dataUrl, file.name, file.type, file.size))
        return { ok: true }
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown image read error.'
        const notice = `${file.name} could not be read as an image: ${detail} The original file was not changed.`
        setImportNotice(notice)
        return { ok: false, notice }
      }
    }

    if (isDocxFile(file)) {
      try {
        const { text, messages } = await extractDocxText(file)
        const messageNote = formatMammothMessages(messages)
        if (!text) {
          const notice = `${file.name} was added, but the docx parser did not find readable body text.${messageNote} The original file was not changed.`
          setImportNotice(notice)
          addNode(createTextNode('document', sourceTitle(file.name), ''))
          return { ok: true, notice }
        }
        if (messageNote) setImportNotice(`${file.name} imported with parser notes.${messageNote}`)
        addNode(createTextNode('document', sourceTitle(file.name), text))
        return { ok: true }
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown parser error.'
        const notice = `${file.name} could not be imported as .docx: ${detail} The original file was not changed.`
        setImportNotice(notice)
        return { ok: false, notice }
      }
    }

    if (isTextSourceFile(file)) {
      try {
        const text = await file.text()
        if (!text.trim()) {
          const notice = `${file.name} was added, but no readable text came through. The original file was not changed.`
          setImportNotice(notice)
          addNode(createTextNode('document', sourceTitle(file.name), text))
          return { ok: true, notice }
        }
        addNode(createTextNode('document', sourceTitle(file.name), text))
        return { ok: true }
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown text read error.'
        const notice = `${file.name} could not be read as text: ${detail} The original file was not changed.`
        setImportNotice(notice)
        return { ok: false, notice }
      }
    }

    const notice = `${file.name} is not a supported import type yet. Use markdown, txt, docx, png, jpeg, or jpg.`
    setImportNotice(notice)
    return { ok: false, notice }
  }

  const onDropFiles = async (event: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) return
    event.preventDefault()
    setIsDraggingFile(false)
    const files = Array.from(event.dataTransfer.files)
    for (const file of files) {
      await importFile(file)
    }
  }

  const onNodesChange = useCallback((changes: NodeChange<ContextFlowNode>[]) => setFlowNodes((nodes) => applyNodeChanges<ContextFlowNode>(changes, nodes)), [])
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const removedIds = changes
      .filter((change) => change.type === 'remove' && 'id' in change)
      .map((change) => change.id)
    setFlowEdges((edges) => applyEdgeChanges(changes, edges))
    if (removedIds.length > 0) {
      updateWorkspace((current) => ({
        ...current,
        edges: current.edges.filter((edge) => !removedIds.includes(edge.id)),
      }))
      setSelectedEdgeId((current) => (current && removedIds.includes(current) ? null : current))
    }
  }, [])
  const onConnect = useCallback(
    (connection: Connection) => {
      const edgeId = createId('edge')
      setFlowEdges((edges) => addEdge({ ...connection, id: edgeId, label: 'related', markerEnd: { type: MarkerType.ArrowClosed } }, edges))
      updateWorkspace((current) => ({
        ...current,
        edges: [...current.edges, { id: edgeId, from: connection.source!, to: connection.target!, label: 'related' }],
      }))
    },
    [],
  )

  const onUpdateEdge = (edgeId: string, patch: Partial<ContextEdge>) => {
    updateWorkspace((current) => ({
      ...current,
      edges: current.edges.map((edge) => (edge.id === edgeId ? { ...edge, ...patch } : edge)),
    }))
  }

  const onDeleteEdge = (edgeId: string) => {
    updateWorkspace((current) => ({
      ...current,
      edges: current.edges.filter((edge) => edge.id !== edgeId),
    }))
    setSelectedEdgeId(null)
  }

  const onUpdateNode = (nodeId: string, patch: Partial<ContextNode>) => {
    updateWorkspace((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch, updatedAt: new Date().toISOString() } : node)),
    }))
  }

  const onUpdateBlock = (nodeId: string, blockId: string, patch: Partial<ContextBlock>) => {
    updateWorkspace((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              updatedAt: new Date().toISOString(),
              blocks: node.blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block)),
            }
          : node,
      ),
    }))
  }

  const onDeleteBlock = (nodeId: string, blockId: string) => {
    updateWorkspace((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nodeId ? { ...node, updatedAt: new Date().toISOString(), blocks: node.blocks.filter((block) => block.id !== blockId) } : node,
      ),
    }))
  }

  const onAddBlock = (nodeId: string, block: Omit<ContextBlock, 'id' | 'nodeId'>) => {
    updateWorkspace((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              updatedAt: new Date().toISOString(),
              blocks: [
                ...node.blocks,
                {
                  ...block,
                  id: createId('block'),
                  nodeId,
                },
              ],
            }
          : node,
      ),
    }))
  }

  const onAddRegion = (nodeId: string, annotation: ImageAnnotationDraft) => {
    updateWorkspace((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              regions: [
                ...node.regions,
                {
                  id: createId('region'),
                  nodeId,
                  kind: annotation.kind,
                  box: annotation.box,
                  label: annotation.kind === 'text' ? 'Text note' : 'New region',
                  note: '',
                  color: annotation.color,
                  fontFamily: annotation.fontFamily,
                  status: 'included',
                  tags: ['ui'],
                },
              ],
            }
          : node,
      ),
    }))
  }

  const onUpdateRegion = (nodeId: string, regionId: string, patch: { label?: string; note?: string; status?: BlockStatus; color?: string; fontFamily?: string }) => {
    updateWorkspace((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nodeId ? { ...node, regions: node.regions.map((region) => (region.id === regionId ? { ...region, ...patch } : region)) } : node,
      ),
    }))
  }

  const onDeleteRegion = (nodeId: string, regionId: string) => {
    updateWorkspace((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nodeId ? { ...node, updatedAt: new Date().toISOString(), regions: node.regions.filter((region) => region.id !== regionId) } : node,
      ),
    }))
  }

  return (
    <ReactFlowProvider>
      <div
        className={`app-shell ${isDraggingFile ? 'is-dragging-file' : ''}`}
        onDragOver={(event) => {
          if (!isFileDrag(event)) return
          event.preventDefault()
          setIsDraggingFile(true)
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) return
          setIsDraggingFile(false)
        }}
        onDrop={onDropFiles}
      >
        {saveToast && <div className={saveToast.includes('failed') ? 'save-toast is-error' : 'save-toast'}>{saveToast}</div>}
        {isDraggingFile && (
          <div className="drop-overlay">
            <div>
              <FileText size={26} />
              <strong>Drop markdown, text, docx, png, jpeg, or jpg files</strong>
              <span>Local files become canvas nodes immediately.</span>
            </div>
          </div>
        )}
        <header className="topbar">
          <div>
            <div className="eyebrow">Local PoC</div>
            <h1>Context Canvas</h1>
          </div>
          <div className="toolbar">
            <button className="secondary-button" onClick={() => setShowImport(true)}>
              <Plus size={16} />
              Import
            </button>
            <button className="secondary-button" onClick={saveWorkspaceLocally}>
              <HardDrive size={16} />
              Save local
            </button>
            <button className="icon-button" onClick={undoWorkspace} disabled={historyPastRef.current.length === 0} aria-label="Undo">
              <Undo2 size={16} />
            </button>
            <button className="icon-button" onClick={redoWorkspace} disabled={historyFutureRef.current.length === 0} aria-label="Redo">
              <Redo2 size={16} />
            </button>
            <button className="secondary-button" onClick={() => downloadText('context-workspace.json', JSON.stringify(workspace, null, 2), 'application/json')}>
              <Download size={16} />
              Export workspace
            </button>
            <span className="save-status">{saveNotice}</span>
            <select className="toolbar-select" value={outputFormat} onChange={(event) => setOutputFormat(event.target.value as OutputFormat)} aria-label="Bundle output format">
              <option value="md">md</option>
              <option value="txt">txt</option>
              <option value="json">json</option>
            </select>
            <button className="primary-button" onClick={downloadBundle}>
              <Download size={16} />
              Bundle .{outputFormat}
            </button>
          </div>
        </header>

        <main className="workbench">
          <aside className="source-rail">
            <div className="rail-header">
              <h2>Sources</h2>
              <button className="icon-button" onClick={() => setShowImport(true)} aria-label="Add source">
                <Plus size={16} />
              </button>
            </div>
            <div className="source-list">
              {workspace.nodes.filter((node) => node.type !== 'start' && node.type !== 'end').map((node) => (
                <div key={node.id} className={selectedNodeId === node.id ? 'source-row active' : 'source-row'}>
                  <button
                    className="source-item"
                    onClick={() => {
                      setSelectedNodeId(node.id)
                      setActiveDocumentId(node.type === 'document' ? node.id : null)
                      setActiveImageId(node.type === 'image' ? node.id : null)
                    }}
                  >
                    <span className="node-icon">{nodeIcon(node.type)}</span>
                    <span>{node.title}</span>
                  </button>
                  <button className="source-delete" onClick={() => deleteSource(node.id)} aria-label={`Delete ${node.title}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="rail-callout">
              <Sparkles size={16} />
              <span>Auto orchestration later. For now, you make the context calls.</span>
            </div>
            {importNotice && <div className="rail-warning">{importNotice}</div>}
          </aside>

          <section className="canvas-pane">
            {activeDocument ? (
              <DocumentWorkspace node={activeDocument} onAddBlock={onAddBlock} onUpdateBlock={onUpdateBlock} onDeleteBlock={onDeleteBlock} onExit={() => setActiveDocumentId(null)} />
            ) : activeImage ? (
              <ImageWorkspace node={activeImage} onAddRegion={onAddRegion} onExit={() => setActiveImageId(null)} />
            ) : (
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, node) => {
                  setSelectedNodeId(node.id)
                  setSelectedEdgeId(null)
                  const contextNode = workspace.nodes.find((item) => item.id === node.id)
                  setActiveDocumentId(contextNode?.type === 'document' ? contextNode.id : null)
                  setActiveImageId(contextNode?.type === 'image' ? contextNode.id : null)
                }}
                onEdgeClick={(event, edge) => {
                  event.stopPropagation()
                  setSelectedEdgeId(edge.id)
                  setActiveDocumentId(null)
                  setActiveImageId(null)
                }}
                onPaneClick={() => setSelectedEdgeId(null)}
                fitView
              >
                <Background gap={22} size={1} />
                <Controls />
              </ReactFlow>
            )}
          </section>

          <Inspector
            node={selectedEdge ? undefined : selectedNode}
            edge={selectedEdge}
            edgeFrom={selectedEdgeFrom}
            edgeTo={selectedEdgeTo}
            onUpdateNode={onUpdateNode}
            onUpdateEdge={onUpdateEdge}
            onDeleteEdge={onDeleteEdge}
            onUpdateBlock={onUpdateBlock}
            onAddRegion={onAddRegion}
            onUpdateRegion={onUpdateRegion}
            onDeleteRegion={onDeleteRegion}
            onAddBlock={onAddBlock}
            onDeleteBlock={onDeleteBlock}
            onOpenImageWorkspace={(nodeId) => {
              setSelectedNodeId(nodeId)
              setActiveDocumentId(null)
              setActiveImageId(nodeId)
            }}
          />

          <BundlePreview
            generated={bundle}
            draft={bundleDraft}
            isDirty={bundleDraftEdited}
            onDraftChange={(value) => {
              setBundleDraft(value)
              setBundleDraftEdited(value !== bundle)
            }}
            onReset={() => {
              setBundleDraft(bundle)
              setBundleDraftEdited(false)
            }}
          />
        </main>

        {showImport && (
          <ImportPanel
            onClose={() => setShowImport(false)}
            onAddText={(type, title, body) => addNode(createTextNode(type, title, body))}
            onImportFile={importFile}
          />
        )}
      </div>
    </ReactFlowProvider>
  )
}
