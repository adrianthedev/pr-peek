export type Ci = 'PASS' | 'FAIL' | 'PENDING'

export type Pr = {
  state: 'OPEN' | 'CLOSED' | 'MERGED' | 'DRAFT' | 'ERROR'
  title: string
  author: string
  // Absent on statuses saved before re-checking existed.
  checkedAt?: number
  // Absent when the PR has no checks, and on statuses saved before CI existed.
  ci?: Ci
}

declare module 'claude-code' {
  interface PluginState {
    'pr-peek': { prs: Record<string, Pr> }
  }
}
