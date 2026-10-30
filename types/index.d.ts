export type Pr = {
  state: 'OPEN' | 'CLOSED' | 'MERGED' | 'DRAFT' | 'ERROR'
  title: string
  author: string
  // Absent on statuses saved before re-checking existed.
  checkedAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    'pr-peek': { prs: Record<string, Pr> }
  }
}
