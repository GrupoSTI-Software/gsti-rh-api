import { test } from '@japa/runner'
import BadgeNssAuditService from '#modules/employee-badge/badge_nss_audit.service'
import type PiiAccessLogService from '#services/pii_access_log_service'
import type { BadgeEmployeeContext } from '#modules/employee-badge/dto/badge.dto'

const ACCESSOR = {
  userId: 7,
  ip: '127.0.0.1',
  userAgent: 'japa',
  requestId: 'req-1',
  originModule: 'employees',
}

function contextWithoutNss(): BadgeEmployeeContext {
  return {
    employeeId: 1,
    businessUnitId: 2,
    employeeSlug: 'slug',
    employeeBadgeToken: null,
    personFirstname: 'Sin',
    personLastname: 'Nss',
    personSecondLastname: 'Registrado',
    employeePhoto: null,
    businessUnitLegalName: 'Empresa SA',
    businessUnitName: 'Empresa',
    employeeActive: true,
    businessUnitActive: true,
    positionName: null,
    departmentName: null,
    payrollCode: null,
    personId: 3,
    nss: null,
    repseFolio: null,
    repseExpiresAt: null,
  }
}

test.group('BadgeNssAuditService', () => {
  test('sin NSS impreso no escribe en la bitácora', async ({ assert }) => {
    let calls = 0
    const fakeLog = {
      async record() {
        calls += 1
      },
    } as unknown as PiiAccessLogService

    await new BadgeNssAuditService(fakeLog).recordNssDisclosures([contextWithoutNss()], ACCESSOR)

    assert.equal(calls, 0)
  })
})
