import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { buildOverviewResponse } from '../../../app/modules/attendance-stats/attendance-stats.service.js'
import { getAttendanceStatsValidator } from '../../../app/modules/attendance-stats/validators/get-attendance-stats.validator.js'
import type { AssistDayInterface } from '../../../app/interfaces/assist_day_interface.js'
import type {
  AttendanceStatsGranularity,
  EmployeeCalendarBundle,
  OverviewResponse,
  OverviewStatistics,
} from '../../../app/modules/attendance-stats/dto/attendance-stats.dto.js'

/**
 * Modo anual del monitor: con `granularity=month` el overview entrega la serie
 * mensual ya calculada con el mismo cierre al 100% que `statistics` y `daily`.
 * Todo corre sobre calendarios en memoria, sin BD.
 */
const CONTROLLER_FILE = join(
  process.cwd(),
  'app/modules/attendance-stats/attendance-stats.controller.ts'
)
const SERVICE_FILE = join(process.cwd(), 'app/modules/attendance-stats/attendance-stats.service.ts')

const THRESHOLDS = { delayMinutes: 10, faultMinutes: 30 }

const ZERO_STATS: OverviewStatistics = {
  assists: 0,
  tolerances: 0,
  delays: 0,
  earlyOuts: 0,
  faults: 0,
  totalAvailable: 0,
  ontimePercentage: 0,
  tolerancePercentage: 0,
  delayPercentage: 0,
  earlyOutPercentage: 0,
  faultPercentage: 0,
  justifiedAbsences: 0,
  vacations: 0,
  holidays: 0,
  employeesQty: 0,
}

/** Estadísticas esperadas: todo en cero salvo lo que se indique. */
function stats(values: Partial<OverviewStatistics>): OverviewStatistics {
  return { ...ZERO_STATS, ...values }
}

interface DayParams {
  checkInStatus?: string
  checkOutStatus?: string
  isRestDay?: boolean
  isVacationDate?: boolean
  isHoliday?: boolean
}

/** Día-empleado mínimo; solo se llenan los campos que lee la clasificación. */
function buildDay(day: string, params: DayParams = {}): AssistDayInterface {
  return {
    day,
    assist: {
      checkIn: null,
      checkOut: null,
      checkEatIn: null,
      checkEatOut: null,
      dateShift: null,
      dateShiftApplySince: null,
      employeeShiftId: null,
      shiftCalculateFlag: '',
      checkInDateTime: null,
      checkOutDateTime: null,
      checkInStatus: params.checkInStatus ?? '',
      checkOutStatus: params.checkOutStatus ?? '',
      isFutureDay: false,
      isSundayBonus: false,
      isRestDay: params.isRestDay ?? false,
      isVacationDate: params.isVacationDate ?? false,
      isWorkDisabilityDate: false,
      isHoliday: params.isHoliday ?? false,
      isBirthday: false,
      holiday: null,
      hasExceptions: false,
      exceptions: [],
    },
  }
}

/** Día trabajado con el estatus de entrada indicado. */
function worked(day: string, checkInStatus: string): AssistDayInterface {
  return buildDay(day, { checkInStatus })
}

function buildBundle(employeeId: number, calendar: AssistDayInterface[]): EmployeeCalendarBundle {
  return {
    employee: {
      employeeId,
      employeeCode: null,
      employeePayrollCode: null,
      employeeFirstName: `Colaborador ${employeeId}`,
      employeeLastName: 'Prueba',
      employeeSecondLastName: null,
      employeePhoto: null,
      departmentId: 1,
      positionId: null,
      businessUnitId: 1,
      payrollBusinessUnitId: 1,
      branchOfficeId: null,
      branchOfficeName: null,
      department: null,
      position: null,
      businessUnit: null,
    },
    departmentName: null,
    calendar,
  }
}

function overview(
  bundles: EmployeeCalendarBundle[],
  startDay: string,
  endDay: string,
  granularity: AttendanceStatsGranularity
): OverviewResponse {
  return buildOverviewResponse({ bundles, thresholds: THRESHOLDS, startDay, endDay, granularity })
}

function monthlyOf(response: OverviewResponse) {
  if (!response.monthly) throw new Error('la respuesta no trae la serie mensual')
  return response.monthly
}

function closingSum(statistics: OverviewStatistics): number {
  return (
    statistics.ontimePercentage +
    statistics.tolerancePercentage +
    statistics.delayPercentage +
    statistics.faultPercentage
  )
}

