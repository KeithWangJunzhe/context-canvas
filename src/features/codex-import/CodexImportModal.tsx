import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Bot, Check, Copy, FileJson, LoaderCircle, Upload, X } from 'lucide-react'
import { createCodexExportRequest } from './exportPrompt'
import { parseCodexRolloutJsonl } from './parseCodexRollout'
import { buildCodexCanvasPatch } from './toCanvas'
import { extractUsedContextCandidates } from './usedContext'
import type { CodexExportRequest, CodexImportDiagnostic, CodexImportPayload, CodexSessionImport, CodexUsedContextCandidate } from './types'
import { useI18n } from '../../i18n'
import './codex-import.css'

type CopyState = 'copying' | 'copied' | 'failed'

type ImportChoices = {
  splitTurns: boolean
  includeCommentary: boolean
  includeAgentMessages: boolean
  includeToolCalls: boolean
  includeToolOutputs: boolean
  connectStartAndEnd: boolean
}

type ParsedFile = {
  file: File
  session: CodexSessionImport
  candidates: CodexUsedContextCandidate[]
  isLegacy: boolean
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

function diagnosticText(diagnostic: CodexImportDiagnostic, locale: 'en' | 'zh-CN', translate: (key: any, values?: Record<string, string | number>) => string) {
  if (locale === 'zh-CN') return diagnostic.message
  const supportedCodes = new Set([
    'TRAILING_PARTIAL_LINE',
    'INVALID_JSON_LINE',
    'CORRUPT_JSONL',
    'EMPTY_FILE',
    'AMBIGUOUS_MARKER',
    'MARKER_NOT_FOUND',
    'SESSION_ID_MISSING',
    'MULTIPLE_SESSIONS',
    'NO_USER_TURNS',
  ])
  if (!supportedCodes.has(diagnostic.code)) return diagnostic.message
  return translate(`diagnostic.${diagnostic.code}`, { line: diagnostic.sourceLine || '' })
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
  const { locale, t } = useI18n()
  const [isDragging, setIsDragging] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null)
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([])
  const [error, setError] = useState('')
  const [choices, setChoices] = useState<ImportChoices>({
    splitTurns: true,
    includeCommentary: true,
    includeAgentMessages: true,
    includeToolCalls: true,
    includeToolOutputs: true,
    connectStartAndEnd: false,
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
      setError(t('ui.invalidCodexFile'))
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
        setError(diagnosticText(result.error, locale, t))
        return
      }
      const markerSuffix = request.marker.replace('CONTEXT_CANVAS_EXPORT_', '').toLowerCase()
      const isCurrentPrefixExport = file.name.toLowerCase().includes(markerSuffix)
      const isLegacy = result.data.boundary.kind === 'eof' && !isCurrentPrefixExport
      const candidates = extractUsedContextCandidates(result.data)
      setParsedFile({ file, session: result.data, candidates, isLegacy })
      setSelectedCandidateIds(candidates.map((candidate) => candidate.id))
      if (isLegacy) setError(t('codex.legacySessionWarning'))
    } catch (parseError) {
      if (requestId !== parseRequestRef.current) return
      const detail = parseError instanceof Error ? parseError.message : ''
      setError(detail ? t('ui.fileReadErrorDetail', { detail }) : t('ui.fileReadError'))
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
        assistant_commentary: choices.includeCommentary ? 'included' : 'omit',
        agent_message: choices.includeAgentMessages ? 'included' : 'omit',
        tool_call: choices.includeToolCalls ? 'included' : 'omit',
        tool_output: choices.includeToolOutputs ? 'included' : 'omit',
      },
    })
    onImport({
      patch,
      session: parsedFile.session,
      sourceFileName: parsedFile.file.name,
      splitTurns: choices.splitTurns,
      connectStartAndEnd: choices.connectStartAndEnd,
      usedContextCandidates: parsedFile.candidates,
      selectedUsedContextIds: selectedCandidateIds,
    })
  }

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
            <div className="eyebrow">{t('codex.eyebrow')}</div>
            <h2 id="codex-import-title">{t('codex.title')}</h2>
            <p>{t('codex.description')}</p>
          </div>
          <button ref={closeButtonRef} className="icon-button" onClick={onClose} aria-label={t('codex.close')}>
            <X size={16} />
          </button>
        </div>

        <div className={`codex-copy-status is-${initialCopyState}`} role="status" aria-live="polite">
          <span className="codex-copy-icon">
            {initialCopyState === 'copied' ? <Check size={17} /> : initialCopyState === 'copying' ? <LoaderCircle className="codex-spin" size={17} /> : <AlertCircle size={17} />}
          </span>
          <span>{initialCopyState === 'copied' ? t('codex.copyCopied') : initialCopyState === 'copying' ? t('codex.copyCopying') : t('codex.copyFailed')}</span>
          <button className="secondary-button" onClick={() => void copyPrompt()}>
            <Copy size={15} />
            {initialCopyState === 'copied' ? t('codex.copyAgain') : t('codex.copyInstruction')}
          </button>
        </div>

        <ol className="codex-import-steps">
          <li>
            <strong>{t('codex.stepOneTitle')}</strong>
            <span>{t('codex.stepOneBody')}</span>
          </li>
          <li>
            <strong>{t('codex.stepTwoTitle')}</strong>
            <span>{t('codex.stepTwoBody')}</span>
          </li>
          <li>
            <strong>{t('codex.stepThreeTitle')}</strong>
            <span>{t('codex.stepThreeBody')}</span>
          </li>
        </ol>

        <details className="codex-prompt-details">
          <summary>{t('codex.promptDetails')}</summary>
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
          <strong>{isParsing ? t('codex.dropParsing') : t('codex.dropIdle')}</strong>
          <span>{t('codex.dropHint')}</span>
          <input ref={fileInputRef} type="file" accept=".jsonl,application/x-ndjson" onChange={onFileInput} />
        </div>

        {error && (
          <div className="codex-import-error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {parsedFile && (
          <section className="codex-import-preview" aria-label={t('codex.previewLabel')}>
            <div className="codex-preview-heading">
              <div>
                <span className="codex-file-icon"><FileJson size={17} /></span>
                <strong>{parsedFile.file.name}</strong>
              </div>
              <span>{readableBytes(parsedFile.file.size)}</span>
            </div>
            <dl className="codex-preview-grid">
              <div><dt>{t('codex.workingDirectory')}</dt><dd title={parsedFile.session.session.cwd}>{parsedFile.session.session.cwd || (locale === 'zh-CN' ? '未知' : 'Unknown')}</dd></div>
              <div><dt>{t('codex.timeRange')}</dt><dd>{readableDate(parsedFile.session.stats.firstTimestamp)} → {readableDate(parsedFile.session.stats.lastTimestamp)}</dd></div>
              <div><dt>{t('codex.userTurns')}</dt><dd>{parsedFile.session.stats.importedTurnCount}</dd></div>
              <div><dt>{t('codex.assistantMessages')}</dt><dd>{parsedFile.session.stats.assistantMessageCount}</dd></div>
              <div><dt>{t('codex.agentMessages')}</dt><dd>{parsedFile.session.stats.agentMessageCount}</dd></div>
              <div><dt>{t('codex.toolCalls')}</dt><dd>{parsedFile.session.stats.toolCallCount}</dd></div>
              <div><dt>{t('codex.willCreate')}</dt><dd>1 Complex Chat</dd></div>
              <div>
                <dt>{t('codex.importBoundary')}</dt>
                <dd>{parsedFile.isLegacy ? t('codex.legacyBoundary') : parsedFile.session.boundary.kind === 'marker' ? t('codex.markerBoundary') : t('codex.prefixBoundary')}</dd>
              </div>
            </dl>

            <div className="codex-import-options">
              <label><input type="checkbox" checked={choices.splitTurns} onChange={(event) => setChoices((current) => ({ ...current, splitTurns: event.target.checked }))} />{t('codex.splitTurns')}</label>
              <label><input type="checkbox" checked={choices.includeCommentary} onChange={(event) => setChoices((current) => ({ ...current, includeCommentary: event.target.checked }))} />{t('codex.includeCommentary')}</label>
              <label><input type="checkbox" checked={choices.includeAgentMessages} onChange={(event) => setChoices((current) => ({ ...current, includeAgentMessages: event.target.checked }))} />{t('codex.includeAgentMessages')}</label>
              <label><input type="checkbox" checked={choices.includeToolCalls} onChange={(event) => setChoices((current) => ({ ...current, includeToolCalls: event.target.checked }))} />{t('codex.includeToolCalls')}</label>
              <label><input type="checkbox" checked={choices.includeToolOutputs} onChange={(event) => setChoices((current) => ({ ...current, includeToolOutputs: event.target.checked }))} />{t('codex.includeToolOutputs')}</label>
              <label><input type="checkbox" checked={choices.connectStartAndEnd} onChange={(event) => setChoices((current) => ({ ...current, connectStartAndEnd: event.target.checked }))} />{t('codex.connectStartEnd')}</label>
            </div>

            {parsedFile.candidates.length > 0 && (
              <section className="codex-used-context" aria-label={t('codex.usedContextTitle')}>
                <div className="codex-used-context-heading">
                  <div>
                    <strong>{t('codex.usedContextTitle')}</strong>
                    <span>{t('codex.usedContextDescription')}</span>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setSelectedCandidateIds((current) => current.length === parsedFile.candidates.length ? [] : parsedFile.candidates.map((candidate) => candidate.id))}
                  >
                    {selectedCandidateIds.length === parsedFile.candidates.length ? t('codex.clearUsedContext') : t('codex.selectAllUsedContext')}
                  </button>
                </div>
                <div className="codex-used-context-list">
                  {parsedFile.candidates.map((candidate) => (
                    <label key={candidate.id} className="codex-used-context-item">
                      <input
                        type="checkbox"
                        checked={selectedCandidateIds.includes(candidate.id)}
                        onChange={(event) => setSelectedCandidateIds((current) => event.target.checked ? [...current, candidate.id] : current.filter((id) => id !== candidate.id))}
                      />
                      <span className="codex-used-context-copy">
                        <strong title={candidate.path}>{candidate.path}</strong>
                        <span>{candidate.confidence === 'observed' ? t('codex.contextReadFromRollout') : t('codex.contextPathOnly')}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            )}

            {parsedFile.session.diagnostics.length > 0 && (
              <div className="codex-import-diagnostics">
                {parsedFile.session.diagnostics.map((diagnostic, index) => <span key={`${diagnostic.code}-${index}`}>{diagnosticText(diagnostic, locale, t)}</span>)}
              </div>
            )}
          </section>
        )}

        <div className="codex-import-boundary-note">
          {parsedFile
            ? parsedFile.isLegacy ? t('codex.legacyBoundaryNote') : t('codex.boundaryVerified')
            : t('codex.boundaryWaiting')}
        </div>

        <div className="modal-actions codex-import-actions">
          <button className="secondary-button" onClick={onClose}>{t('codex.cancel')}</button>
          <button className="primary-button" disabled={!parsedFile || isParsing} onClick={confirmImport}>
            <Bot size={16} />
            {parsedFile ? parsedFile.isLegacy ? t('codex.importLegacy') : t('codex.importComplex') : t('codex.waitingForFile')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function CodexImportLauncher({ startNodeId, endNodeId, createId, onImport }: CodexImportLauncherProps) {
  const { locale, t } = useI18n()
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
    const nextRequest = createCodexExportRequest(locale)
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
        {t('ui.codexLauncher')}
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
