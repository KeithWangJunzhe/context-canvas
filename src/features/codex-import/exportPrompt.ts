import type { CodexExportRequest } from './types'

function randomMarkerPart() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase()
}

export function createCodexExportRequest(): CodexExportRequest {
  const marker = `CONTEXT_CANVAS_EXPORT_${randomMarkerPart()}`
  const markerSuffix = marker.replace('CONTEXT_CANVAS_EXPORT_', '').toLowerCase()
  const prompt = `这是一次 Context Canvas 本地会话导出请求。唯一导出标记：${marker}

请在本机执行以下操作，并严格遵守：

1. 由当前主 Agent 直接执行，不要创建、委派或转交给子 Agent；否则唯一标记会被复制到其他 rollout，无法可靠定位原会话。
2. 在 ~/.codex/sessions 下的 rollout-*.jsonl 文件中，以固定字符串搜索上面的唯一导出标记。按“匹配到的文件”计数；同一文件内 event_msg 与 response_item 同时命中属于正常情况。
3. 必须只找到一个 rollout 文件。若找到 0 个或多个文件，请停止并说明，不要猜测。
4. 在该文件中找到第一次包含此标记的完整 JSONL 行，将该行之前的所有完整行原样导出。不要包含这条导出指令，也不要包含你对本请求的回复。
5. 不要总结、重写、重新生成、重排或删减这些 JSONL 记录；每一行必须仍是可独立解析的 JSON 对象。
6. 优先从 session_meta.payload.session_id 读取 session id；缺失时再使用 session_meta.payload.id。将结果保存到：~/Downloads/Context Canvas Imports/codex-session-<session-id>-${markerSuffix}.jsonl。目录不存在时可以创建；不要覆盖任何已有文件。
7. 不要修改或删除 ~/.codex/sessions 中的原文件，不要把内容发送到任何网络服务。
8. 完成后仅告知我导出文件的绝对路径、导出行数和文件大小。如系统询问权限，请请求读取会话目录和写入 Downloads 所需的最小权限。`

  return { marker, prompt, createdAt: new Date().toISOString() }
}
