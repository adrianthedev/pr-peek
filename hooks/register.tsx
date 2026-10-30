import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Pr } from '../types'

const prs = atom({ plugin: 'pr-peek', key: 'prs' } as const, {})
const PR_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g
const STYLE = {
  OPEN: '🔄',
  DRAFT: '📝',
  MERGED: '✅',
  CLOSED: '❌',
  ERROR: '❔',
} as const

// A status is re-checked when its link is drawn and the last check is older than this.
// Without a floor, a check's own redraw would start the next check, forever.
const RECHECK_MS = 30_000

// ponytail: in-flight set lives in module memory; a reload just refetches.
const inFlight = new Set<string>()

async function fetchPr($: EngineInterface, url: string) {
  inFlight.add(url)
  let pr: Pr = { state: 'ERROR', title: '', author: '', checkedAt: await $.clock.now() }
  try {
    // gh uses the person's own auth, so private repos work too.
    const { exitCode, stdout, stderr } = await $.process.run(
      ['gh', 'pr', 'view', url, '--json', 'state,isDraft,title,author'],
      { timeoutMs: 15000 },
    )
    if (exitCode === 0) {
      const json = JSON.parse(stdout)
      pr = { ...pr, state: json.isDraft && json.state === 'OPEN' ? 'DRAFT' : json.state, title: json.title, author: json.author?.login ?? '' }
    } else {
      pr.title = stderr.trim().split('\n')[0] ?? 'gh failed'
    }
  } catch (error) {
    pr.title = `gh not runnable: ${error}`
  }
  inFlight.delete(url)
  await update($, prs, all => ({ ...all, [url]: pr }))
}

// A markdown link, an autolink or a bare URL, so the status lands after the whole link.
const PR_LINK = new RegExp(`\\[[^\\]\\n]*\\]\\((${PR_URL.source})\\)|<(${PR_URL.source})>|(${PR_URL.source})`, 'g')

// ponytail: also rewrites links inside code spans; skip those if it ever matters.
async function withStatus($: EngineInterface, text: string) {
  if (!text.includes('github.com/')) return text
  const known = await read($, prs)
  const now = await $.clock.now()
  return text.replace(PR_LINK, (match, a, b, c) => {
    const url: string = a ?? b ?? c
    const pr = known[url]
    const isStale = !pr || now - (pr.checkedAt ?? 0) > RECHECK_MS
    if (isStale && !inFlight.has(url)) void fetchPr($, url)
    return pr ? `${match} ${STYLE[pr.state]}` : match
  })
}

export const register: Register = on => {
  // Coming back to an idle session redraws nothing, so a new prompt re-checks every stale status.
  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    for (const [url, pr] of Object.entries(await read($, prs))) {
      if (now - (pr.checkedAt ?? 0) > RECHECK_MS && !inFlight.has(url)) void fetchPr($, url)
    }
    return next(e)
  })
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) =>
    next({ ...e, props: { ...e.props, text: await withStatus($, e.props.text) } }))
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) =>
    next({ ...e, props: { ...e.props, text: await withStatus($, e.props.text) } }))
}
