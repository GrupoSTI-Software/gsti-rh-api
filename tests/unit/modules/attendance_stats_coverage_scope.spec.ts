import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import type { I18n } from '@adonisjs/i18n'
import { buildCoverageResponse } from '../../../app/modules/attendance-stats/attendance-stats.coverage.js'
import type { BuildCoverageInput } from '../../../app/modules/attendance-stats/attendance-stats.coverage.js'
import { getAttendanceCoverageValidator } from '../../../app/modules/attendance-stats/validators/get-attendance-coverage.validator.js'
import AttendanceStatsRepositoryMysql from '../../../app/modules/attendance-stats/attendance-stats.repository.mysql.js'
import type { AssistDayInterface } from '../../../app/interfaces/assist_day_interface.js'
import type {
  CoverageResponse,
  CoverageShift,
  EmployeeCalendarBundle,
} from '../../../app/modules/attendance-stats/dto/attendance-stats.dto.js'

/**
 * Cobertura REPSE: el drawer fallaba porque `companyId` lo intercepta el
 * middleware de alcance. Se valida el contrato `empresaContratanteId`, el
 * permiso `shift-coverage`, el recorte de candidatos por alcance de usuario y
 * el corte por empresa de las consultas que no pasan por el mixin de tenant.
 */
const CONTROLLER_FILE = join(
  process.cwd(),
  'app/modules/attendance-stats/attendance-stats.controller.ts'
)
const REPO_FILE = join(
  process.cwd(),
  'app/modules/attendance-stats/attendance-stats.repository.mysql.ts'
)

const DAY = '2026-06-15'
const SITE_ID = 10
const OTHER_SITE_ID = 20
const SHIFT_ID = 1

/** Día mínimo evaluable por la cobertura; solo se llenan los campos que lee. */
function buildDay(params: { checkInStatus: string; isRestDay: boolean }): AssistDayInterface {
  return {
    day: DAY,
    assist: {
      checkIn: null,
      checkOut: null,
      checkEatIn: null,
      checkEatOut: null,
      // La cobertura solo lee `shiftId` del turno; el resto de ShiftInterface no aplica.
      dateShift: { shiftId: SHIFT_ID } as unknown as AssistDayInterface['assist']['dateShift'],
      dateShiftApplySince: null,
      employeeShiftId: null,
      shiftCalculateFlag: '',
      checkInDateTime: null,
      checkOutDateTime: null,
      checkInStatus: params.checkInStatus,
      checkOutStatus: '',
      isFutureDay: false,
      isSundayBonus: false,
      isRestDay: params.isRestDay,
      isVacationDate: false,
      isWorkDisabilityDate: false,
      isHoliday: false,
      isBirthday: false,
      holiday: null,
      hasExceptions: false,
      exceptions: [],
    },
  }
}

function buildBundle(params: {
  employeeId: number
  firstName: string
  homeBranchId: number
  day: AssistDayInterface
}): EmployeeCalendarBundle {
  return {
    employee: {
      employeeId: params.employeeId,
      employeeCode: null,
      employeePayrollCode: null,
      employeeFirstName: params.firstName,
      employeeLastName: 'Prueba',
      employeeSecondLastName: null,
      employeePhoto: null,
      departmentId: 1,
      positionId: null,
      businessUnitId: 1,
      payrollBusinessUnitId: 1,
      branchOfficeId: params.homeBranchId,
      branchOfficeName: null,
      department: null,
      position: null,
      businessUnit: null,
    },
    departmentName: null,
    calendar: [params.day],
  }
}

/**
 * Sitio 10 con cuota 3/2 y dos presentes (ámbar). Candidatos posibles: dos en
 * descanso en el sitio (3 y 5) y uno presente en otro sitio (4).
 */
