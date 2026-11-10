import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, TextProps } from 'claude-code'

import type { Ci, Pr } from '../types'

const prs = atom({ plugin: 'pr-peek', key: 'prs' } as const, {})
const PR_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g

// How the link itself shows the merge state.
const LOOK: Record<Pr['state'], TextProps> = {
  OPEN: { color: 'success', underline: true },
  DRAFT: { color: 'inactive', underline: true, italic: true },
  MERGED: { color: 'merged', underline: true },
  CLOSED: { color: 'inactive', strikethrough: true },
  ERROR: { underline: true },
}
const CI_MARK: Record<Ci, { mark: string; color: string }> = {
  PASS: { mark: '✓', color: 'success' },
  FAIL: { mark: '✗', color: 'error' },
  PENDING: { mark: '◐', color: 'warning' },
}
// CI only matters while the PR can still change.
const showsCi = (pr: Pr) => (pr.state === 'OPEN' || pr.state === 'DRAFT') && pr.ci

// A status is re-checked when its link is drawn and the last check is older than this.
// Without a floor, a check's own redraw would start the next check, forever.
const RECHECK_MS = 30_000

// ponytail: in-flight set lives in module memory; a reload just refetches.
const inFlight = new Set<string>()

type Check = { status?: string; conclusion?: string; state?: string }
const FAILED = ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE']

// statusCheckRollup mixes check runs (status, conclusion) and commit statuses (state).
export function ciOf(checks: Check[] | undefined): Ci | undefined {
  if (!checks?.length) return undefined
  if (checks.some(c => FAILED.includes(c.conclusion ?? c.state ?? ''))) return 'FAIL'
  if (checks.some(c => (c.status && c.status !== 'COMPLETED') || c.state === 'PENDING' || c.state === 'EXPECTED')) return 'PENDING'
  return 'PASS'
}

async function fetchPr($: EngineInterface, url: string) {
  inFlight.add(url)
  let pr: Pr = { state: 'ERROR', title: '', author: '', checkedAt: await $.clock.now() }
  try {
    // gh uses the person's own auth, so private repos work too.
    const { exitCode, stdout, stderr } = await $.process.run(
      ['gh', 'pr', 'view', url, '--json', 'state,isDraft,title,author,statusCheckRollup'],
      { timeoutMs: 15000 },
    )
    if (exitCode === 0) {
      const json = JSON.parse(stdout)
      pr = {
        ...pr,
        state: json.isDraft && json.state === 'OPEN' ? 'DRAFT' : json.state,
        title: json.title,
        author: json.author?.login ?? '',
        ci: ciOf(json.statusCheckRollup),
      }
    } else {
      pr.title = stderr.trim().split('\n')[0] ?? 'gh failed'
    }
  } catch (error) {
    pr.title = `gh not runnable: ${error}`
  }
  inFlight.delete(url)
  await update($, prs, all => ({ ...all, [url]: pr }))
}

// A markdown link, an autolink or a bare URL.
const PR_LINK = new RegExp(`\\[([^\\]\\n]*)\\]\\((${PR_URL.source})\\)|<(${PR_URL.source})>|(${PR_URL.source})`, 'g')

// The URL of a PR_LINK match, whichever of its three forms matched.
const urlOf = (m: RegExpMatchArray) => (m[2] ?? m[3] ?? m[4])!

// Reads every PR link in the text and starts a check for each stale one.
async function known($: EngineInterface, text: string) {
  const all = await read($, prs)
  const now = await $.clock.now()
  for (const m of text.matchAll(PR_LINK)) {
    const url = urlOf(m)
    const pr = all[url]
    if ((!pr || now - (pr.checkedAt ?? 0) > RECHECK_MS) && !inFlight.has(url)) void fetchPr($, url)
  }
  return all
}

// Plain text form, for places drawn as text: the person's own messages, tables.
function suffix(pr: Pr | undefined) {
  if (!pr) return ''
  const state = pr.state === 'MERGED' ? ' (merged)' : pr.state === 'CLOSED' ? ' (closed)' : pr.state === 'DRAFT' ? ' (draft)' : ''
  const ci = showsCi(pr) ? ` ${CI_MARK[pr.ci!].mark}` : ''
  return state + ci
}

