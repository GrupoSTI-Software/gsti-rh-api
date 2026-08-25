import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1786566437097 — entregable 11 / CA-20.
 * El CTE `punches_for_shift` debe correlacionar assists por (empresa, código).
 */
const REPO_FILE = join(
  process.cwd(),
  'app/modules/attendance-stats/attendance-stats.repository.mysql.ts'
)

test.group('Attendance-stats — join assists por tenant (USRH1786566437097)', () => {
  test('emp_day proyecta business_unit_id desde employees', ({ assert }) => {
    const content = readFileSync(REPO_FILE, 'utf-8')
    assert.include(content, 'e.business_unit_id, bu.business_unit_slug')
  })

  test('shift_for_day propaga business_unit_id', ({ assert }) => {
    const content = readFileSync(REPO_FILE, 'utf-8')
    assert.include(content, 'ed.business_unit_id, ed.business_unit_slug')
  })

  test('sfd_full propaga business_unit_id', ({ assert }) => {
    const content = readFileSync(REPO_FILE, 'utf-8')
    assert.include(content, 'sfd.business_unit_id, sfd.business_unit_slug')
  })

  test('punches_for_shift une assists por empresa y código', ({ assert }) => {
    const content = readFileSync(REPO_FILE, 'utf-8')
    assert.include(content, 'INNER JOIN assists a ON a.assist_emp_code = sfd.employee_code')
    assert.include(content, 'AND a.business_unit_id = sfd.business_unit_id')
    assert.include(content, 'AND a.assist_active = 1')
  })
})
