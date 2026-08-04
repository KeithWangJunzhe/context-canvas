import { ChangeEvent, DragEvent, PointerEvent, type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  NodeResizer,
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
  Bot,
  BoxSelect,
  Cylinder,
  Diamond,
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
  Settings,
  Sparkles,
  Square,
  Trash2,
  Undo2,
} from 'lucide-react'
import mammoth from 'mammoth/mammoth.browser'
import {
  createId,
  createImageNode,
  createTextNode,
  createTextBoxNode,
  downloadText,
  generateBundleJson,
  generateBundleMarkdown,
  isTextBoxFallbackTitle,
  sliceTextToBlocks,
  textBoxFallbackTitle,
  textBoxTitleFromBody,
  toggleTag,
} from './domain'
import { CodexImportLauncher, type CodexImportPayload, type CodexUsedContextCandidate } from './features/codex-import'
import { sampleWorkspace } from './sample'
import { BlockStatus, BlockTag, BuiltInBlockTag, ContextBlock, ContextEdge, ContextNode, ContextTurn, TextBoxShape, Workspace } from './types'
import { useI18n, type Locale } from './i18n'

const statusOptions: BlockStatus[] = ['included', 'excluded', 'pinned', 'needs_review']
const tagOptions: BuiltInBlockTag[] = ['requirement', 'decision', 'assumption']
const textBoxShapes: Array<{ value: TextBoxShape; label: string; icon: typeof Square }> = [
  { value: 'rectangle', label: 'Rectangle', icon: Square },
  { value: 'rounded_rectangle', label: 'Rounded rectangle', icon: Square },
  { value: 'diamond', label: 'Diamond', icon: Diamond },
  { value: 'cylinder', label: 'Cylinder', icon: Cylinder },
]
type TextImportType = 'chat' | 'document' | 'note'
type ImportResult = { ok: boolean; notice?: string }
type OutputFormat = 'md' | 'json'
type ImageTool = 'bbox' | 'text'
type BlockFilter = 'all' | BlockStatus
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
  onResliceNode?: (nodeId: string) => void
  onResizeTextBox?: (nodeId: string, width: number, height: number) => void
  onOpenComplexChat?: (nodeId: string) => void
  onReadUsedContext?: (nodeId: string) => void
}
type ContextFlowNode = Node<ContextFlowData>

const docxMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const startNodeId = 'node_start'
const endNodeId = 'node_end'
const localWorkspaceKey = 'context-canvas.workspace.v1'
const imageAnnotationColors = ['#1f6feb', '#d1242f', '#2da44e', '#bf8700', '#8250df']
const imageTextFonts = ['Inter', 'Georgia', 'Menlo', 'Arial', 'Courier New']
const textBoxBackgroundColors = ['#f5f9ff', '#f4fbf6', '#fff8df', '#fff3f1', '#f5f1ff']

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
  const legacyStartIds = workspace.nodes.filter((node) => node.type === 'start' && node.id !== startNodeId).map((node) => node.id)
  const legacyEndIds = workspace.nodes
    .filter((node) => (node.type === 'end' || node.type === 'bundle') && node.id !== endNodeId)
    .map((node) => node.id)
  const existingStart = workspace.nodes.find((node) => node.id === startNodeId || node.type === 'start')
  const existingEnd = workspace.nodes.find((node) => node.id === endNodeId || node.type === 'end' || node.type === 'bundle')
  const contentNodes = workspace.nodes.filter((node) => node.type !== 'start' && node.type !== 'end' && node.type !== 'bundle')
  const startNode = existingStart
    ? { ...existingStart, id: startNodeId, type: 'start' as const, title: 'Start' }
    : createSystemNode(startNodeId, 'start', 'Start')
  const endNode = existingEnd
    ? { ...existingEnd, id: endNodeId, type: 'end' as const, title: 'End' }
    : createSystemNode(endNodeId, 'end', 'End')
  const systemIdMap = new Map<string, string>([
    ...legacyStartIds.map((id) => [id, startNodeId] as const),
    ...legacyEndIds.map((id) => [id, endNodeId] as const),
  ])
  return {
    ...workspace,
    nodes: [startNode, ...contentNodes, endNode],
    edges: workspace.edges.map((edge) => ({ ...edge, from: systemIdMap.get(edge.from) || edge.from, to: systemIdMap.get(edge.to) || edge.to })),
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

function sourcePath(file: File) {
  return file.webkitRelativePath || file.name
}

function isTextSourceFile(file: File) {
  return /\.(md|markdown|txt)$/i.test(file.name) || /^text\//.test(file.type)
}

function isDocxFile(file: File) {
  return /\.docx$/i.test(file.name) || file.type === docxMimeType
}

function formatMammothMessages(messages: Array<{ type?: string; message?: string }>, formatMessage: (message: string) => string) {
  const readableMessages = messages
    .map((message) => message.message?.trim())
    .filter((message): message is string => Boolean(message))
  if (readableMessages.length === 0) return ''
  return formatMessage(readableMessages.slice(0, 2).join(' '))
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
      content: markdown,
    }
  }

  return {
    filename: 'context-bundle.md',
    mime: 'text/markdown',
    content: markdown,
  }
}

function createEmptyWorkspace(): Workspace {
  return withSystemNodes({
    id: createId('workspace'),
    title: 'Context Canvas PoC',
    updatedAt: new Date().toISOString(),
    nodes: [],
    edges: [],
    activeBundleId: endNodeId,
  })
}

function nodeIcon(type: ContextNode['type']) {
  if (type === 'start') return <Play size={16} />
  if (type === 'end') return <Flag size={16} />
  if (type === 'chat') return <MessageSquareText size={16} />
  if (type === 'complex_chat') return <Bot size={16} />
  if (type === 'image') return <ImageIcon size={16} />
  if (type === 'note') return <NotebookPen size={16} />
  if (type === 'text_box') return <Pilcrow size={16} />
  if (type === 'bundle') return <Archive size={16} />
  return <FileText size={16} />
}

function isTextReviewNode(node?: ContextNode): node is ContextNode {
  return Boolean(node && ['document', 'chat', 'note'].includes(node.type) && typeof node.body === 'string')
}

function countByStatus(node: ContextNode, status: BlockStatus) {
  return node.blocks.filter((block) => block.status === status).length + node.regions.filter((region) => region.status === status).length
}

