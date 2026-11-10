import { expect, test } from 'claude-code/testing'

import { ciOf } from './register'

test('CI rolls checks and statuses up to one result', async () => {
  expect(ciOf([])).toBe(undefined)
  expect(ciOf([{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { state: 'SUCCESS' }, { status: 'COMPLETED', conclusion: 'SKIPPED' }])).toBe('PASS')
  expect(ciOf([{ status: 'IN_PROGRESS' }, { status: 'COMPLETED', conclusion: 'SUCCESS' }])).toBe('PENDING')
  expect(ciOf([{ state: 'PENDING' }])).toBe('PENDING')
  expect(ciOf([{ status: 'IN_PROGRESS' }, { status: 'COMPLETED', conclusion: 'FAILURE' }])).toBe('FAIL')
  expect(ciOf([{ state: 'ERROR' }])).toBe('FAIL')
})
