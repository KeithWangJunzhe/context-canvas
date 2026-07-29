import { Workspace } from './types'

const now = new Date().toISOString()

export const sampleWorkspace: Workspace = {
  id: 'workspace_context_canvas_poc',
  title: 'Context Canvas PoC',
  updatedAt: now,
  nodes: [
    {
      id: 'node_start',
      type: 'start',
      title: 'Start',
      createdAt: now,
      updatedAt: now,
      regions: [],
      blocks: [],
    },
    {
      id: 'node_chat_idea',
      type: 'chat',
      title: 'Messy project chat',
      body: 'User: I want an interactive context canvas for Codex.\n\nAssistant: We should make a local PoC first.\n\nUser: It should support chat transcripts, documents, images, highlighter, ignore reasons, and bundle export.',
      createdAt: now,
      updatedAt: now,
      regions: [],
      blocks: [
        {
          id: 'block_chat_1',
          nodeId: 'node_chat_idea',
          type: 'message',
          role: 'user',
          text: 'I want an interactive context canvas for Codex.',
          status: 'pinned',
          tags: ['requirement'],
          reason: 'Core product intent.',
        },
        {
          id: 'block_chat_2',
          nodeId: 'node_chat_idea',
          type: 'message',
          role: 'assistant',
          text: 'We should make a local PoC first.',
          status: 'included',
          tags: ['decision'],
          reason: 'Keeps scope small.',
        },
        {
          id: 'block_chat_3',
          nodeId: 'node_chat_idea',
          type: 'message',
          role: 'user',
          text: 'It should support chat transcripts, documents, images, highlighter, ignore reasons, and bundle export.',
          status: 'pinned',
          tags: ['requirement'],
          reason: 'Defines first-wave inputs and outputs.',
        },
      ],
    },
    {
      id: 'node_end',
      type: 'end',
      title: 'End',
      createdAt: now,
      updatedAt: now,
      regions: [],
      blocks: [],
    },
  ],
  edges: [],
  activeBundleId: 'node_end',
}