function ContextNodeCard({ data, selected }: NodeProps<ContextFlowNode>) {
  const contextNode = data as ContextFlowData
  const { t } = useI18n()
  const total = contextNode.blocks.length + contextNode.regions.length
  const isStart = contextNode.type === 'start'
  const isEnd = contextNode.type === 'end'
  const isTextBox = contextNode.type === 'text_box'
  const isComplexChat = contextNode.type === 'complex_chat'
  if (isTextBox) {
    const isDiamond = contextNode.shape === 'diamond'
    return (
      <div className={`text-box-node ${selected ? 'is-selected' : ''}`}>
        <NodeResizer
          isVisible={selected}
          minWidth={120}
          minHeight={72}
          color="#1f6feb"
          onResizeEnd={(_, params) => contextNode.onResizeTextBox?.(contextNode.id, params.width, params.height)}
        />
        {isDiamond ? (
          <>
            <Handle type="target" position={Position.Top} id="target-top" className="shape-handle diamond-top" />
            <Handle type="source" position={Position.Right} id="source-right" className="shape-handle diamond-right" />
            <Handle type="target" position={Position.Bottom} id="target-bottom" className="shape-handle diamond-bottom" />
            <Handle type="source" position={Position.Left} id="source-left" className="shape-handle diamond-left" />
          </>
        ) : (
          <>
            <Handle type="target" position={Position.Left} />
            <Handle type="source" position={Position.Right} />
          </>
        )}
        <div
          className={`text-box-surface shape-${contextNode.shape || 'rectangle'}`}
          style={{ '--text-box-bg': contextNode.backgroundColor || textBoxBackgroundColors[0] } as CSSProperties}
        >
          <div className="text-box-content">
            {!isTextBoxFallbackTitle(contextNode.title, contextNode.shape || 'rectangle') && (
              <span className="text-box-title">{contextNode.title}</span>
            )}
            <span className="text-box-body">{contextNode.body || t('ui.textBoxPlaceholder')}</span>
            {contextNode.shapeMeaning && <span className="text-box-meaning">{contextNode.shapeMeaning}</span>}
          </div>
        </div>
      </div>
    )
  }
  if (isComplexChat) {
    const turns = contextNode.turns || []
    return (
      <div className={`canvas-node complex-chat-node ${selected ? 'is-selected' : ''}`}>
        <Handle type="target" position={Position.Left} />
        <div className="node-header">
          <span className="node-icon">{nodeIcon(contextNode.type)}</span>
          <span className="node-title">{contextNode.title}</span>
        </div>
        <div className="node-meta">
          <span>Complex Chat</span>
          <span>{turns.length} turns</span>
        </div>
        <div className="status-strip">
          <span className="pill pinned">{countByStatus(contextNode, 'pinned')} pin</span>
          <span className="pill included">{countByStatus(contextNode, 'included')} in</span>
          <span className="pill needs_review">{countByStatus(contextNode, 'needs_review')} review</span>
        </div>
        <button className="node-mini-action nodrag nopan" onClick={() => contextNode.onOpenComplexChat?.(contextNode.id)}>
          <MessageSquareText size={13} />
          {t('complex.openTurns')}
        </button>
        {Array.isArray(contextNode.usedContextCandidates) && contextNode.usedContextCandidates.length > 0 && (
          <button className="node-mini-action nodrag nopan" onClick={() => contextNode.onReadUsedContext?.(contextNode.id)}>
            <FileText size={13} />
            {t('complex.readContext')}
          </button>
        )}
        <Handle type="source" position={Position.Right} />
      </div>
    )
  }
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
      {['chat', 'document', 'note'].includes(contextNode.type) && typeof contextNode.body === 'string' && (
        <button
          className="node-mini-action nodrag nopan"
          onClick={(event) => {
            event.stopPropagation()
            contextNode.onResliceNode?.(contextNode.id)
          }}
        >
          <Scissors size={13} />
          Slice
        </button>
      )}
      {contextNode.type === 'bundle' && <div className="bundle-note">{t('ui.exportsActive')}</div>}
      {isStart && <div className="bundle-note">{t('ui.importOrConnect')}</div>}
      {isEnd && (
        <div className="end-node-controls nodrag nopan">
          <select
            value={contextNode.outputFormat || 'md'}
            onChange={(event) => contextNode.onOutputFormatChange?.(event.target.value as OutputFormat)}
          >
            <option value="md">Markdown</option>
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

function CanvasToolbar({ onAddTextBox }: { onAddTextBox: (shape: TextBoxShape) => void }) {
  const { t } = useI18n()
  return (
    <div className="canvas-toolbar" aria-label={t('ui.insertCanvasNode')}>
      <span className="canvas-toolbar-label">{t('ui.insert')}</span>
      {textBoxShapes.map(({ value, label, icon: Icon }) => (
        <button key={value} className="canvas-tool-button" onClick={() => onAddTextBox(value)} title={`${t('ui.insert')} ${t(`ui.shape.${value}` as 'ui.shape.rectangle')}`} aria-label={`${t('ui.insert')} ${t(`ui.shape.${value}` as 'ui.shape.rectangle')}`}>
          <Icon size={15} />
          <span>{t(`ui.shape.${value}` as 'ui.shape.rectangle')}</span>
        </button>
      ))}
    </div>
  )
}

function makeFlowNodes(workspace: Workspace): ContextFlowNode[] {
  return workspace.nodes.map((node, index) => {
    const sourceIndex = workspace.nodes.filter((item) => item.type !== 'start' && item.type !== 'end').findIndex((item) => item.id === node.id)
    const defaultPosition =
      node.type === 'start'
        ? { x: 40, y: 260 }
        : node.type === 'end'
          ? { x: 900, y: 260 }
          : { x: 300 + (sourceIndex % 2) * 280, y: 130 + Math.floor(Math.max(sourceIndex, 0) / 2) * 190 }
    const position = node.canvasPosition || defaultPosition
    return {
      id: node.id,
      type: 'context',
      position,
      style:
        node.type === 'text_box'
          ? { width: node.canvasWidth || 176, height: node.canvasHeight || 92 }
          : undefined,
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
  const { t } = useI18n()
  const [type, setType] = useState<TextImportType>('chat')
  const [title, setTitle] = useState(() => t('ui.importedSource'))
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
            <h2>{t('ui.importContext')}</h2>
            <p>{t('ui.importDescription')}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t('ui.closeImport')}>
            x
          </button>
        </div>

        <div className="segmented">
          <button className={type === 'chat' ? 'active' : ''} onClick={() => setType('chat')}>
            {t('ui.chat')}
          </button>
          <button className={type === 'document' ? 'active' : ''} onClick={() => setType('document')}>
            {t('ui.document')}
          </button>
          <button className={type === 'note' ? 'active' : ''} onClick={() => setType('note')}>
            {t('ui.note')}
          </button>
        </div>

        <label className="field">
          <span>{t('ui.title')}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>

        <label className="field">
          <span>{t('ui.sourceText')}</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={t('ui.pastePlaceholder')}
            rows={10}
          />
        </label>

        <div className="modal-actions">
          <div className="import-file-actions">
            <label className="secondary-button file-picker">
              <FileText size={16} />
              {t('ui.addDocument')}
              <input type="file" accept=".md,.markdown,.txt,.docx,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onSourceFile} />
            </label>
            <label className="secondary-button file-picker">
              <ImageIcon size={16} />
              {t('ui.addImage')}
              <input type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" onChange={onImage} />
            </label>
          </div>
          <button
            className="primary-button"
            onClick={() => {
              if (!body.trim()) return
              onAddText(type, title.trim() || t('ui.untitledSource'), body)
              onClose()
            }}
          >
            <Scissors size={16} />
            {t('ui.sliceIntoBlocks')}
          </button>
        </div>
        {fileNotice && <div className="import-inline-warning">{fileNotice}</div>}
      </div>
    </div>
  )
}

function MarkdownPreview({
  node,
  activeBlockId,
  onActiveBlockChange,
  onAddSelection,
  onUpdateBlock,
  onDeleteBlock,
  variant = 'panel',
}: {
  node: ContextNode
  activeBlockId?: string
  onActiveBlockChange?: (blockId: string) => void
  onAddSelection: (status: BlockStatus, text: string) => void
  onUpdateBlock: (blockId: string, patch: Partial<ContextBlock>) => void
  onDeleteBlock?: (blockId: string) => void
  variant?: 'panel' | 'workspace'
}) {
  const { t } = useI18n()
  const [selectedText, setSelectedText] = useState('')
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number } | null>(null)
  const fallbackBody = typeof node.body === 'string' ? node.body.trim() : ''
  const annotationBlocks = node.blocks.filter((block) => block.isGenerated && block.text?.trim())
  const sourceBlocks = node.blocks
    .filter((block) => !block.isGenerated)
    .sort((first, second) => {
      const firstOrder = first.sourceOrder ?? (first.text && node.body ? node.body.indexOf(first.text) : -1)
      const secondOrder = second.sourceOrder ?? (second.text && node.body ? node.body.indexOf(second.text) : -1)
      const normalizedFirst = firstOrder >= 0 ? firstOrder : Number.MAX_SAFE_INTEGER
      const normalizedSecond = secondOrder >= 0 ? secondOrder : Number.MAX_SAFE_INTEGER
      return normalizedFirst - normalizedSecond
    })
  const previewBlocks =
    sourceBlocks.length > 0
      ? sourceBlocks
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
          <h3>{variant === 'workspace' ? node.title : t('ui.markdownPreview')}</h3>
          <p>{t('ui.readerHint')}</p>
        </div>
        <span className="role-chip">{previewBlocks.length} blocks</span>
      </div>

      <div className="selection-toolbar">
        <span>{selectedText ? `${Math.min(selectedText.length, 999)} ${t('ui.charsSelected')}` : t('ui.noTextSelected')}</span>
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
            <h4>{t('ui.noReadableText')}</h4>
            <p>{t('ui.noReadableTextBody')}</p>
          </div>
        )}
        {previewBlocks.map((block) => (
          <MarkdownBlock
            key={block.id}
            block={block}
            isActive={activeBlockId === block.id}
            annotations={annotationBlocks}
            onSelect={() => onActiveBlockChange?.(block.id)}
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
  activeBlockId,
  onActiveBlockChange,
  onAddBlock,
  onUpdateBlock,
  onDeleteBlock,
  onExit,
}: {
  node: ContextNode
  activeBlockId?: string
  onActiveBlockChange: (blockId: string) => void
  onAddBlock: (nodeId: string, block: Omit<ContextBlock, 'id' | 'nodeId'>) => void
  onUpdateBlock: (nodeId: string, blockId: string, patch: Partial<ContextBlock>) => void
  onDeleteBlock: (nodeId: string, blockId: string) => void
  onExit: () => void
}) {
  const { t } = useI18n()
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const skipReaderAutoScrollRef = useRef(false)

  useEffect(() => {
    const firstBlock = node.blocks.filter((block) => !block.isGenerated)[0]
    if (firstBlock) onActiveBlockChange(firstBlock.id)
  }, [node.id])

  useEffect(() => {
    if (!activeBlockId) return
    if (skipReaderAutoScrollRef.current) {
      skipReaderAutoScrollRef.current = false
      return
    }
    const block = workspaceRef.current?.querySelector<HTMLElement>(`[data-preview-block-id="${activeBlockId}"]`)
    block?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeBlockId, node.id])

  const selectBlockFromReader = (blockId: string) => {
    skipReaderAutoScrollRef.current = true
    onActiveBlockChange(blockId)
  }

  const syncActiveBlockFromScroll = () => {
    const container = workspaceRef.current
    if (!container) return
    const blocks = Array.from(container.querySelectorAll<HTMLElement>('[data-preview-block-id]'))
    if (blocks.length === 0) return
    const topGuide = container.getBoundingClientRect().top + 120
    const visibleBlocks = blocks.filter((block) => block.getBoundingClientRect().top <= topGuide)
    const activeBlock = visibleBlocks[visibleBlocks.length - 1] || blocks[0]
    const blockId = activeBlock.dataset.previewBlockId
    if (blockId && blockId !== activeBlockId) {
      skipReaderAutoScrollRef.current = true
      onActiveBlockChange(blockId)
    }
  }

  return (
    <div className="document-workspace" ref={workspaceRef} onScroll={syncActiveBlockFromScroll}>
      <div className="document-workspace-bar">
        <button className="secondary-button" onClick={onExit}>
          <ArrowLeft size={16} />
          {t('ui.saveBack')}
        </button>
        <span>{t('ui.changesAutosaved')}</span>
      </div>
      <MarkdownPreview
        node={node}
        activeBlockId={activeBlockId}
        onActiveBlockChange={selectBlockFromReader}
        variant="workspace"
        onAddSelection={(status, text) =>
          onAddBlock(node.id, {
            type: 'text',
            text,
            status,
            tags: [],
            reason: 'Selected from local document preview.',
            isGenerated: true,
            sourceOrder: node.body && node.body.indexOf(text) >= 0 ? node.body.indexOf(text) : undefined,
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
  isActive = false,
  annotations = [],
  onSelect,
  onUpdate,
  onDelete,
}: {
  block: ContextBlock
  isActive?: boolean
  annotations?: ContextBlock[]
  onSelect?: () => void
  onUpdate: (patch: Partial<ContextBlock>) => void
  onDelete?: () => void
}) {
  const { t } = useI18n()
  const text = block.text || ''
  const lines = text.split('\n')
  const firstLine = lines[0]?.trim() || ''
  const isHeading = /^#{1,6}\s+/.test(firstLine)
  const isFence = /^```/.test(firstLine)
  const isList = lines.every((line) => !line.trim() || /^(\s*[-*+]\s+|\s*\d+\.\s+)/.test(line))

  return (
    <div className={`md-block status-${block.status} ${isActive ? 'is-active' : ''}`} data-preview-block-id={block.id} onClick={onSelect}>
      <div className="md-block-actions">
        <button
          className={block.status === 'pinned' ? 'active' : ''}
          onClick={() => onUpdate({ status: nextBlockStatus(block.status, 'pinned') })}
        >
          Pin
        </button>
        <button className={block.status === 'included' ? 'active' : ''} onClick={() => onUpdate({ status: 'included' })}>
          Include
        </button>
        <button
          className={block.status === 'excluded' ? 'active' : ''}
          onClick={() => onUpdate({ status: nextBlockStatus(block.status, 'excluded') })}
        >
          Ignore
        </button>
        {onDelete && (
          <button className="danger-action" onClick={onDelete} aria-label={t('ui.deleteBlock')}>
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
  isActive = false,
  onSelect,
  onUpdate,
  onDelete,
}: {
  block: ContextBlock
  isActive?: boolean
  onSelect: () => void
  onUpdate: (patch: Partial<ContextBlock>) => void
  onDelete: () => void
}) {
  const { t } = useI18n()
  const [customTag, setCustomTag] = useState('')
  const setStatus = (status: BlockStatus) => onUpdate({ status: nextBlockStatus(block.status, status) })
  const addCustomTag = () => {
    const tag = customTag.trim()
    if (!tag || block.tags.includes(tag)) return
    onUpdate({ tags: [...block.tags, tag] })
    setCustomTag('')
  }
  const customTags = block.tags.filter((tag) => !tagOptions.includes(tag as BuiltInBlockTag))
  return (
    <div className={`block-card status-${block.status} ${isActive ? 'is-active' : ''}`} data-block-editor-id={block.id} onClick={onSelect}>
      <div className="block-toolbar">
        {(block.speakerName || (block.role && block.role !== 'unknown')) && <span className="role-chip">{block.speakerName || block.role}</span>}
        <select value={block.status} onChange={(event) => onUpdate({ status: event.target.value as BlockStatus })}>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}` as 'status.included')}
            </option>
          ))}
        </select>
          <button className="icon-button danger-action" onClick={onDelete} aria-label={t('ui.deleteBlock')}>
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
        {customTags.map((tag) => (
          <button key={tag} className="tag active" onClick={() => onUpdate({ tags: block.tags.filter((item) => item !== tag) })} title={t('ui.removeCustomTag')}>
            {tag} x
          </button>
        ))}
      </div>
      <div className="custom-tag-row">
        <input
          value={customTag}
          onChange={(event) => setCustomTag(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addCustomTag()
            }
          }}
          placeholder={t('ui.customTag')}
        />
        <button className="secondary-button" onClick={addCustomTag} disabled={!customTag.trim()}>
          Add tag
        </button>
      </div>
      <input
        className="reason-input"
        value={block.reason || ''}
        onChange={(event) => onUpdate({ reason: event.target.value })}
        placeholder={t('ui.reasonNote')}
      />
    </div>
  )
}