function buildInput(visibleEmployeeIds: ReadonlySet<number>): BuildCoverageInput {
  return {
    day: DAY,
    sites: [{ branchOfficeId: SITE_ID, branchOfficeName: 'Planta' }],
    quotas: [
      { branchOfficeId: SITE_ID, shiftId: SHIFT_ID, shiftName: 'Matutino', required: 3, minimum: 2 },
      { branchOfficeId: OTHER_SITE_ID, shiftId: SHIFT_ID, shiftName: 'Matutino', required: 1, minimum: 1 },
    ],
    loans: [],
    bundles: [
      buildBundle({ employeeId: 1, firstName: 'Ana', homeBranchId: SITE_ID, day: buildDay({ checkInStatus: 'ontime', isRestDay: false }) }),
      buildBundle({ employeeId: 2, firstName: 'Beto', homeBranchId: SITE_ID, day: buildDay({ checkInStatus: 'tolerance', isRestDay: false }) }),
      buildBundle({ employeeId: 3, firstName: 'Carla', homeBranchId: SITE_ID, day: buildDay({ checkInStatus: '', isRestDay: true }) }),
      buildBundle({ employeeId: 4, firstName: 'Diego', homeBranchId: OTHER_SITE_ID, day: buildDay({ checkInStatus: 'ontime', isRestDay: false }) }),
      buildBundle({ employeeId: 5, firstName: 'Elena', homeBranchId: SITE_ID, day: buildDay({ checkInStatus: '', isRestDay: true }) }),
    ],
    branchOfficeNamesById: new Map([
      [SITE_ID, 'Planta'],
      [OTHER_SITE_ID, 'CEDIS'],
    ]),
    visibleEmployeeIds,
  }
}

function siteShift(response: CoverageResponse): CoverageShift {
  const shift = response.sites
    .find((site) => site.branchOfficeId === SITE_ID)
    ?.shifts.find((row) => row.shiftId === SHIFT_ID)
  if (!shift) throw new Error('la respuesta no trae el turno del sitio evaluado')
  return shift
}

function semaphore(shift: CoverageShift) {
  const { required, min, assigned, present, missing, status } = shift
  return { required, min, assigned, present, missing, status }
}

async function validationFails(payload: Record<string, unknown>): Promise<boolean> {
  try {
    await getAttendanceCoverageValidator.validate(payload)
    return false
  } catch {
    return true
  }
}

/** Cuerpo de un método de clase: desde su firma hasta el siguiente método. */
function methodBody(content: string, signature: string): string {
  const start = content.indexOf(signature)
  if (start === -1) throw new Error(`no se encontró ${signature}`)
  const rest = content.slice(start + signature.length)
  const nextMethod = rest.search(/\n {2}(?:private )?async /)
  return nextMethod === -1 ? rest : rest.slice(0, nextMethod)
}

