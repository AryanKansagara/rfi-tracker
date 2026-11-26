import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isClosedStatus } from './parse.ts'

test('denied, partial and future statuses stay open', () => {
  for (const s of ['Not approved', 'NOT APPROVED', 'Not accepted', 'Not yet answered', 'Not been reviewed', 'Not fully approved', 'Non-approved', 'Partially approved', 'To be reviewed', 'Yet to be answered', 'Ready to be closed', 'Reviewed - not approved', 'Answered - Not accepted', 'Pending closed', 'Not closed', 'Not complete'])
    assert.equal(isClosedStatus(s), false, s)
})

test('finished statuses still close', () => {
  for (const s of ['Closed', 'Closed - not approved', 'Void - not reviewed', 'Approved', 'Approved as noted', 'No exceptions taken', 'No Exception Taken', 'Reviewed', 'Answered', 'Responded', 'Distributed', 'For record', 'Complete', 'Yes', 'Approved - not for construction'])
    assert.equal(isClosedStatus(s), true, s)
})
