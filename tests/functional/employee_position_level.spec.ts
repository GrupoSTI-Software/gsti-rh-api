import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import db from '@adonisjs/lucid/services/db'
import i18nManager from '@adonisjs/i18n/services/main'
import Person from '#models/person'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import Position from '#models/position'
import PositionLevel from '#models/position_level'
import PositionPositionLevel from '#models/position_position_level'
import EmployeePositionLevelService from '#services/employee_position_level_service'
import EmployeeService from '#services/employee_service'
import { EmployeePositionLevelError } from '#exceptions/employee_position_level_error'
import { EMPLOYEE_POSITION_LEVEL_ERROR_CODES } from '#constants/employee_position_level_error_codes'

/**
 * Tests funcionales — nivel del puesto asignado al empleado
 * (USRH1785964117188). Cubren la fuente única de pertenencia
 * (`EmployeePositionLevelService.assertAssignable`, reglas 3, 6 y 7) y la
 * semántica de update del campo (propiedad ausente = conservar; `null`
 * explícito = limpiar).
 *
 * Convenciones (siguiendo `position_position_level.spec.ts`): fixtures con
 * timestamp único, sin transacciones, cleanup explícito en `group.teardown`.
 * El cleanup de empleados es físico y corre ANTES de borrar la puente: la FK
 * RESTRICT de `position_level_config_id` bloquea el delete físico de la fila.
 */

function uniqueStamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