function ComplexChatWorkspace({
  node,
  onExit,
  onUpdateBlock,
  onDeleteBlock,
}: {
  node: ContextNode
  onExit: () => void
  onUpdateBlock: (nodeId: string, blockId: string, patch: Partial<ContextBlock>) => void
  onDeleteBlock: (nodeId: string, blockId: string) => void
}) {
  const turns = node.turns || []
  const { t } = useI18n()
  return (
    <div className="document-workspace complex-chat-workspace">
      <div className="workspace-header">
        <button className="secondary-button" onClick={onExit}>
          <ArrowLeft size={16} />
          {t('complex.saveExit')}
        </button>
        <div>
          <div className="eyebrow">Complex Chat</div>
          <h2>{node.title}</h2>
          <p>{turns.length} turns · {node.blocks.length} blocks · {t('complex.sourceReadOnly')}</p>
        </div>
      </div>
      <div className="complex-chat-turn-list">
        {turns.map((turn) => (
          <article className="complex-chat-turn" key={turn.id}>
            <div className="complex-chat-turn-header">
              <div>
                <span className="eyebrow">Turn {turn.sequence}</span>
                <h3>{turn.title}</h3>
              </div>
              <span className={`turn-status turn-${turn.status}`}>{t(`complex.status.${turn.status}` as 'complex.status.completed' | 'complex.status.aborted' | 'complex.status.in_progress')}</span>
            </div>
            {turn.blocks.map((block) => (
              <BlockEditor
                key={block.id}
                block={block}
                onSelect={() => undefined}
                onUpdate={(patch) => onUpdateBlock(node.id, block.id, patch)}
                onDelete={() => onDeleteBlock(node.id, block.id)}
              />
            ))}
            {turn.blocks.length === 0 && <p className="hint">{t('complex.noBlocks')}</p>}
          </article>
        ))}
        {turns.length === 0 && <div className="empty-state"><MessageSquareText size={22} /><h2>{t('complex.noTurns')}</h2></div>}
      </div>
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
  const { t } = useI18n()
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
            {t('ui.box')}
          </button>
          <button className={tool === 'text' ? 'active' : ''} onClick={() => setTool('text')}>
            <Pilcrow size={14} />
            {t('ui.text')}
          </button>
        </div>
        <div className="swatch-row" aria-label={t('ui.annotationColor')}>
          {imageAnnotationColors.map((item) => (
            <button
              key={item}
              className={item === color ? 'swatch active' : 'swatch'}
              style={{ backgroundColor: item }}
              onClick={() => setColor(item)}
              aria-label={t('ui.useColor', { color: item })}
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
          {node.imageUrl ? <img src={node.imageUrl} alt={node.title} draggable={false} onDragStart={(event) => event.preventDefault()} /> : <div className="empty-image">{t('ui.noImage')}</div>}
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
              <span style={{ backgroundColor: region.color || imageAnnotationColors[0] }}>{region.label || (region.kind === 'text' ? t('ui.text') : t('ui.region'))}</span>
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
      <p className="hint">{tool === 'bbox' ? t('ui.drawBbox') : t('ui.placeTextBox')}</p>
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
  const { t } = useI18n()
  const [zoom, setZoom] = useState(140)
  return (
    <div className="document-workspace image-workspace">
      <div className="document-workspace-bar">
        <button className="secondary-button" onClick={onExit}>
          <ArrowLeft size={16} />
          {t('ui.saveBack')}
        </button>
        <label className="zoom-control">
          <span>{t('ui.zoom', { zoom })}</span>
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
  activeBlockId,
  onUpdateNode,
  onUpdateEdge,
  onDeleteEdge,
  onUpdateBlock,
  onAddRegion,
  onUpdateRegion,
  onDeleteRegion,
  onAddBlock,
  onDeleteBlock,
  onSelectBlock,
  onOpenTextWorkspace,
  onOpenImageWorkspace,
}: {
  node?: ContextNode
  edge?: ContextEdge
  edgeFrom?: ContextNode
  edgeTo?: ContextNode
  activeBlockId?: string
  onUpdateNode: (nodeId: string, patch: Partial<ContextNode>) => void
  onUpdateEdge: (edgeId: string, patch: Partial<ContextEdge>) => void
  onDeleteEdge: (edgeId: string) => void
  onUpdateBlock: (nodeId: string, blockId: string, patch: Partial<ContextBlock>) => void
  onAddRegion: (nodeId: string, annotation: ImageAnnotationDraft) => void
  onUpdateRegion: (nodeId: string, regionId: string, patch: { label?: string; note?: string; status?: BlockStatus; color?: string; fontFamily?: string }) => void
  onDeleteRegion: (nodeId: string, regionId: string) => void
  onAddBlock: (nodeId: string, block: Omit<ContextBlock, 'id' | 'nodeId'>) => void
  onDeleteBlock: (nodeId: string, blockId: string) => void
  onSelectBlock: (blockId: string) => void
  onOpenTextWorkspace: (nodeId: string) => void
  onOpenImageWorkspace: (nodeId: string) => void
}) {
  const { t } = useI18n()
  const [blockFilter, setBlockFilter] = useState<BlockFilter>('all')
  const inspectorRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!activeBlockId) return
    const block = inspectorRef.current?.querySelector<HTMLElement>(`[data-block-editor-id="${activeBlockId}"]`)
    block?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeBlockId, blockFilter, node?.id])

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
          <h3>{t('ui.connection')}</h3>
          <div className="edge-editor">
            <div>
              <span>{t('ui.from')}</span>
              <strong>{edgeFrom?.title || edge.from}</strong>
            </div>
            <div>
              <span>{t('ui.to')}</span>
              <strong>{edgeTo?.title || edge.to}</strong>
            </div>
            <label className="field">
              <span>{t('ui.label')}</span>
              <input value={edge.label} onChange={(event) => onUpdateEdge(edge.id, { label: event.target.value })} placeholder={t('ui.related')} />
            </label>
            <button className="secondary-button danger-action wide" onClick={() => onDeleteEdge(edge.id)}>
              <Trash2 size={16} />
              {t('ui.deleteConnection')}
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
          <h2>{t('ui.selectNode')}</h2>
          <p>{t('ui.selectNodeBody')}</p>
        </div>
      </aside>
    )
  }

  const orderedBlocks = node
    ? [...node.blocks]
        .sort((first, second) => {
          const firstOrder = first.sourceOrder ?? (first.text && node.body ? node.body.indexOf(first.text) : -1)
          const secondOrder = second.sourceOrder ?? (second.text && node.body ? node.body.indexOf(second.text) : -1)
          const normalizedFirst = firstOrder >= 0 ? firstOrder : Number.MAX_SAFE_INTEGER
          const normalizedSecond = secondOrder >= 0 ? secondOrder : Number.MAX_SAFE_INTEGER
          return normalizedFirst - normalizedSecond
        })
        .filter((block) => blockFilter === 'all' || block.status === blockFilter)
    : []

  return (
    <aside className="inspector" ref={inspectorRef}>
      <div className="inspector-header">
        <span className="node-icon">{nodeIcon(node.type)}</span>
        {node.type === 'text_box' ? (
          <span className="node-title">{node.title}</span>
        ) : (
          <input value={node.title} onChange={(event) => onUpdateNode(node.id, { title: event.target.value })} />
        )}
      </div>

      {isTextReviewNode(node) && (
        <button className="secondary-button wide" onClick={() => onOpenTextWorkspace(node.id)}>
          <Maximize2 size={16} />
          {t('ui.reviewText')}
        </button>
      )}

      {node.type === 'image' && (
        <>
          <button className="secondary-button wide" onClick={() => onOpenImageWorkspace(node.id)}>
            <Maximize2 size={16} />
            {t('ui.zoomEdit')}
          </button>
          <ImageInspector node={node} onAddRegion={(annotation) => onAddRegion(node.id, annotation)} />
        </>
      )}

      {node.type === 'text_box' && (
        <section className="panel-section text-box-inspector">
          <h3>{t('ui.textBoxNode')}</h3>
          <label className="field">
            <span>{t('ui.backgroundColor')}</span>
            <div className="region-style-row">
              {textBoxBackgroundColors.map((color) => (
                <button
                  key={color}
                  className={color === (node.backgroundColor || textBoxBackgroundColors[0]) ? 'swatch active' : 'swatch'}
                  style={{ backgroundColor: color }}
                  onClick={() => onUpdateNode(node.id, { backgroundColor: color })}
                  aria-label={t('ui.useColor', { color })}
                />
              ))}
            </div>
          </label>
          <label className="field">
            <span>{t('ui.shape')}</span>
            <select value={node.shape || 'rectangle'} onChange={(event) => onUpdateNode(node.id, { shape: event.target.value as TextBoxShape })}>
              {textBoxShapes.map(({ value, label }) => (
                <option key={value} value={value}>
                  {t(`ui.shape.${value}` as 'ui.shape.rectangle')}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('ui.shapeMeaning')}</span>
            <input
              value={node.shapeMeaning || ''}
              onChange={(event) => onUpdateNode(node.id, { shapeMeaning: event.target.value })}
              placeholder={t('ui.shapeMeaningPlaceholder')}
            />
          </label>
          <label className="field">
            <span>{t('ui.text')}</span>
            <textarea value={node.body || ''} onChange={(event) => onUpdateNode(node.id, { body: event.target.value })} rows={5} />
          </label>
          <p className="hint">{t('ui.shapeHint')}</p>
        </section>
      )}

      {node.regions.length > 0 && (
        <section className="panel-section">
          <h3>{t('ui.imageRegions')}</h3>
          {node.regions.map((region) => (
            <div className={`block-card status-${region.status}`} key={region.id}>
              <div className="block-toolbar">
                <span className="role-chip">{region.kind === 'text' ? 'text' : 'bbox'}</span>
                <select value={region.status} onChange={(event) => onUpdateRegion(node.id, region.id, { status: event.target.value as BlockStatus })}>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {t(`status.${status}` as 'status.included')}
                    </option>
                  ))}
                </select>
                <button className="icon-button danger-action" onClick={() => onDeleteRegion(node.id, region.id)} aria-label={t('ui.deleteAnnotation')}>
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
                    aria-label={t('ui.useColor', { color: item })}
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
              <input value={region.label} onChange={(event) => onUpdateRegion(node.id, region.id, { label: event.target.value })} placeholder={t('ui.label')} />
              <textarea value={region.note} onChange={(event) => onUpdateRegion(node.id, region.id, { note: event.target.value })} placeholder={t('ui.regionNote')} />
            </div>
          ))}
        </section>
      )}

      {node.type === 'start' && (
        <div className="empty-state">
          <Play size={22} />
          <h2>{t('ui.startNode')}</h2>
          <p>{t('ui.startNodeBody')}</p>
        </div>
      )}

      {node.type !== 'start' && node.type !== 'end' && node.type !== 'image' && node.type !== 'bundle' && node.type !== 'text_box' && (
        <section className="panel-section">
          <div className="section-heading-row compact-heading">
            <div>
              <h3>{node.type === 'document' ? t('ui.structuredBlocks') : t('ui.blocks')}</h3>
              <p className="hint">{orderedBlocks.length} shown / {node.blocks.length} total</p>
            </div>
            <select className="block-filter" value={blockFilter} onChange={(event) => setBlockFilter(event.target.value as BlockFilter)}>
              <option value="all">{t('ui.all')}</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                    {t(`status.${status}` as 'status.included')}
                </option>
              ))}
            </select>
          </div>
          {node.type === 'document' && (
            <p className="hint">{t('ui.readerBlockHint')}</p>
          )}
          {orderedBlocks.map((block) => (
            <BlockEditor
              key={block.id}
              block={block}
              isActive={activeBlockId === block.id}
              onSelect={() => onSelectBlock(block.id)}
              onUpdate={(patch) => onUpdateBlock(node.id, block.id, patch)}
              onDelete={() => onDeleteBlock(node.id, block.id)}
            />
          ))}
          {orderedBlocks.length === 0 && <p className="hint">{t('ui.noMatchingBlocks')}</p>}
        </section>
      )}

      {node.type === 'bundle' && (
        <div className="empty-state">
          <Archive size={22} />
          <h2>{t('ui.bundleNode')}</h2>
          <p>{t('ui.bundleNodeBody')}</p>
        </div>
      )}

      {node.type === 'end' && (
        <div className="empty-state">
          <Flag size={22} />
          <h2>{t('ui.endNode')}</h2>
          <p>{t('ui.endNodeBody')}</p>
        </div>
      )}
    </aside>
  )
}

