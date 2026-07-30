import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Bot, Check, Copy, FileJson, LoaderCircle, Upload, X } from 'lucide-react'
import { createCodexExportRequest } from './exportPrompt'
import { parseCodexRolloutJsonl } from './parseCodexRollout'
import { buildCodexCanvasPatch } from './toCanvas'
import type { CodexExportRequest, CodexImportPayload, CodexSessionImport } from './types'
import './codex-import.css'

type CopyState = 'copying' | 'copied' | 'failed'

type ImportChoices = {
  includeCommentary: boolean
  includeAgentMessages: boolean
  includeToolCalls: boolean
  includeToolOutputs: boolean
  connectStartAndEnd: boolean
}

type ParsedFile = {
  file: File
  session: CodexSessionImport
}

type CodexImportLauncherProps = {
  startNodeId: string
  endNodeId: string
  createId: (prefix: string) => string
  onImport: (payload: CodexImportPayload) => void
}

function readableBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function readableDate(value?: string) {
  if (!value) return '未知'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

async function writeClipboard(prompt: string) {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
  await navigator.clipboard.writeText(prompt)
}

function CodexImportModal({
  request,
  initialCopyState,
  onCopyStateChange,
  startNodeId,
  endNodeId,
  createId,
  onClose,
  onImport,
}: {
  request: CodexExportRequest
  initialCopyState: CopyState
  onCopyStateChange: (state: CopyState) => void
  onClose: () => void
  onImport: (payload: CodexImportPayload) => void
} & Omit<CodexImportLauncherProps, 'onImport'>) {
  const [isDragging, setIsDragging] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null)
  const [error, setError] = useState('')
  const [choices, setChoices] = useState<ImportChoices>({
    includeCommentary: true,
    includeAgentMessages: true,
    includeToolCalls: true,
    includeToolOutputs: true,
    connectStartAndEnd: true,
  })
  const modalRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const parseRequestRef = useRef(0)

  useEffect(() => {
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !modalRef.current) return

      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0)
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !modalRef.current.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !modalRef.current.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const copyPrompt = async () => {
    onCopyStateChange('copying')
    try {
      await writeClipboard(request.prompt)
      onCopyStateChange('copied')
    } catch {
      onCopyStateChange('failed')
    }
  }

  const parseFile = async (file: File) => {
    const requestId = ++parseRequestRef.current
    setParsedFile(null)
    setError('')
    if (!/\.jsonl$/i.test(file.name)) {
      setError('请选择 Codex 导出的 .jsonl 文件。普通文档仍请使用原有 Import。')
      setIsParsing(false)
      return
    }
    setIsParsing(true)
    try {
      const text = await file.text()
      if (requestId !== parseRequestRef.current) return
      const result = parseCodexRolloutJsonl(text, {
        sourceFileName: file.name,
        cutoffMarker: request.marker,
        markerMode: 'optional',
      })
      if (requestId !== parseRequestRef.current) return
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      const markerSuffix = request.marker.replace('CONTEXT_CANVAS_EXPORT_', '').toLowerCase()
      const isCurrentPrefixExport = file.name.toLowerCase().includes(markerSuffix)
      if (result.data.boundary.kind === 'eof' && !isCurrentPrefixExport) {
        setError('此文件既不包含本次唯一标记，文件名也不属于本次导出。请重新复制指令，并拖入这次生成的文件。')
        return
      }
      setParsedFile({ file, session: result.data })
    } catch (parseError) {
      if (requestId !== parseRequestRef.current) return
      const detail = parseError instanceof Error ? parseError.message : ''
      setError(detail ? `浏览器无法读取这个文件：${detail}` : '浏览器无法读取这个文件，请重新选择。')
    } finally {
      if (requestId === parseRequestRef.current) setIsParsing(false)
    }
  }

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) void parseFile(file)
    event.target.value = ''
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) void parseFile(file)
  }

  const confirmImport = () => {
    if (!parsedFile) return
    const patch = buildCodexCanvasPatch(parsedFile.session, {
      startNodeId,
      endNodeId,
      createId,
      sourceFileName: parsedFile.file.name,
      connectStartAndEnd: choices.connectStartAndEnd,
      policy: {
        assistant_commentary: choices.includeCommentary ? 'needs_review' : 'omit',
        agent_message: choices.includeAgentMessages ? 'needs_review' : 'omit',
        tool_call: choices.includeToolCalls ? 'needs_review' : 'omit',
        tool_output: choices.includeToolOutputs ? 'needs_review' : 'omit',
      },
    })
    onImport({ patch, session: parsedFile.session, sourceFileName: parsedFile.file.name })
  }

  const copyMessage =
    initialCopyState === 'copied'
      ? '导出指令已复制。现在切换到要导入的 Codex 任务，粘贴并发送。'
      : initialCopyState === 'copying'
        ? '正在复制导出指令…'
        : '浏览器没有自动复制，请点击右侧按钮复制。'

  return (
    <div
      className="codex-import-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onDragEnter={(event) => event.stopPropagation()}
      onDragOver={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setIsDragging(false)
      }}
      role="presentation"
    >
      <div ref={modalRef} className="modal codex-import-modal" role="dialog" aria-modal="true" aria-labelledby="codex-import-title">
        <div className="modal-header codex-import-header">
          <div>
            <div className="eyebrow">Local Codex rollout</div>
            <h2 id="codex-import-title">导入 Codex 会话</h2>
            <p>无需 Hook 或后台服务。Codex 导出本地文件后，由浏览器在本机解析。</p>
          </div>
          <button ref={closeButtonRef} className="icon-button" onClick={onClose} aria-label="关闭 Codex 导入">
            <X size={16} />
          </button>
        </div>

        <div className={`codex-copy-status is-${initialCopyState}`} role="status" aria-live="polite">
          <span className="codex-copy-icon">
            {initialCopyState === 'copied' ? <Check size={17} /> : initialCopyState === 'copying' ? <LoaderCircle className="codex-spin" size={17} /> : <AlertCircle size={17} />}
          </span>
          <span>{copyMessage}</span>
          <button className="secondary-button" onClick={() => void copyPrompt()}>
            <Copy size={15} />
            {initialCopyState === 'copied' ? '重新复制' : '复制指令'}
          </button>
        </div>

        <ol className="codex-import-steps">
          <li>
            <strong>在目标 Codex 任务中发送指令</strong>
            <span>Codex 会根据唯一标记定位当前 rollout，并原样导出指令之前的记录。</span>
          </li>
          <li>
            <strong>允许必要的本地文件权限</strong>
            <span>如出现提示，请允许读取 <code>~/.codex/sessions</code> 和写入 <code>~/Downloads/Context Canvas Imports/</code>。</span>
          </li>
          <li>
            <strong>把生成的 .jsonl 文件拖到下方</strong>
            <span>原会话文件不会被修改，内容不会上传。</span>
          </li>
        </ol>

        <details className="codex-prompt-details">
          <summary>查看导出指令与唯一标记</summary>
          <pre>{request.prompt}</pre>
        </details>

        <div
          className={`codex-dropzone ${isDragging ? 'is-dragging' : ''}`}
          onDragEnter={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setIsDragging(true)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onDragLeave={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false)
          }}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              fileInputRef.current?.click()
            }
          }}
          role="button"
          tabIndex={0}
          aria-busy={isParsing}
        >
          {isParsing ? <LoaderCircle className="codex-spin" size={24} /> : <Upload size={24} />}
          <strong>{isParsing ? '正在解析会话…' : '拖入 Codex 会话文件'}</strong>
          <span>或点击选择 .jsonl 文件</span>
          <input ref={fileInputRef} type="file" accept=".jsonl,application/x-ndjson" onChange={onFileInput} />
        </div>

        {error && (
          <div className="codex-import-error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {parsedFile && (
          <section className="codex-import-preview" aria-label="Codex 导入预览">
            <div className="codex-preview-heading">
              <div>
                <span className="codex-file-icon"><FileJson size={17} /></span>
                <strong>{parsedFile.file.name}</strong>
              </div>
              <span>{readableBytes(parsedFile.file.size)}</span>
            </div>
            <dl className="codex-preview-grid">
              <div><dt>工作目录</dt><dd title={parsedFile.session.session.cwd}>{parsedFile.session.session.cwd || '未知'}</dd></div>
              <div><dt>时间范围</dt><dd>{readableDate(parsedFile.session.stats.firstTimestamp)} → {readableDate(parsedFile.session.stats.lastTimestamp)}</dd></div>
              <div><dt>用户 Turn</dt><dd>{parsedFile.session.stats.importedTurnCount}</dd></div>
              <div><dt>Assistant 消息</dt><dd>{parsedFile.session.stats.assistantMessageCount}</dd></div>
              <div><dt>子 Agent 消息</dt><dd>{parsedFile.session.stats.agentMessageCount}</dd></div>
              <div><dt>工具调用</dt><dd>{parsedFile.session.stats.toolCallCount}</dd></div>
              <div><dt>将创建节点</dt><dd>{parsedFile.session.turns.length}</dd></div>
              <div>
                <dt>导入边界</dt>
                <dd>{parsedFile.session.boundary.kind === 'marker' ? '已按本次 marker 截断' : '已验证本次前缀导出文件'}</dd>
              </div>
            </dl>

            <div className="codex-import-options">
              <label><input type="checkbox" checked={choices.includeCommentary} onChange={(event) => setChoices((current) => ({ ...current, includeCommentary: event.target.checked }))} />Assistant commentary</label>
              <label><input type="checkbox" checked={choices.includeAgentMessages} onChange={(event) => setChoices((current) => ({ ...current, includeAgentMessages: event.target.checked }))} />子 Agent 消息</label>
              <label><input type="checkbox" checked={choices.includeToolCalls} onChange={(event) => setChoices((current) => ({ ...current, includeToolCalls: event.target.checked }))} />工具调用</label>
              <label><input type="checkbox" checked={choices.includeToolOutputs} onChange={(event) => setChoices((current) => ({ ...current, includeToolOutputs: event.target.checked }))} />工具输出</label>
              <label><input type="checkbox" checked={choices.connectStartAndEnd} onChange={(event) => setChoices((current) => ({ ...current, connectStartAndEnd: event.target.checked }))} />连接 Start / End</label>
            </div>

            {parsedFile.session.diagnostics.length > 0 && (
              <div className="codex-import-diagnostics">
                {parsedFile.session.diagnostics.map((diagnostic, index) => <span key={`${diagnostic.code}-${index}`}>{diagnostic.message}</span>)}
              </div>
            )}
          </section>
        )}

        <div className="codex-import-boundary-note">
          {parsedFile
            ? '已验证导入边界：导出指令和 Codex 的导出回复不会进入 Canvas。工具及子 Agent 记录会标记为 needs review，不会自动进入 Bundle。'
            : '选择文件后会核对本次唯一标记或导出文件名，确认导出指令位于导入范围之外。'}
        </div>

        <div className="modal-actions codex-import-actions">
          <button className="secondary-button" onClick={onClose}>取消</button>
          <button className="primary-button" disabled={!parsedFile || isParsing} onClick={confirmImport}>
            <Bot size={16} />
            {parsedFile ? `导入为 ${parsedFile.session.turns.length} 个 Turn Nodes` : '等待会话文件'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function CodexImportLauncher({ startNodeId, endNodeId, createId, onImport }: CodexImportLauncherProps) {
  const [request, setRequest] = useState<CodexExportRequest | null>(null)
  const [copyState, setCopyState] = useState<CopyState>('copying')
  const launcherButtonRef = useRef<HTMLButtonElement | null>(null)
  const restoreLauncherFocus = useCallback(() => {
    window.requestAnimationFrame(() => launcherButtonRef.current?.focus())
  }, [])
  const closeImport = useCallback(() => {
    setRequest(null)
    restoreLauncherFocus()
  }, [restoreLauncherFocus])

  const openImport = () => {
    const nextRequest = createCodexExportRequest()
    setRequest(nextRequest)
    setCopyState('copying')
    void writeClipboard(nextRequest.prompt).then(
      () => setCopyState('copied'),
      () => setCopyState('failed'),
    )
  }

  return (
    <>
      <button ref={launcherButtonRef} className="secondary-button wide codex-import-launcher" onClick={openImport}>
        <Bot size={16} />
        导入 Codex 会话
      </button>
      {request && (
        <CodexImportModal
          key={request.marker}
          request={request}
          initialCopyState={copyState}
          onCopyStateChange={setCopyState}
          startNodeId={startNodeId}
          endNodeId={endNodeId}
          createId={createId}
          onClose={closeImport}
          onImport={(payload) => {
            onImport(payload)
            setRequest(null)
            restoreLauncherFocus()
          }}
        />
      )}
    </>
  )
}
