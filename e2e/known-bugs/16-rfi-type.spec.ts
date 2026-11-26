import { choose, newProject, pending, soon, test } from '../fixtures.ts'

// Issue #16
test.fail('a substitution request in an RFI log is an RFI', async ({ page }) => {
  await newProject(page)
  await choose(page, { name: 'log.csv', body: 'ID,Title,Type,Status,Ball in court,Created on\n1,A,Substitution request,Open,Ray Architects,2026-10-01\n' })
  await soon(pending(page, 'log.csv')).toContainText('1 RFIs, 0 submittals')
})
