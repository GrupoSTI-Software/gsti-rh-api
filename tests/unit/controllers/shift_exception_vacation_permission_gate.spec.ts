import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

test.group('shift_exceptions_controller — secundario manage-vacation', () => {
  test('usa ensureSecondaryPermission y EMPLOYEES_MANAGE_VACATION_PERMISSION', async ({
    assert,
  }) => {
    const content = await readFile(
      join(process.cwd(), 'app/controllers/shift_exceptions_controller.ts'),
      'utf8'
    )
    assert.include(content, "from '#helpers/permission_gate_secondary'")
    assert.include(content, 'EMPLOYEES_MANAGE_VACATION_PERMISSION')
    assert.include(content, 'shiftExceptionTouchesVacation')
    assert.include(content, 'ensureSecondaryPermission')
    const calls = content.match(/ensureSecondaryPermission\(/g) ?? []
    assert.isAtLeast(calls.length, 4)
  })
})
