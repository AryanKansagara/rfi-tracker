import { importFile, newProject, openTab, panel, soon, test } from '../fixtures.ts'

// Issue #15
test.fail('"Rev 1" counts as a resubmittal', async ({ page }) => {
  await newProject(page)
  await importFile(page, 'sub.csv', 'Spec Section,#,Rev.,Title,Status,Ball In Court,Submittal Manager,Issue Date\n08 44 13,08-1,Rev 0,Curtain wall,Revise and Resubmit,Apex Glass,Pat,2026-07-20\n08 44 13,08-1,Rev 1,Curtain wall,Open,Ray Architects,Pat,2026-09-21\n')
  await openTab(page, 'Schedule')
  await soon(panel(page, 'Resubmittal loops')).toContainText('08-1 Curtain wall')
})
