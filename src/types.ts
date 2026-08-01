export type NodeType = 'start' | 'document' | 'chat' | 'image' | 'note' | 'text_box' | 'bundle' | 'end'

export type BlockStatus = 'included' | 'excluded' | 'pinned' | 'needs_review'

export type BuiltInBlockTag = 'requirement' | 'decision' | 'assumption'

export type BlockTag =
  | 'requirement'
  | 'decision'
  | 'assumption'
  | (string & {})

export type TextBoxShape = 'rectangle' | 'rounded_rectangle' | 'diamond' | 'cylinder'

export interface ContextBlock {
  id: string
  nodeId: string
  type: 'text' | 'message' | 'image_region' | 'note'
  role?: 'user' | 'assistant' | 'system' | 'tool' | 'unknown'
  speakerName?: string
  text?: string
  status: BlockStatus
  tags: BlockTag[]
  reason?: string
  isGenerated?: boolean
  sourceOrder?: number
}

export interface ImageRegion {
  id: string
  nodeId: string
  kind?: 'bbox' | 'text'
  box: [number, number, number, number]
  label: string
  note: string
  color?: string
  fontFamily?: string
  status: BlockStatus
  tags: BlockTag[]
}

export interface ContextNode {
  [key: string]: unknown
  id: string
  type: NodeType
  title: string
  body?: string
  sourceName?: string
  sourcePath?: string
  imageUrl?: string
  imageName?: string
  imageMime?: string
  imageSize?: number
  shape?: TextBoxShape
  shapeMeaning?: string
  blocks: ContextBlock[]
  regions: ImageRegion[]
  createdAt: string
  updatedAt: string
}

export interface ContextEdge {
  id: string
  from: string
  to: string
  label: string
}

export interface Workspace {
  id: string
  title: string
  nodes: ContextNode[]
  edges: ContextEdge[]
  activeBundleId?: string
  updatedAt: string
}