function BundlePreview({
  generated,
  draft,
  isDirty,
  format,
  onDraftChange,
  onReset,
}: {
  generated: string
  draft: string
  isDirty: boolean
  format: OutputFormat
  onDraftChange: (value: string) => void
  onReset: () => void
}) {
  const { t } = useI18n()
  const [mode, setMode] = useState<'edit' | 'generated'>('edit')

  return (
    <aside className="bundle-preview">
      <div className="preview-header">
        <div>
          <div className="eyebrow">{t('ui.outputUse')}</div>
          <h2>{t('ui.bundlePreview')}</h2>
        </div>
        <Link size={16} />
      </div>
      <div className="preview-mode-row">
        <span className="preview-format">{format}</span>
          <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>
          {t('ui.edit')}
        </button>
        <button className={mode === 'generated' ? 'active' : ''} onClick={() => setMode('generated')}>
          {t('ui.generated')}
        </button>
        <button disabled={!isDirty} onClick={onReset}>
          {t('ui.reset')}
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

function NewCanvasModal({
  onClose,
  onDownloadAndCreate,
  onCreate,
}: {
  onClose: () => void
  onDownloadAndCreate: () => void
  onCreate: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="modal-backdrop">
      <div className="modal confirm-modal">
        <div className="modal-header">
          <div>
            <h2>{t('ui.newCanvas')}</h2>
            <p>{t('ui.newCanvasBody')}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t('ui.closeDialog')}>
            x
          </button>
        </div>
        <div className="confirm-copy">
          <p>{t('ui.downloadFirst')}</p>
        </div>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>
            {t('ui.cancel')}
          </button>
          <div className="confirm-actions">
            <button className="secondary-button danger-action" onClick={onCreate}>
              {t('ui.newWithoutDownload')}
            </button>
            <button className="primary-button" onClick={onDownloadAndCreate}>
              <Download size={16} />
              {t('ui.downloadBundleNew')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SettingsModal({ locale, onLocaleChange, onClose }: { locale: Locale; onLocaleChange: (locale: Locale) => void; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-header">
          <div>
            <h2 id="settings-title">{t('settings.title')}</h2>
            <p>{t('settings.languageHint')}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={t('settings.close')}>x</button>
        </div>
        <label className="field">
          <span>{t('settings.language')}</span>
          <select value={locale} onChange={(event) => onLocaleChange(event.target.value as Locale)}>
            <option value="en">{t('settings.english')}</option>
            <option value="zh-CN">{t('settings.chinese')}</option>
          </select>
        </label>
        <div className="modal-actions">
          <button className="primary-button" onClick={onClose}>{t('settings.close')}</button>
        </div>
      </div>
    </div>
  )
}

export function App() {
  const { locale, setLocale, t } = useI18n()
  const initialWorkspace = useMemo(() => loadStoredWorkspace() || withSystemNodes(sampleWorkspace), [])
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace)
  const [flowNodes, setFlowNodes] = useState<ContextFlowNode[]>(() => makeFlowNodes(initialWorkspace))
  const [flowEdges, setFlowEdges] = useState<Edge[]>(() => makeFlowEdges(initialWorkspace))
  const [selectedNodeId, setSelectedNodeId] = useState<string>(() => initialWorkspace.nodes.find((node) => node.type !== 'start' && node.type !== 'end')?.id || startNodeId)
  const [activeTextNodeId, setActiveTextNodeId] = useState<string | null>(null)
  const [activeComplexChatId, setActiveComplexChatId] = useState<string | null>(null)
  const [activeImageId, setActiveImageId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [showNewCanvas, setShowNewCanvas] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [importNotice, setImportNotice] = useState('')
  const [bundleDraft, setBundleDraft] = useState('')
  const [bundleDraftEdited, setBundleDraftEdited] = useState(false)
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('md')
  const [saveNotice, setSaveNotice] = useState(() => (loadStoredWorkspace() ? t('ui.loadedLocal') : t('ui.autosaveReady')))
  const [saveToast, setSaveToast] = useState('')
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
  const [usedContextReview, setUsedContextReview] = useState<{ nodeId: string; candidateIds: string[] } | null>(null)
  const historyPastRef = useRef<Workspace[]>([])
  const historyFutureRef = useRef<Workspace[]>([])
  const resliceNodeRef = useRef<(nodeId: string) => void>(() => {})

  const selectedNode = workspace.nodes.find((node) => node.id === selectedNodeId)
  const selectedEdge = selectedEdgeId ? workspace.edges.find((edge) => edge.id === selectedEdgeId) : undefined
  const selectedEdgeFrom = selectedEdge ? workspace.nodes.find((node) => node.id === selectedEdge.from) : undefined
  const selectedEdgeTo = selectedEdge ? workspace.nodes.find((node) => node.id === selectedEdge.to) : undefined
  const activeTextNode = activeTextNodeId ? workspace.nodes.find((node) => node.id === activeTextNodeId && isTextReviewNode(node)) : undefined
  const activeComplexChat = activeComplexChatId ? workspace.nodes.find((node) => node.id === activeComplexChatId && node.type === 'complex_chat') : undefined
  const activeImage = activeImageId ? workspace.nodes.find((node) => node.id === activeImageId && node.type === 'image') : undefined
  const bundle = useMemo(() => generateBundleMarkdown(workspace), [workspace])
  const generatedOutput = useMemo(
    () => (outputFormat === 'json' ? JSON.stringify(generateBundleJson(workspace), null, 2) : bundle),
    [bundle, outputFormat, workspace],
  )
  const bundleToDownload = bundleDraftEdited ? bundleDraft : generatedOutput
  const downloadBundle = useCallback(() => {
    const payload = bundleDownload(outputFormat, bundleToDownload, workspace)
    downloadText(payload.filename, payload.content, payload.mime)
  }, [bundleToDownload, outputFormat, workspace])
  const changeOutputFormat = useCallback((format: OutputFormat) => {
    setOutputFormat(format)
    setBundleDraftEdited(false)
  }, [])

  useEffect(() => {
    if (!bundleDraftEdited) setBundleDraft(generatedOutput)
  }, [generatedOutput, bundleDraftEdited])

  useEffect(() => {
    setSaveNotice(saveStoredWorkspace(withSystemNodes(workspace)) ? t('ui.savedLocally') : t('ui.localSaveFailed'))
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
    if (activeTextNodeId && !activeTextNode) setActiveTextNodeId(null)
    if (activeComplexChatId && !activeComplexChat) setActiveComplexChatId(null)
    if (activeImageId && !activeImage) setActiveImageId(null)
  }, [activeTextNode, activeTextNodeId, activeComplexChat, activeComplexChatId, activeImage, activeImageId])

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
                onResliceNode: (nodeId: string) => resliceNodeRef.current(nodeId),
                onOpenComplexChat: (nodeId: string) => {
                  setSelectedNodeId(nodeId)
                  setActiveComplexChatId(nodeId)
                  setActiveTextNodeId(null)
                  setActiveImageId(null)
                },
                onReadUsedContext,
                outputFormat,
                onOutputFormatChange: changeOutputFormat,
                onDownloadBundle: downloadBundle,
                onResizeTextBox,
              }
            : {
                ...contextNode,
                onResliceNode: (nodeId: string) => resliceNodeRef.current(nodeId),
                onOpenComplexChat: (nodeId: string) => {
                  setSelectedNodeId(nodeId)
                  setActiveComplexChatId(nodeId)
                  setActiveTextNodeId(null)
                  setActiveImageId(null)
                },
                onReadUsedContext,
                onResizeTextBox,
              }
        if (existing)
          return {
            ...existing,
            style:
              contextNode.type === 'text_box'
                ? { ...(existing.style || {}), width: contextNode.canvasWidth || 176, height: contextNode.canvasHeight || 92 }
                : existing.style,
            position: contextNode.canvasPosition || existing.position,
            data,
          }
        return {
          id: contextNode.id,
          type: 'context',
          position: { x: 140 + index * 42, y: 140 + index * 28 },
          style:
            contextNode.type === 'text_box'
              ? { width: contextNode.canvasWidth || 176, height: contextNode.canvasHeight || 92 }
              : undefined,
          data,
        }
      }),
    )
    setFlowEdges(makeFlowEdges(workspace))
  }, [changeOutputFormat, downloadBundle, outputFormat, workspace])

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

  const importCodexSession = ({ patch, session, sourceFileName, splitTurns, connectStartAndEnd, usedContextCandidates, selectedUsedContextIds }: CodexImportPayload) => {
    if (patch.nodes.length === 0) return
    const sessionNodeId = createId('node_codex_session')
    const importedTurns: ContextTurn[] = splitTurns
      ? patch.nodes.map((turnNode, index) => ({
          id: turnNode.id,
          sequence: index + 1,
          title: turnNode.title,
          status: session.turns[index]?.status || 'completed',
          blocks: turnNode.blocks.map((block) => ({ ...block, nodeId: sessionNodeId })),
          startedAt: session.turns[index]?.startedAt,
          completedAt: session.turns[index]?.completedAt,
        }))
      : [
          {
            id: createId('turn_codex_session'),
            sequence: 1,
            title: 'Full Codex session',
            status: session.turns.every((turn) => turn.status === 'completed') ? 'completed' : 'in_progress',
            blocks: patch.nodes.flatMap((turnNode) => turnNode.blocks.map((block) => ({ ...block, nodeId: sessionNodeId }))),
          },
        ]
    const sessionNode: ContextNode = {
      id: sessionNodeId,
      type: 'complex_chat',
      title: `Codex session · ${sourceFileName.replace(/\.jsonl$/i, '')}`,
      sourceName: sourceFileName,
      sourcePath: sourceFileName,
      turns: importedTurns,
      blocks: importedTurns.flatMap((turn) => turn.blocks),
      regions: [],
      expanded: false,
      createdAt: session.session.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      codexImport: {
        sessionId: session.session.codexSessionId,
        threadId: session.session.codexThreadId,
        sourceFormat: session.sourceFormat,
      },
      usedContextCandidates,
    }
    const newEdges = connectStartAndEnd
      ? [
          { id: createId('edge_codex_session'), from: startNodeId, to: sessionNodeId, label: 'imported session' },
          { id: createId('edge_codex_session'), from: sessionNodeId, to: endNodeId, label: 'imported session' },
        ]
      : []
    const usedContextNodes = usedContextCandidates.filter((candidate) => selectedUsedContextIds.includes(candidate.id)).flatMap((candidate: CodexUsedContextCandidate) => {
      if (candidate.kind === 'document' && candidate.content) {
        const fileName = candidate.path.split(/[\\/]/).pop() || candidate.path
        return [createTextNode('document', sourceTitle(fileName), candidate.content, fileName, candidate.path)]
      }
      if (candidate.kind === 'image' && candidate.content?.startsWith('data:image/')) {
        const fileName = candidate.path.split(/[\\/]/).pop() || candidate.path
        return [createImageNode(sourceTitle(fileName), candidate.content, fileName, undefined, undefined, candidate.path)]
      }
      return []
    })
    const usedContextEdges = usedContextNodes.map((node) => ({
      id: createId('edge_used_context'),
      from: sessionNodeId,
      to: node.id,
      label: 'used context',
    }))
    updateWorkspace((current) => ({
      ...current,
      nodes: [...current.nodes, sessionNode, ...usedContextNodes],
      edges: [...current.edges, ...newEdges, ...usedContextEdges],
    }))
    setSelectedNodeId(sessionNodeId)
    setSelectedEdgeId(null)
    setActiveBlockId(null)
    setActiveTextNodeId(null)
    setActiveComplexChatId(sessionNodeId)
    setActiveImageId(null)
    setImportNotice(t('notice.importSummary', { file: sourceFileName, count: importedTurns.length }))
    setSaveToast(t('ui.codexImportedWithContext', { count: usedContextNodes.length }))
  }

  const onReadUsedContext = (nodeId: string) => {
    const sourceNode = workspace.nodes.find((node) => node.id === nodeId && node.type === 'complex_chat')
    const candidates = (sourceNode?.usedContextCandidates || []) as CodexUsedContextCandidate[]
    if (candidates.length === 0) {
      setSaveToast(t('ui.noUsedContext'))
      return
    }
    setUsedContextReview({
      nodeId,
      candidateIds: candidates.filter((candidate) => Boolean(candidate.content)).map((candidate) => candidate.id),
    })
  }

  const confirmUsedContextReview = () => {
    if (!usedContextReview) return
    const sourceNode = workspace.nodes.find((node) => node.id === usedContextReview.nodeId && node.type === 'complex_chat')
    const candidates = ((sourceNode?.usedContextCandidates || []) as CodexUsedContextCandidate[]).filter((candidate) => usedContextReview.candidateIds.includes(candidate.id))
    let addedCount = 0
    updateWorkspace((current) => {
      const existingPaths = new Set(current.nodes.map((node) => node.sourcePath).filter(Boolean))
      const nodes = candidates.flatMap((candidate) => {
        if (existingPaths.has(candidate.path)) return []
        if (candidate.kind === 'document' && candidate.content) {
          const fileName = candidate.path.split(/[\\/]/).pop() || candidate.path
          addedCount += 1
          return [createTextNode('document', sourceTitle(fileName), candidate.content, fileName, candidate.path)]
        }
        if (candidate.kind === 'image' && candidate.content?.startsWith('data:image/')) {
          const fileName = candidate.path.split(/[\\/]/).pop() || candidate.path
          addedCount += 1
          return [createImageNode(sourceTitle(fileName), candidate.content, fileName, undefined, undefined, candidate.path)]
        }
        return []
      })
      return {
        ...current,
        nodes: [...current.nodes, ...nodes],
        edges: [
          ...current.edges,
          ...nodes.map((node) => ({ id: createId('edge_used_context'), from: usedContextReview.nodeId, to: node.id, label: 'used context' })),
        ],
      }
    })
    setUsedContextReview(null)
    setSaveToast(t('ui.usedContextRead', { count: addedCount }))
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
    setFlowNodes((current) => makeFlowNodes(next).map((node) => current.find((existing) => existing.id === node.id) || node))
    setWorkspace(next)
  }

  const addNode = (node: ContextNode) => {
    updateWorkspace((current) => ({
      ...current,
      nodes: [...current.nodes, node],
    }))
    setSelectedNodeId(node.id)
    setSelectedEdgeId(null)
    setActiveBlockId(null)
    setActiveTextNodeId(isTextReviewNode(node) ? node.id : null)
    setActiveComplexChatId(node.type === 'complex_chat' ? node.id : null)
    setActiveImageId(node.type === 'image' ? node.id : null)
  }

  const addTextBox = (shape: TextBoxShape) => {
    const node = createTextBoxNode(shape)
    node.title = textBoxFallbackTitle(workspace, node.id, shape)
    addNode(node)
    setSaveToast(t('ui.textBoxAdded', { shape: t(`ui.shape.${shape}` as 'ui.shape.rectangle') }))
  }

  const deleteSource = (nodeId: string) => {
    const node = workspace.nodes.find((item) => item.id === nodeId)
    if (!node || node.type === 'start' || node.type === 'end') return
    updateWorkspace((current) => ({
      ...current,
      nodes: current.nodes.filter((item) => item.id !== nodeId),
      edges: current.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
    }))
    if (activeTextNodeId === nodeId) setActiveTextNodeId(null)
    if (activeComplexChatId === nodeId) setActiveComplexChatId(null)
    if (activeImageId === nodeId) setActiveImageId(null)
    if (selectedNodeId === nodeId) {
      const fallback = workspace.nodes.find((item) => item.id !== nodeId && item.type !== 'start' && item.type !== 'end') || workspace.nodes.find((item) => item.id === startNodeId)
      setSelectedNodeId(fallback?.id || startNodeId)
    }
  }

  const saveWorkspaceLocally = () => {
    const ok = saveStoredWorkspace(withSystemNodes(workspace))
    if (ok) historyFutureRef.current = []
    setSaveNotice(ok ? 'Saved locally' : t('ui.localSaveFailed'))
    setSaveToast(ok ? t('ui.savedSuccessfully') : t('ui.localSaveFailed'))
  }

  const startNewCanvas = () => {
    const next = createEmptyWorkspace()
    historyPastRef.current = []
    historyFutureRef.current = []
    setWorkspace(next)
    setSelectedNodeId(startNodeId)
    setSelectedEdgeId(null)
    setActiveBlockId(null)
    setActiveTextNodeId(null)
    setActiveComplexChatId(null)
    setActiveImageId(null)
    setBundleDraft('')
    setBundleDraftEdited(false)
    setImportNotice('')
    setShowNewCanvas(false)
    setSaveToast(t('ui.newCanvasReady'))
  }

  const downloadCurrentBundleAndStartNew = () => {
    downloadBundle()
    startNewCanvas()
  }

  const importFile = async (file: File): Promise<ImportResult> => {
    setImportNotice('')
    if (/\.(png|jpe?g)$/i.test(file.name) || ['image/png', 'image/jpeg'].includes(file.type)) {
      try {
        const dataUrl = await fileToDataUrl(file)
        addNode(createImageNode(sourceTitle(file.name), dataUrl, file.name, file.type, file.size, sourcePath(file)))
        return { ok: true }
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown image read error.'
        const notice = t('ui.imageReadError', { file: file.name, detail })
        setImportNotice(notice)
        return { ok: false, notice }
      }
    }

    if (isDocxFile(file)) {
      try {
        const { text, messages } = await extractDocxText(file)
        const messageNote = formatMammothMessages(messages, (message) => t('ui.mammothNote', { message }))
        if (!text) {
          const notice = `${t('ui.docxNoText', { file: file.name })}${messageNote}`
          setImportNotice(notice)
          addNode(createTextNode('document', sourceTitle(file.name), '', file.name, sourcePath(file)))
          return { ok: true, notice }
        }
        if (messageNote) setImportNotice(t('ui.docxParserNotes', { file: file.name, notes: messageNote }))
        addNode(createTextNode('document', sourceTitle(file.name), text, file.name, sourcePath(file)))
        return { ok: true }
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown parser error.'
        const notice = t('ui.docxImportError', { file: file.name, detail })
        setImportNotice(notice)
        return { ok: false, notice }
      }
    }

    if (isTextSourceFile(file)) {
      try {
        const text = await file.text()
        if (!text.trim()) {
          const notice = t('ui.emptyText', { file: file.name })
          setImportNotice(notice)
          addNode(createTextNode('document', sourceTitle(file.name), text, file.name, sourcePath(file)))
          return { ok: true, notice }
        }
        addNode(createTextNode('document', sourceTitle(file.name), text, file.name, sourcePath(file)))
        return { ok: true }
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown text read error.'
        const notice = t('ui.textReadError', { file: file.name, detail })
        setImportNotice(notice)
        return { ok: false, notice }
      }
    }

    const notice = t('ui.unsupportedFile', { file: file.name })
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

  const onNodesChange = (changes: NodeChange<ContextFlowNode>[]) => {
    const requestedRemovedIds = changes
      .filter((change) => change.type === 'remove' && 'id' in change)
      .map((change) => change.id)
    const removedIds = requestedRemovedIds.filter((id) => id !== startNodeId && id !== endNodeId)
    setFlowNodes((nodes) => applyNodeChanges<ContextFlowNode>(changes.filter((change) => !('id' in change) || ![startNodeId, endNodeId].includes(change.id)), nodes))
    if (removedIds.length === 0) return
    updateWorkspace((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => !removedIds.includes(node.id)),
      edges: current.edges.filter((edge) => !removedIds.includes(edge.from) && !removedIds.includes(edge.to)),
    }))
    if (removedIds.includes(selectedNodeId)) {
      setSelectedNodeId(startNodeId)
      setActiveBlockId(null)
      setActiveTextNodeId(null)
      setActiveComplexChatId(null)
      setActiveImageId(null)
    }
  }
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
      nodes: current.nodes.map((node) => {
        if (node.id !== nodeId) return node
        const next = { ...node, ...patch }
        if (node.type === 'text_box' && (patch.body !== undefined || patch.shape !== undefined)) {
          const shape = (next.shape || 'rectangle') as TextBoxShape
          next.title = textBoxTitleFromBody(next.body || '', textBoxFallbackTitle(current, nodeId, shape))
        }
        return { ...next, updatedAt: new Date().toISOString() }
      }),
    }))
  }

  const onResizeTextBox = (nodeId: string, width: number, height: number) => {
    updateWorkspace((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nodeId ? { ...node, canvasWidth: Math.round(width), canvasHeight: Math.round(height), updatedAt: new Date().toISOString() } : node,
      ),
    }))
  }

  const onNodeDragStop = (_event: unknown, node: ContextFlowNode) => {
    if (node.id === startNodeId || node.id === endNodeId) return
    onUpdateNode(node.id, { canvasPosition: { x: Math.round(node.position.x), y: Math.round(node.position.y) } })
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
              turns: node.turns?.map((turn) => ({
                ...turn,
                blocks: turn.blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block)),
              })),
            }
          : node,
      ),
    }))
  }

  const onDeleteBlock = (nodeId: string, blockId: string) => {
    updateWorkspace((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              updatedAt: new Date().toISOString(),
              blocks: node.blocks.filter((block) => block.id !== blockId),
              turns: node.turns?.map((turn) => ({ ...turn, blocks: turn.blocks.filter((block) => block.id !== blockId) })),
            }
          : node,
      ),
    }))
    if (activeBlockId === blockId) setActiveBlockId(null)
  }

  const selectBlockFromInspector = (blockId: string) => {
    setActiveBlockId(blockId)
    if (isTextReviewNode(selectedNode)) {
      setActiveTextNodeId(selectedNode.id)
      setActiveImageId(null)
    }
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

  const resliceNode = (nodeId: string) => {
    let nextCount = 0
    const target = workspace.nodes.find((node) => node.id === nodeId)
    if (!target || !['chat', 'document', 'note'].includes(target.type) || typeof target.body !== 'string' || !target.body.trim()) {
      setSaveToast(t('ui.nothingToSlice'))
      return
    }

    updateWorkspace((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        if (node.id !== nodeId || !['chat', 'document', 'note'].includes(node.type) || typeof node.body !== 'string') return node
        const mode = node.type === 'chat' ? 'chat' : node.type === 'note' ? 'note' : 'document'
        const generatedBlocks = node.blocks.filter((block) => block.isGenerated)
        const slicedBlocks = sliceTextToBlocks(node.body, node.id, mode)
        nextCount = slicedBlocks.length
        return {
          ...node,
          updatedAt: new Date().toISOString(),
          blocks: [...slicedBlocks, ...generatedBlocks],
        }
      }),
    }))
    setActiveBlockId(null)
    setSaveToast(t('ui.resliced', { count: nextCount }))
  }

  resliceNodeRef.current = resliceNode

  const usedContextReviewNode = usedContextReview
    ? workspace.nodes.find((node) => node.id === usedContextReview.nodeId && node.type === 'complex_chat')
    : undefined
  const usedContextReviewCandidates = (usedContextReviewNode?.usedContextCandidates || []) as CodexUsedContextCandidate[]

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
        {saveToast && <div className={saveToast === t('ui.localSaveFailed') ? 'save-toast is-error' : 'save-toast'}>{saveToast}</div>}
        {isDraggingFile && (
          <div className="drop-overlay">
            <div>
              <FileText size={26} />
              <strong>{t('ui.dropFiles')}</strong>
              <span>{t('ui.localFilesImmediate')}</span>
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
              {t('ui.import')}
            </button>
            <button className="secondary-button" onClick={saveWorkspaceLocally}>
              <HardDrive size={16} />
              {t('ui.saveLocal')}
            </button>
            <button className="secondary-button" onClick={() => setShowNewCanvas(true)}>
              <Plus size={16} />
              {t('ui.newCanvasButton')}
            </button>
            <button
              className="icon-button"
              onClick={() => setShowSettings(true)}
              title={t('ui.settings')}
              aria-label={t('ui.settings')}
            >
              <Settings size={16} />
            </button>
            <button className="icon-button" onClick={undoWorkspace} disabled={historyPastRef.current.length === 0} aria-label={t('ui.undo')}>
              <Undo2 size={16} />
            </button>
            <button className="icon-button" onClick={redoWorkspace} disabled={historyFutureRef.current.length === 0} aria-label={t('ui.redo')}>
              <Redo2 size={16} />
            </button>
            <button className="secondary-button" onClick={() => downloadText('context-workspace.json', JSON.stringify(workspace, null, 2), 'application/json')}>
              <Download size={16} />
              {t('ui.exportWorkspace')}
            </button>
            <span className="save-status">{saveNotice}</span>
            <select className="toolbar-select" value={outputFormat} onChange={(event) => changeOutputFormat(event.target.value as OutputFormat)} aria-label={t('ui.bundleFormat')}>
              <option value="md">md</option>
              <option value="json">json</option>
            </select>
            <button className="primary-button" onClick={downloadBundle}>
              <Download size={16} />
              {t('ui.bundle')} .{outputFormat}
            </button>
          </div>
        </header>

        <main className="workbench">
          <aside className="source-rail">
            <div className="rail-header">
              <h2>{t('ui.sources')}</h2>
              <button className="icon-button" onClick={() => setShowImport(true)} aria-label={t('ui.addSource')}>
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
                      setActiveBlockId(null)
                      setActiveTextNodeId(isTextReviewNode(node) ? node.id : null)
                      setActiveComplexChatId(node.type === 'complex_chat' ? node.id : null)
                      setActiveImageId(node.type === 'image' ? node.id : null)
                    }}
                  >
                    <span className="node-icon">{nodeIcon(node.type)}</span>
                    <span>{node.title}</span>
                  </button>
                  <button className="source-delete" onClick={() => deleteSource(node.id)} aria-label={t('ui.deleteSource', { title: node.title })}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <CodexImportLauncher startNodeId={startNodeId} endNodeId={endNodeId} createId={createId} onImport={importCodexSession} />
            <div className="rail-callout">
              <Sparkles size={16} />
              <span>{t('ui.autoLater')}</span>
            </div>
            {importNotice && <div className="rail-warning">{importNotice}</div>}
          </aside>

          <section className="canvas-pane">
            {activeTextNode ? (
              <DocumentWorkspace
                node={activeTextNode}
                activeBlockId={activeBlockId || undefined}
                onActiveBlockChange={setActiveBlockId}
                onAddBlock={onAddBlock}
                onUpdateBlock={onUpdateBlock}
                onDeleteBlock={onDeleteBlock}
                onExit={() => setActiveTextNodeId(null)}
              />
            ) : activeComplexChat ? (
              <ComplexChatWorkspace
                node={activeComplexChat}
                onUpdateBlock={onUpdateBlock}
                onDeleteBlock={onDeleteBlock}
                onExit={() => setActiveComplexChatId(null)}
              />
            ) : activeImage ? (
              <ImageWorkspace node={activeImage} onAddRegion={onAddRegion} onExit={() => setActiveImageId(null)} />
            ) : (
              <div className="canvas-stage">
                <CanvasToolbar onAddTextBox={addTextBox} />
                <div className="canvas-flow">
                  <ReactFlow
                    nodes={flowNodes}
                    edges={flowEdges}
                    nodeTypes={nodeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeDragStop={onNodeDragStop}
                    deleteKeyCode={['Backspace', 'Delete']}
                    onNodeClick={(_, node) => {
                      setSelectedNodeId(node.id)
                      setSelectedEdgeId(null)
                      setActiveBlockId(null)
                      const contextNode = workspace.nodes.find((item) => item.id === node.id)
                      setActiveTextNodeId(isTextReviewNode(contextNode) ? contextNode.id : null)
                      setActiveImageId(contextNode?.type === 'image' ? contextNode.id : null)
                    }}
                    onEdgeClick={(event, edge) => {
                      event.stopPropagation()
                      setSelectedEdgeId(edge.id)
                      setActiveTextNodeId(null)
                      setActiveImageId(null)
                    }}
                    onPaneClick={() => setSelectedEdgeId(null)}
                    fitView
                  >
                    <Background gap={22} size={1} />
                    <Controls />
                  </ReactFlow>
                </div>
              </div>
            )}
          </section>

          <Inspector
            node={selectedEdge ? undefined : selectedNode}
            edge={selectedEdge}
            edgeFrom={selectedEdgeFrom}
            edgeTo={selectedEdgeTo}
            activeBlockId={activeBlockId || undefined}
            onUpdateNode={onUpdateNode}
            onUpdateEdge={onUpdateEdge}
            onDeleteEdge={onDeleteEdge}
            onUpdateBlock={onUpdateBlock}
            onAddRegion={onAddRegion}
            onUpdateRegion={onUpdateRegion}
            onDeleteRegion={onDeleteRegion}
            onAddBlock={onAddBlock}
            onDeleteBlock={onDeleteBlock}
            onSelectBlock={selectBlockFromInspector}
            onOpenTextWorkspace={(nodeId) => {
              setSelectedNodeId(nodeId)
              setActiveTextNodeId(nodeId)
              setActiveImageId(null)
            }}
            onOpenImageWorkspace={(nodeId) => {
              setSelectedNodeId(nodeId)
              setActiveTextNodeId(null)
              setActiveImageId(nodeId)
            }}
          />

          <BundlePreview
            generated={generatedOutput}
            draft={bundleDraft}
            isDirty={bundleDraftEdited}
            format={outputFormat}
            onDraftChange={(value) => {
              setBundleDraft(value)
              setBundleDraftEdited(value !== generatedOutput)
            }}
            onReset={() => {
              setBundleDraft(generatedOutput)
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
        {usedContextReview && usedContextReviewNode && (
          <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && setUsedContextReview(null)}>
            <div className="modal context-review-modal" role="dialog" aria-modal="true" aria-labelledby="context-review-title">
              <div className="modal-header">
                <div>
                  <h2 id="context-review-title">{t('complex.readContext')}</h2>
                  <p>{t('complex.readContextHint')}</p>
                </div>
                <button className="icon-button" onClick={() => setUsedContextReview(null)} aria-label={t('ui.closeDialog')}>x</button>
              </div>
              <div className="context-review-list">
                {usedContextReviewCandidates.map((candidate) => (
                  <label key={candidate.id} className="context-review-item">
                    <input
                      type="checkbox"
                      checked={usedContextReview.candidateIds.includes(candidate.id)}
                      disabled={!candidate.content}
                      onChange={(event) => setUsedContextReview((current) => current
                        ? { ...current, candidateIds: event.target.checked ? [...current.candidateIds, candidate.id] : current.candidateIds.filter((id) => id !== candidate.id) }
                        : current)}
                    />
                    <span>
                      <strong>{candidate.path}</strong>
                      <small>{candidate.content ? t('codex.contextReadFromRollout') : t('codex.contextPathOnly')}</small>
                    </span>
                  </label>
                ))}
              </div>
              <div className="modal-actions">
                <button className="secondary-button" onClick={() => setUsedContextReview(null)}>{t('ui.cancel')}</button>
                <button className="primary-button" onClick={confirmUsedContextReview}>{t('complex.addSelectedContext')}</button>
              </div>
            </div>
          </div>
        )}
        {showSettings && <SettingsModal locale={locale} onLocaleChange={setLocale} onClose={() => setShowSettings(false)} />}
        {showNewCanvas && <NewCanvasModal onClose={() => setShowNewCanvas(false)} onCreate={startNewCanvas} onDownloadAndCreate={downloadCurrentBundleAndStartNew} />}
      </div>
    </ReactFlowProvider>
  )
}
