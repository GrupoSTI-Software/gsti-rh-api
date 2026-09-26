import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

test.group('ensureEmployeeTabRead', () => {
  test('exime si es propio y si no llama ensureSecondaryPermission', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'app/helpers/ensure_employee_tab_read.ts'),
      'utf8'
    )
    assert.include(content, 'sessionUserOwnsEmployee')
    assert.include(content, 'ensureSecondaryPermission')
    const ownIdx = content.indexOf('sessionUserOwnsEmployee')
    const gateIdx = content.indexOf('ensureSecondaryPermission')
    assert.isAbove(gateIdx, ownIdx)
  })
})