test.group('Attendance-stats — cobertura por empresaContratanteId con permiso y alcance', () => {
  test('buildCoverageResponse con todos visibles lista los tres candidatos', ({ assert }) => {
    const shift = siteShift(buildCoverageResponse(buildInput(new Set([1, 2, 3, 4, 5]))))

    assert.equal(shift.status, 'amber')
    assert.deepEqual(
      shift.candidates.map((candidate) => candidate.employeeId),
      [3, 5, 4]
    )
  })

  test('buildCoverageResponse excluye candidatos no visibles sin alterar el semáforo', ({ assert }) => {
    const full = siteShift(buildCoverageResponse(buildInput(new Set([1, 2, 3, 4, 5]))))
    const scoped = siteShift(buildCoverageResponse(buildInput(new Set([1, 2, 3]))))

    assert.deepEqual(
      scoped.candidates.map((candidate) => candidate.employeeId),
      [3]
    )
    assert.deepEqual(semaphore(scoped), semaphore(full))
    assert.deepEqual(semaphore(scoped), {
      required: 3,
      min: 2,
      assigned: 2,
      present: 2,
      missing: 1,
      status: 'amber',
    })
  })

  test('buildCoverageResponse sin colaboradores visibles no expone candidatos', ({ assert }) => {
    const shift = siteShift(buildCoverageResponse(buildInput(new Set())))

    assert.lengthOf(shift.candidates, 0)
    assert.equal(shift.present, 2)
    assert.equal(shift.status, 'amber')
  })

  test('el validador acepta empresaContratanteId', async ({ assert }) => {
    const validated = await getAttendanceCoverageValidator.validate({
      startDay: DAY,
      endDay: DAY,
      empresaContratanteId: 7,
    })

    assert.equal(validated.empresaContratanteId, 7)
  })

  test('el validador rechaza la ausencia de empresaContratanteId', async ({ assert }) => {
    assert.isTrue(await validationFails({ startDay: DAY, endDay: DAY }))
  })

  test('el validador rechaza companyId como sustituto', async ({ assert }) => {
    assert.isTrue(await validationFails({ startDay: DAY, endDay: DAY, companyId: 7 }))
  })

  test('las consultas de sucursal no devuelven nada sin unidades de negocio', async ({ assert }) => {
    const repo = new AttendanceStatsRepositoryMysql({} as unknown as I18n)

    const names = await repo.getBranchOfficeNamesByIds([SITE_ID], [])

    assert.deepEqual(await repo.getShiftQuotasByBranchIds([SITE_ID], []), [])
    assert.equal(names.size, 0)
    assert.deepEqual(await repo.getEmployeeIdsInResponsibleScope(1, [1], []), [])
  })

  test('censo: el controller lee empresaContratanteId y ya no companyId', ({ assert }) => {
    const content = readFileSync(CONTROLLER_FILE, 'utf-8')

    assert.include(content, "request.input('empresaContratanteId')")
    assert.notInclude(content, "input('companyId')")
  })

  test('censo: coverage exige shift-coverage antes de validar', ({ assert }) => {
    const content = readFileSync(CONTROLLER_FILE, 'utf-8')
    const coverage = methodBody(content, 'async coverage(')

    assert.include(content, "const SHIFT_COVERAGE_PERMISSION_SLUG = 'shift-coverage'")
    assert.include(coverage, 'SHIFT_COVERAGE_PERMISSION_SLUG')
    assert.include(coverage, "key: 'sin-permiso'")
    assert.isBelow(
      coverage.indexOf('hasAccess('),
      coverage.indexOf('getAttendanceCoverageValidator.validate(')
    )
  })

  test('censo: los 500 no devuelven el mensaje crudo del error', ({ assert }) => {
    const content = readFileSync(CONTROLLER_FILE, 'utf-8')

    assert.notInclude(content, 'error: message')
    assert.include(content, 'logger.error(')
  })

  test('censo: cuotas y nombres de sucursal filtran por business_unit_id', ({ assert }) => {
    const content = readFileSync(REPO_FILE, 'utf-8')
    const quotas = methodBody(content, 'async getShiftQuotasByBranchIds(')
    const names = methodBody(content, 'async getBranchOfficeNamesByIds(')

    assert.include(quotas, "whereIn('bo.business_unit_id', allowedBusinessUnitIds)")
    assert.include(quotas, "whereNull('bo.branch_office_deleted_at')")
    assert.include(names, "whereIn('bo.business_unit_id', allowedBusinessUnitIds)")
  })

  test('censo: préstamos exigen origen y destino dentro de la empresa', ({ assert }) => {
    const loans = methodBody(readFileSync(REPO_FILE, 'utf-8'), 'async getActiveLoansForDay(')

    assert.include(loans, "whereIn('source_bo.business_unit_id', allowedBusinessUnitIds)")
    assert.include(loans, "whereIn('target_bo.business_unit_id', allowedBusinessUnitIds)")
  })

  test('censo: la sucursal base sale del join acotado por empresa', ({ assert }) => {
    const scope = methodBody(readFileSync(REPO_FILE, 'utf-8'), 'private async resolveEmployeesInScope(')

    assert.include(scope, "andOnIn('bo.business_unit_id', allowedBusinessUnitIds)")
    assert.include(scope, "'bo.branch_office_id AS branch_office_id'")
    assert.notInclude(scope, "'ebo.branch_office_id AS branch_office_id'")
    assert.include(scope, "whereIn('ebo.branch_office_id', branchOfficeIds)")
  })
})
