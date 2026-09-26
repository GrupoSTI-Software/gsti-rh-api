import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1786566437097 — entregable 13 / CA-22.
 * Scope vacío en jobs de reporte: fail-closed (niega, no permite).
 */

const REPORT_JOB_SERVICE = join(process.cwd(), 'app/services/report_job_service.ts')
const REPORT_JOBS_CONTROLLER = join(process.cwd(), 'app/controllers/report_jobs_controller.ts')

test.group('Report jobs — gate fail-closed con scope vacío (USRH1786566437097)', () => {
  test('report_job_service niega empleado fuera de scope sin excepción por lista vacía', ({
    assert,
  }) => {
    const content = readFileSync(REPORT_JOB_SERVICE, 'utf-8')
    assert.notInclude(content, 'allowedIds.length > 0 && !allowedIds.includes')
    assert.include(content, '!allowedIds.includes(employee.businessUnitId)')
  })

  test('report_jobs_controller exige scope no vacío para empleado en reporte', ({
    assert,
  }) => {
    const content = readFileSync(REPORT_JOBS_CONTROLLER, 'utf-8')
    assert.include(content, 'allowedBusinessUnitIds.length > 0')
    assert.notInclude(
      content,
      'allowedBusinessUnitIds.length === 0 ||\n            allowedBusinessUnitIds.includes'
    )
  })

  test('recoverStuckJobs declara deuda conocida sin TenantContext.run', ({ assert }) => {
    const content = readFileSync(REPORT_JOB_SERVICE, 'utf-8')
    assert.include(content, 'Deuda conocida (USRH1786566437097')
    assert.include(content, 'recoverStuckJobs')
  })
})
