import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

test.group('employee_routes — PermissionGate lectura Trabajo/Bancos/Zonas', () => {
  test('consultas de ficha anidada declaran permissionGate de lectura', async ({ assert }) => {
    const content = await readFile(join(process.cwd(), 'start/routes/employee_routes.ts'), 'utf8')
    assert.include(content, 'EMPLOYEES_READ_PERMISSION_DECLARATIONS')
    for (const key of [
      'getSalaryHistory',
      'getEmployeeContracts',
      'getBranchOfficeHistory',
      'indexTemporaryAssignments',
      'showActiveTemporaryAssignment',
      'getYearsWorked',
      'getVacationsUsed',
      'getVacationsCorresponding',
      'getVacationsByPeriod',
      'getVacationDeductions',
      'getVacations',
      'getAllVacationsByPeriod',
      'getEmployeeBanks',
      'getEmployeeZones',
      'getUserResponsible',
      'getEmployeeProceedingFiles',
      'getDaysWorkDisability',
      'getDaysWorkDisabilityAll',
      'getBiometricsList',
    ]) {
      assert.include(
        content,
        `permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.${key})`,
        key
      )
    }
    const showLine = content
      .split('\n')
      .find((line) => line.includes('employee_controller.show'))
    assert.exists(showLine)
    assert.notInclude(showLine!, 'permissionGate')
  })
})

test.group('contratos/turnos/vacaciones/bonos/excepciones — PermissionGate lectura Trabajo', () => {
  test('GET de contratos no declara gate en download', async ({ assert }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/employee_contract_routes.ts'),
      'utf8'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.showEmployeeContract)'
    )
    const downloadLine = content
      .split('\n')
      .find((line) => line.includes('employee_contract_controller.download'))
    assert.exists(downloadLine)
    assert.notInclude(downloadLine!, 'READ_PERMISSION')
  })

  test('GET de turnos, cambios, excepciones y evidencias declaran tab-trabajo-read', async ({
    assert,
  }) => {
    const files = [
      'start/routes/employee_shifts_routes.ts',
      'start/routes/employee_shift_change_routes.ts',
      'start/routes/shift_exceptions_routes.ts',
      'start/routes/shift_exception_evidence_routes.ts',
      'start/routes/employee_vacation_archive_routes.ts',
      'start/routes/employee_bonus_routes.ts',
    ]
    for (const file of files) {
      const content = await readFile(join(process.cwd(), file), 'utf8')
      assert.include(content, 'EMPLOYEES_READ_PERMISSION_DECLARATIONS', file)
      assert.include(content, 'permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS', file)
    }
  })

  test('exception-requests: index y all con gate; my-requests y unread sin gate', async ({
    assert,
  }) => {
    const content = await readFile(
      join(process.cwd(), 'start/routes/exception_request_routes.ts'),
      'utf8'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexExceptionRequests)'
    )
    assert.include(
      content,
      'permissionGate(EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexAllExceptionRequests)'
    )
    const my = content.split('\n').find((l) => l.includes('getMyExceptionRequests'))
    const unread = content.split('\n').find((l) => l.includes('getUnreadExceptionRequests'))
    assert.notInclude(my!, 'permissionGate')
    assert.notInclude(unread!, 'permissionGate')
    const show = content.split('\n').find((l) => l.includes('exception_requests_controller.show'))
    assert.notInclude(show!, 'permissionGate')
  })
})