function withSuffix(text: string, all: Record<string, Pr>) {
  return text.replace(PR_LINK, (match, _label, a, b, c) => match + suffix(all[a ?? b ?? c]))
}

const LIST = /^(\s*)([-*+]|\d+[.)])\s+/
// Inline pieces a rebuilt line keeps: PR links, other links, bold, code.
const INLINE = new RegExp(`${PR_LINK.source}|\\[([^\\]\\n]*)\\]\\((https?:[^)\\s]+)\\)|\\*\\*([^*\\n]+)\\*\\*|\`([^\`\\n]+)\``, 'g')

export const register: Register = on => {
  // Coming back to an idle session redraws nothing, so a new prompt re-checks every stale status.
  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    for (const [url, pr] of Object.entries(await read($, prs))) {
      if (now - (pr.checkedAt ?? 0) > RECHECK_MS && !inFlight.has(url)) void fetchPr($, url)
    }
    return next(e)
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!e.props.text.includes('github.com/')) return next(e)
    return next({ ...e, props: { ...e.props, text: withSuffix(e.props.text, await known($, e.props.text)) } })
  })

  // Markdown can't hold color, so each line with a checked PR link is redrawn as Text;
  // every other line stays Markdown.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const text = e.props.text
    if (!text.includes('github.com/')) return next(e)
    const all = await known($, text)
    const hasStatus = (line: string) => [...line.matchAll(PR_LINK)].some(m => all[urlOf(m)])

    // ponytail: line-based split; a PR link inside a multi-line paragraph splits that paragraph.
    const blocks: ({ md: string[] } | { line: string })[] = []
    let inFence = false
    for (const line of text.split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
      const isTable = line.trimStart().startsWith('|')
      if (!inFence && !isTable && hasStatus(line)) {
        blocks.push({ line })
        continue
      }
      const md = isTable && !inFence ? withSuffix(line, all) : line
      const last = blocks.at(-1)
      if (last && 'md' in last) last.md.push(md)
      else blocks.push({ md: [md] })
    }
    if (!blocks.some(b => 'line' in b)) {
      return next({ ...e, props: { ...e.props, text: blocks.map(b => ('md' in b ? b.md.join('\n') : '')).join('\n') } })
    }

    const { Box, Text, Link, Markdown } = $.ui.resolve(e)

    const prLink = (url: string, label: string) => {
      const pr = all[url]
      const ci = pr && showsCi(pr) ? CI_MARK[pr.ci!] : undefined
      return (
        <Text>
          <Link href={url}><Text {...(pr ? LOOK[pr.state] : { underline: true })}>{label}</Text></Link>
          {pr?.state === 'MERGED' ? <Text color="merged"> (merged)</Text> : null}
          {ci ? <Text> <Link href={`${url}/checks`}><Text color={ci.color}>{ci.mark}</Text></Link></Text> : null}
        </Text>
      )
    }

    const rebuild = (line: string) => {
      const list = line.match(LIST)
      const body = list ? line.slice(list[0].length) : line
      const parts = []
      let at = 0
      for (const m of body.matchAll(INLINE)) {
        parts.push(body.slice(at, m.index))
        const url = m[2] ?? m[3] ?? m[4]
        if (url) parts.push(prLink(url, m[1] ?? url))
        else if (m[6]) parts.push(<Link href={m[6]}><Text underline>{m[5]}</Text></Link>)
        else if (m[7]) parts.push(<Text bold>{m[7]}</Text>)
        else parts.push(<Text color="permission">{m[8]}</Text>)
        at = m.index + m[0].length
      }
      parts.push(body.slice(at))
      const bullet = list ? `${list[1]}${/\d/.test(list[2]!) ? list[2] : '-'} ` : ''
      return <Text>{bullet}{parts}</Text>
    }

    return (
      <Box flexDirection="column">
        {blocks.map(b => {
          if ('line' in b) return rebuild(b.line)
          const md = b.md.join('\n')
          return md.trim() ? <Markdown text={md.trim()} /> : <Text> </Text>
        })}
      </Box>
    )
  })
}