async function createTestBusinessUnit(prefix: string): Promise<BusinessUnit> {
  const stamp = uniqueStamp()
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `EmployeePositionLevel ${prefix} ${stamp}`
  businessUnit.businessUnitSlug = `employee-position-level-${prefix}-${stamp}`
  businessUnit.businessUnitLegalName = `EmployeePositionLevel ${prefix} Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

async function deleteBusinessUnit(businessUnit: BusinessUnit | null) {
  if (!businessUnit) return
  await db.from('employees').where('business_unit_id', businessUnit.businessUnitId).delete()
  await db
    .from('position_position_levels')
    .where('business_unit_id', businessUnit.businessUnitId)
    .delete()
  await db.from('positions').where('business_unit_id', businessUnit.businessUnitId).delete()
  await db.from('position_levels').where('business_unit_id', businessUnit.businessUnitId).delete()
  await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
}

async function createTestPosition(businessUnitId: number, prefix: string): Promise<Position> {
  const stamp = uniqueStamp()
  const position = new Position()
  position.positionSyncId = 0
  position.positionCode = `ELVL-${prefix}-${stamp}`.slice(0, 50)
  position.positionName = `Puesto ${prefix} ${stamp}`.slice(0, 100)
  position.positionActive = 1
  position.businessUnitId = businessUnitId
  await position.save()
  return position
}

async function createConfigRow(
  businessUnit: BusinessUnit,
  position: Position,
  name: string,
  options: { rank?: number; isDefault?: boolean; active?: boolean } = {}
): Promise<PositionPositionLevel> {
  const level = new PositionLevel()
  level.businessUnitId = businessUnit.businessUnitId
  level.positionLevelName = `${name} ${uniqueStamp()}`
  level.positionLevelRank = options.rank ?? 1
  level.positionLevelActive = true
  await level.save()

  const row = new PositionPositionLevel()
  row.positionId = position.positionId
  row.businessUnitId = businessUnit.businessUnitId
  row.positionLevelId = level.positionLevelId
  row.positionPositionLevelAdHocName = null
  row.positionPositionLevelRank = options.rank ?? 1
  row.positionPositionLevelIsDefault = options.isDefault ?? false
  row.positionPositionLevelActive = options.active ?? true
  await row.save()
  return row
}

async function createTestEmployee(
  businessUnit: BusinessUnit,
  positionId: number,
  positionLevelConfigId: number | null
): Promise<Employee> {
  const stamp = uniqueStamp()

  const person = new Person()
  person.personFirstname = 'Nivel'
  person.personLastname = 'Empleado'
  person.personSecondLastname = 'Test'
  person.personEmail = `elvl-empleado-${stamp}@gsti-tests.local`
  await person.save()

  const employee = new Employee()
  employee.employeeSyncId = Date.now()
  employee.employeeCode = `ELVL-${stamp}`
  employee.employeeFirstName = person.personFirstname
  employee.employeeLastName = person.personLastname
  employee.employeeSecondLastName = person.personSecondLastname
  employee.employeePayrollNum = `ELVL-${stamp}`
  employee.companyId = 1
  employee.personId = person.personId
  employee.businessUnitId = businessUnit.businessUnitId
  employee.payrollBusinessUnitId = businessUnit.businessUnitId
  employee.positionId = positionId
  employee.positionLevelConfigId = positionLevelConfigId
  employee.dailySalary = 0
  employee.employeeAssistDiscriminator = 0
  employee.employeeIgnoreConsecutiveAbsences = 0
  employee.employeeAuthorizeAnyZones = 0
  employee.employeeTypeOfContract = 'Internal'
  employee.employeeBusinessEmail = `elvl-empleado-${stamp}@gsti-tests.local`
  await employee.save()
  return employee
}

async function purgeEmployee(employee: Employee | null) {
  if (!employee) return
  await db.from('employees').where('employee_id', employee.employeeId).delete()
  await db.from('people').where('person_id', employee.personId).delete()
}

function assertServiceError(assert: Assert, error: unknown, key: string, errorCode: string) {
  assert.instanceOf(error, EmployeePositionLevelError)
  const serviceError = error as EmployeePositionLevelError
  assert.equal(serviceError.key, key)
  assert.equal(serviceError.errorCode, errorCode)
  assert.equal(serviceError.httpStatus, 422)
}

test.group('EmployeePositionLevel - pertenencia (reglas 3, 6 y 7)', (group) => {
  let businessUnit: BusinessUnit | null = null
  let otherBusinessUnit: BusinessUnit | null = null
  let position: Position | null = null
  let otherPosition: Position | null = null
  let foreignPosition: Position | null = null
  let activeRow: PositionPositionLevel | null = null
  let inactiveRow: PositionPositionLevel | null = null
  let deletedRow: PositionPositionLevel | null = null
  let otherPositionRow: PositionPositionLevel | null = null
  let foreignRow: PositionPositionLevel | null = null

  const service = new EmployeePositionLevelService()

  group.setup(async () => {
    businessUnit = await createTestBusinessUnit('scope')
    otherBusinessUnit = await createTestBusinessUnit('foreign')
    position = await createTestPosition(businessUnit.businessUnitId, 'main')
    otherPosition = await createTestPosition(businessUnit.businessUnitId, 'other')
    foreignPosition = await createTestPosition(otherBusinessUnit.businessUnitId, 'ajeno')

    activeRow = await createConfigRow(businessUnit, position, 'Activo', { rank: 1 })
    inactiveRow = await createConfigRow(businessUnit, position, 'Inactivo', {
      rank: 2,
      active: false,
    })
    deletedRow = await createConfigRow(businessUnit, position, 'Eliminado', { rank: 3 })
    await deletedRow.delete()
    otherPositionRow = await createConfigRow(businessUnit, otherPosition, 'Otro Puesto', {
      rank: 1,
    })
    foreignRow = await createConfigRow(otherBusinessUnit, foreignPosition, 'Ajeno', { rank: 1 })
  })

  group.teardown(async () => {
    await deleteBusinessUnit(businessUnit)
    await deleteBusinessUnit(otherBusinessUnit)
  })

  test('regla 1: null es valor válido y no consulta nada', async ({ assert }) => {
    await service.assertAssignable({
      positionLevelConfigId: null,
      effectivePositionId: position!.positionId,
      businessUnitScope: [businessUnit!.businessUnitId],
      previousPositionLevelConfigId: null,
    })
    assert.isTrue(true)
  })

  test('un nivel activo del puesto efectivo pasa sin error', async ({ assert }) => {
    await service.assertAssignable({
      positionLevelConfigId: activeRow!.positionPositionLevelId,
      effectivePositionId: position!.positionId,
      businessUnitScope: [businessUnit!.businessUnitId],
      previousPositionLevelConfigId: null,
    })
    assert.isTrue(true)
  })

  test('regla 3: un nivel de otro puesto responde 422 nivel-no-pertenece-al-puesto', async ({
    assert,
  }) => {
    try {
      await service.assertAssignable({
        positionLevelConfigId: otherPositionRow!.positionPositionLevelId,
        effectivePositionId: position!.positionId,
        businessUnitScope: [businessUnit!.businessUnitId],
        previousPositionLevelConfigId: null,
      })
      assert.fail('debió rechazar un nivel de otro puesto')
    } catch (error) {
      assertServiceError(
        assert,
        error,
        'nivel-no-pertenece-al-puesto',
        EMPLOYEE_POSITION_LEVEL_ERROR_CODES.NOT_IN_POSITION
      )
    }
  })

  test('regla 7: un nivel de otro tenant es indistinguible de inexistente', async ({ assert }) => {
    try {
      await service.assertAssignable({
        positionLevelConfigId: foreignRow!.positionPositionLevelId,
        effectivePositionId: position!.positionId,
        businessUnitScope: [businessUnit!.businessUnitId],
        previousPositionLevelConfigId: null,
      })
      assert.fail('debió rechazar un nivel de otro tenant')
    } catch (error) {
      assertServiceError(
        assert,
        error,
        'nivel-no-pertenece-al-puesto',
        EMPLOYEE_POSITION_LEVEL_ERROR_CODES.NOT_IN_POSITION
      )
    }
  })

  test('un nivel soft-deleted responde el mismo 422 indistinguible', async ({ assert }) => {
    try {
      await service.assertAssignable({
        positionLevelConfigId: deletedRow!.positionPositionLevelId,
        effectivePositionId: position!.positionId,
        businessUnitScope: [businessUnit!.businessUnitId],
        previousPositionLevelConfigId: null,
      })
      assert.fail('debió rechazar un nivel soft-deleted')
    } catch (error) {
      assertServiceError(
        assert,
        error,
        'nivel-no-pertenece-al-puesto',
        EMPLOYEE_POSITION_LEVEL_ERROR_CODES.NOT_IN_POSITION
      )
    }
  })

  test('regla 6: un nivel inactivo en asignación nueva responde 422 nivel-inactivo-no-asignable', async ({
    assert,
  }) => {
    try {
      await service.assertAssignable({
        positionLevelConfigId: inactiveRow!.positionPositionLevelId,
        effectivePositionId: position!.positionId,
        businessUnitScope: [businessUnit!.businessUnitId],
        previousPositionLevelConfigId: null,
      })
      assert.fail('debió rechazar un nivel inactivo nuevo')
    } catch (error) {
      assertServiceError(
        assert,
        error,
        'nivel-inactivo-no-asignable',
        EMPLOYEE_POSITION_LEVEL_ERROR_CODES.INACTIVE_NOT_ASSIGNABLE
      )
    }
  })

  test('exención de conservación: re-enviar el nivel inactivo ya persistido con el mismo puesto es no-op', async ({
    assert,
  }) => {
    await service.assertAssignable({
      positionLevelConfigId: inactiveRow!.positionPositionLevelId,
      effectivePositionId: position!.positionId,
      businessUnitScope: [businessUnit!.businessUnitId],
      previousPositionLevelConfigId: inactiveRow!.positionPositionLevelId,
      currentPositionId: position!.positionId,
    })
    assert.isTrue(true)
  })

  test('la exención NO aplica al cambiar de puesto: el nivel anterior se rechaza', async ({
    assert,
  }) => {
    try {
      await service.assertAssignable({
        positionLevelConfigId: inactiveRow!.positionPositionLevelId,
        effectivePositionId: otherPosition!.positionId,
        businessUnitScope: [businessUnit!.businessUnitId],
        previousPositionLevelConfigId: inactiveRow!.positionPositionLevelId,
        currentPositionId: position!.positionId,
      })
      assert.fail('debió rechazar el nivel del puesto anterior')
    } catch (error) {
      assertServiceError(
        assert,
        error,
        'nivel-no-pertenece-al-puesto',
        EMPLOYEE_POSITION_LEVEL_ERROR_CODES.NOT_IN_POSITION
      )
    }
  })

  test('regla 7: scope vacío falla cerrado con 422', async ({ assert }) => {
    try {
      await service.assertAssignable({
        positionLevelConfigId: activeRow!.positionPositionLevelId,
        effectivePositionId: position!.positionId,
        businessUnitScope: [],
        previousPositionLevelConfigId: null,
      })
      assert.fail('debió fallar cerrado con scope vacío')
    } catch (error) {
      assertServiceError(
        assert,
        error,
        'nivel-no-pertenece-al-puesto',
        EMPLOYEE_POSITION_LEVEL_ERROR_CODES.NOT_IN_POSITION
      )
    }
  })

  test('check defensivo: un id no entero positivo responde ELVL.VAL.001', async ({ assert }) => {
    try {
      await service.assertAssignable({
        positionLevelConfigId: 0,
        effectivePositionId: position!.positionId,
        businessUnitScope: [businessUnit!.businessUnitId],
        previousPositionLevelConfigId: null,
      })
      assert.fail('debió rechazar un id no entero positivo')
    } catch (error) {
      assert.instanceOf(error, EmployeePositionLevelError)
      const serviceError = error as EmployeePositionLevelError
      assert.equal(serviceError.errorCode, EMPLOYEE_POSITION_LEVEL_ERROR_CODES.VAL_INPUT)
    }
  })
})

test.group('EmployeePositionLevel - semántica de update (ausente conserva, null limpia)', (group) => {
  let businessUnit: BusinessUnit | null = null
  let position: Position | null = null
  let configRow: PositionPositionLevel | null = null
  let employee: Employee | null = null

  function employeeService(): EmployeeService {
    return new EmployeeService(i18nManager.locale(i18nManager.defaultLocale))
  }

  /** Payload equivalente al literal `as Employee` que arma el controller. */
  function buildUpdatePayload(source: Employee, extra: Partial<Employee> = {}): Employee {
    return {
      employeeFirstName: source.employeeFirstName,
      employeeLastName: source.employeeLastName,
      employeeSecondLastName: source.employeeSecondLastName,
      employeeCode: source.employeeCode,
      employeePayrollNum: source.employeePayrollNum,
      employeePayrollCode: source.employeePayrollCode ?? null,
      employeeHireDate: null,
      employeeTerminatedDate: null,
      companyId: source.companyId,
      departmentId: source.departmentId,
      positionId: source.positionId,
      businessUnitId: source.businessUnitId,
      dailySalary: source.dailySalary || 0,
      payrollBusinessUnitId: source.payrollBusinessUnitId,
      employeeAssistDiscriminator: source.employeeAssistDiscriminator,
      employeeTypeOfContract: source.employeeTypeOfContract,
      employeeTypeId: source.employeeTypeId,
      employeeBusinessEmail: source.employeeBusinessEmail,
      employeeIgnoreConsecutiveAbsences: source.employeeIgnoreConsecutiveAbsences,
      employeeAuthorizeAnyZones: source.employeeAuthorizeAnyZones,
      ...extra,
    } as Employee
  }

  async function persistedLevelId(): Promise<number | null> {
    const row = await db
      .from('employees')
      .where('employee_id', employee!.employeeId)
      .first()
    return row.position_level_config_id
  }

  group.setup(async () => {
    businessUnit = await createTestBusinessUnit('update')
    position = await createTestPosition(businessUnit.businessUnitId, 'update')
    configRow = await createConfigRow(businessUnit, position, 'Persistido', { rank: 1 })
    employee = await createTestEmployee(
      businessUnit,
      position.positionId,
      configRow.positionPositionLevelId
    )
  })

  group.teardown(async () => {
    await purgeEmployee(employee)
    await deleteBusinessUnit(businessUnit)
  })

  test('propiedad ausente = el nivel actual se conserva', async ({ assert }) => {
    const payload = buildUpdatePayload(employee!)
    assert.isFalse('positionLevelConfigId' in payload)

    await employeeService().update(employee!, payload)

    assert.equal(await persistedLevelId(), configRow!.positionPositionLevelId)
  })

  test('null explícito = el nivel se limpia y es idempotente', async ({ assert }) => {
    const payload = buildUpdatePayload(employee!, { positionLevelConfigId: null })

    await employeeService().update(employee!, payload)
    assert.isNull(await persistedLevelId())

    // Repetir el mismo PUT con null no tiene efecto adicional (idempotencia).
    await employeeService().update(employee!, buildUpdatePayload(employee!, {
      positionLevelConfigId: null,
    }))
    assert.isNull(await persistedLevelId())
  })

  test('un valor nuevo se persiste cuando la propiedad viaja', async ({ assert }) => {
    const payload = buildUpdatePayload(employee!, {
      positionLevelConfigId: configRow!.positionPositionLevelId,
    })

    await employeeService().update(employee!, payload)

    assert.equal(await persistedLevelId(), configRow!.positionPositionLevelId)
  })
})