/**
 * Tres días con los casos que mueven el cálculo: tolerancia, retardo con salida
 * anticipada, falta, festivo, vacaciones y descanso.
 */
function mayWeekBundles(): EmployeeCalendarBundle[] {
  return [
    buildBundle(1, [
      worked('2026-05-11', 'ontime'),
      buildDay('2026-05-12', { checkInStatus: 'delay', checkOutStatus: 'delay' }),
      worked('2026-05-13', 'fault'),
    ]),
    buildBundle(2, [
      worked('2026-05-11', 'tolerance'),
      buildDay('2026-05-12', { isHoliday: true }),
      worked('2026-05-13', 'ontime'),
    ]),
    buildBundle(3, [
      buildDay('2026-05-11', { isRestDay: true }),
      buildDay('2026-05-12', { isRestDay: true }),
      buildDay('2026-05-13', { isVacationDate: true }),
    ]),
  ]
}

test.group('Attendance-stats — serie mensual del overview para el modo anual', () => {
  test('un año calendario da 12 meses y los meses sin registros van en cero', ({ assert }) => {
    const response = overview(
      [buildBundle(1, [worked('2026-01-05', 'ontime'), worked('2026-06-10', 'delay')])],
      '2026-01-01',
      '2026-12-31',
      'month'
    )
    const monthly = monthlyOf(response)

    assert.deepEqual(
      monthly.map((row) => row.month),
      Array.from({ length: 12 }, (_, index) => `2026-${String(index + 1).padStart(2, '0')}`)
    )
    assert.deepEqual(monthly[0].statistics, stats({ assists: 1, totalAvailable: 1, ontimePercentage: 100, employeesQty: 1 }))
    assert.deepEqual(monthly[5].statistics, stats({ delays: 1, totalAvailable: 1, delayPercentage: 100, employeesQty: 1 }))
    for (const row of monthly.filter((_, index) => index !== 0 && index !== 5)) {
      assert.deepEqual(row.statistics, ZERO_STATS, `el mes ${row.month} debería ir en cero`)
    }
    assert.lengthOf(response.daily, 365)
  })

  test('employeesQty cuenta empleados distintos con día evaluable en cada mes', ({ assert }) => {
    const response = overview(
      [
        buildBundle(1, [
          worked('2026-01-05', 'ontime'),
          worked('2026-01-06', 'tolerance'),
          worked('2026-02-02', 'ontime'),
        ]),
        buildBundle(2, [worked('2026-02-03', 'delay'), worked('2026-02-04', 'fault')]),
        buildBundle(3, [
          buildDay('2026-03-02', { isRestDay: true }),
          buildDay('2026-03-03', { isVacationDate: true }),
        ]),
      ],
      '2026-01-01',
      '2026-03-31',
      'month'
    )
    const monthly = monthlyOf(response)

    assert.deepEqual(
      monthly.map((row) => row.statistics.employeesQty),
      [1, 2, 0]
    )
    assert.equal(monthly[2].statistics.vacations, 1)
    assert.equal(monthly[2].statistics.totalAvailable, 0)
    assert.equal(response.statistics.employeesQty, 2)
  })

  test('los porcentajes de cada mes con datos cierran en 100', ({ assert }) => {
    const response = overview(
      [
        buildBundle(1, [
          worked('2026-01-05', 'ontime'),
          worked('2026-01-06', 'tolerance'),
          worked('2026-01-07', 'delay'),
          worked('2026-02-02', 'ontime'),
          worked('2026-02-03', 'tolerance'),
          worked('2026-02-04', 'delay'),
          worked('2026-02-05', 'fault'),
          worked('2026-02-06', 'fault'),
          worked('2026-02-09', 'fault'),
          worked('2026-04-06', 'ontime'),
          worked('2026-04-07', 'ontime'),
          worked('2026-04-08', 'tolerance'),
        ]),
      ],
      '2026-01-01',
      '2026-04-30',
      'month'
    )
    const withData = monthlyOf(response).filter((row) => row.statistics.totalAvailable > 0)

    assert.deepEqual(
      withData.map((row) => row.month),
      ['2026-01', '2026-02', '2026-04']
    )
    for (const row of withData) {
      assert.equal(closingSum(row.statistics), 100, `el mes ${row.month} no cierra en 100`)
    }
    // 33+33+33 deja residuo +1 y 17+17+17+50 deja -1: el mismo cierre que statistics.
    assert.equal(withData[0].statistics.ontimePercentage, 34)
    assert.equal(withData[1].statistics.faultPercentage, 49)
  })

  test('un rango parcial toma solo los meses que toca', ({ assert }) => {
    const response = overview(
      [buildBundle(1, [worked('2026-03-20', 'ontime'), worked('2026-05-01', 'tolerance')])],
      '2026-03-15',
      '2026-05-02',
      'month'
    )

    assert.deepEqual(
      monthlyOf(response).map((row) => row.month),
      ['2026-03', '2026-04', '2026-05']
    )
    assert.lengthOf(response.daily, 49)
  })

  test('un rango que cruza de año enumera los meses de ambos años', ({ assert }) => {
    const response = overview([], '2025-12-20', '2026-01-10', 'month')

    assert.deepEqual(
      monthlyOf(response).map((row) => row.month),
      ['2025-12', '2026-01']
    )
  })

  test('con day o sin serie mensual la respuesta no trae monthly y daily conserva el cálculo', ({ assert }) => {
    const response = overview(mayWeekBundles(), '2026-05-11', '2026-05-13', 'day')

    assert.notProperty(response, 'monthly')
    assert.deepEqual(response.daily, [
      {
        day: '2026-05-11',
        statistics: stats({ assists: 1, tolerances: 1, totalAvailable: 2, ontimePercentage: 50, tolerancePercentage: 50, employeesQty: 2 }),
      },
      {
        day: '2026-05-12',
        statistics: stats({ delays: 1, earlyOuts: 1, totalAvailable: 1, delayPercentage: 100, earlyOutPercentage: 100, holidays: 1, employeesQty: 1 }),
      },
      {
        day: '2026-05-13',
        statistics: stats({ assists: 1, faults: 1, totalAvailable: 2, ontimePercentage: 50, faultPercentage: 50, vacations: 1, employeesQty: 2 }),
      },
    ])
    assert.deepEqual(
      response.statistics,
      stats({
        assists: 2,
        tolerances: 1,
        delays: 1,
        earlyOuts: 1,
        faults: 1,
        totalAvailable: 5,
        ontimePercentage: 40,
        tolerancePercentage: 20,
        delayPercentage: 20,
        earlyOutPercentage: 20,
        faultPercentage: 20,
        holidays: 1,
        vacations: 1,
        employeesQty: 2,
      })
    )
    assert.deepEqual(response.period, { startDay: '2026-05-11', endDay: '2026-05-13', evaluableDays: 5 })
  })

  test('con month statistics, period y daily son idénticos a los de day', ({ assert }) => {
    const byDay = overview(mayWeekBundles(), '2026-05-11', '2026-05-13', 'day')
    const byMonth = overview(mayWeekBundles(), '2026-05-11', '2026-05-13', 'month')

    assert.deepEqual(byMonth.statistics, byDay.statistics)
    assert.deepEqual(byMonth.period, byDay.period)
    assert.deepEqual(byMonth.daily, byDay.daily)
    // Un solo mes en el rango: su serie coincide con el total del período.
    assert.deepEqual(monthlyOf(byMonth), [{ month: '2026-05', statistics: byDay.statistics }])
  })

  test('el validador acepta day y month, permite omitirlo y rechaza otros valores', async ({ assert }) => {
    const base = { startDay: '2026-01-01', endDay: '2026-12-31' }

    const monthly = await getAttendanceStatsValidator.validate({ ...base, granularity: 'month' })
    const daily = await getAttendanceStatsValidator.validate({ ...base, granularity: 'day' })
    const omitted = await getAttendanceStatsValidator.validate(base)

    assert.equal(monthly.granularity, 'month')
    assert.equal(daily.granularity, 'day')
    assert.isUndefined(omitted.granularity)
    await assert.rejects(() => getAttendanceStatsValidator.validate({ ...base, granularity: 'year' }))
  })

  test('censo: el handler pasa granularity y overview usa day por default', ({ assert }) => {
    assert.include(readFileSync(CONTROLLER_FILE, 'utf-8'), "granularity: request.input('granularity')")
    assert.include(readFileSync(SERVICE_FILE, 'utf-8'), "granularity: filters.granularity ?? 'day'")
  })
})
