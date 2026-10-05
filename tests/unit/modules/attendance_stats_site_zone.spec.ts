import { test } from '@japa/runner'
import { I18n } from '@adonisjs/i18n'
import AttendanceStatsRepositoryMysql from '#modules/attendance-stats/attendance-stats.repository.mysql'
import SiteTimeZoneService from '#modules/attendance-time/site_time_zone.service'
import type { AssistDayInterface } from '../../../app/interfaces/assist_day_interface.js'
import type {
  AttendanceTolerances,
  EmployeeSiteTimeZoneRow,
} from '#modules/attendance-time/attendance_time.interface'
import type { SiteTimeZoneRepository } from '#modules/attendance-time/site_time_zone.repository'

/**
 * La clasificación de attendance-stats se calcula en TS con la zona IANA del
 * sitio de cada colaborador. Estas pruebas ejercitan `buildAssistDayInterface`
 * con filas crudas como las que devuelve el SQL, sin base de datos, y la
 * resolución de zona con un repositorio falso.
 */

interface RawRow {
  employee_id: number
  day: string
  shift_id: number | null
  shift_time_start: string | null
  shift_active_hours: number | null
  shift_rest_days: string | null
  first_punch_utc: string | null
  last_punch_utc: string | null
  punch_count: number
  late_arrival_time: string | null
  early_departure_time: string | null
  has_vacation_exc: number
  has_absence_exc: number
  has_nuevo_ingreso_exc: number
  has_skip_checkout_exc: number
  has_skip_checkin_exc: number
  has_day_excluding_exc: number
  is_holiday: number
  is_work_disability: number
  is_rest_day: number
}

type DayBuilder = {
  buildAssistDayInterface(
    row: RawRow,
    tolerances: AttendanceTolerances,
    day: string,
    zone: string
  ): AssistDayInterface
}

const tolerances: AttendanceTolerances = { delayMinutes: 10, faultMinutes: 30 }

function repository(): DayBuilder {
  return new AttendanceStatsRepositoryMysql(
    {} as unknown as I18n,
    new SiteTimeZoneService(fakeZoneRepository([]))
  ) as unknown as DayBuilder
}

function fakeZoneRepository(rows: EmployeeSiteTimeZoneRow[]): SiteTimeZoneRepository {
  return {
    async findForEmployees(employeeIds: number[]) {
      return rows.filter((row) => employeeIds.includes(row.employeeId))
    },
    async findForBusinessUnit() {
      return null
    },
  }
}

function rawRow(day: string, firstPunchUtc: string | null, lastPunchUtc: string | null): RawRow {
  return {
    employee_id: 1,
    day,
    shift_id: 7,
    shift_time_start: '08:00:00',
    shift_active_hours: 9,
    shift_rest_days: '7',
    first_punch_utc: firstPunchUtc,
    last_punch_utc: lastPunchUtc,
    punch_count: firstPunchUtc && lastPunchUtc ? 2 : firstPunchUtc ? 1 : 0,
    late_arrival_time: null,
    early_departure_time: null,
    has_vacation_exc: 0,
    has_absence_exc: 0,
    has_nuevo_ingreso_exc: 0,
    has_skip_checkout_exc: 0,
    has_skip_checkin_exc: 0,
    has_day_excluding_exc: 0,
    is_holiday: 0,
    is_work_disability: 0,
    is_rest_day: 0,
  }
}

test.group('Attendance-stats — clasificación con la zona del sitio', () => {
  test('Ciudad de México: 07:55 local (13:55Z) es a tiempo todo el año', ({ assert }) => {
    const summer = repository().buildAssistDayInterface(
      rawRow('2026-07-15', '2026-07-15T13:55:00.000Z', '2026-07-15T23:05:00.000Z'),
      tolerances,
      '2026-07-15',
      'America/Mexico_City'
    )
    assert.equal(summer.assist.checkInStatus, 'ontime')
    assert.equal(summer.assist.checkOutStatus, 'ontime')
    assert.isFalse(summer.assist.isFutureDay)

    const winter = repository().buildAssistDayInterface(
      rawRow('2026-01-15', '2026-01-15T13:55:00.000Z', '2026-01-15T23:05:00.000Z'),
      tolerances,
      '2026-01-15',
      'America/Mexico_City'
    )
    assert.equal(winter.assist.checkInStatus, 'ontime')
  })

  test('Ciudad Juárez cambia de horario: la misma marca UTC vale distinto en verano e invierno', ({
    assert,
  }) => {
    // Verano (UTC-6): 13:55Z = 07:55 local → a tiempo.
    const summer = repository().buildAssistDayInterface(
      rawRow('2026-07-15', '2026-07-15T13:55:00.000Z', '2026-07-15T23:05:00.000Z'),
      tolerances,
      '2026-07-15',
      'America/Ciudad_Juarez'
    )
    assert.equal(summer.assist.checkInStatus, 'ontime')

    // Invierno (UTC-7): 13:55Z = 06:55 local → a tiempo; 15:20Z = 08:20 → retardo.
    const winterOnTime = repository().buildAssistDayInterface(
      rawRow('2026-01-15', '2026-01-15T13:55:00.000Z', '2026-01-16T00:05:00.000Z'),
      tolerances,
      '2026-01-15',
      'America/Ciudad_Juarez'
    )
    assert.equal(winterOnTime.assist.checkInStatus, 'ontime')

    const winterDelay = repository().buildAssistDayInterface(
      rawRow('2026-01-15', '2026-01-15T15:20:00.000Z', '2026-01-16T00:05:00.000Z'),
      tolerances,
      '2026-01-15',
      'America/Ciudad_Juarez'
    )
    assert.equal(winterDelay.assist.checkInStatus, 'delay')
  })

  test('Tijuana (UTC-8/-7): 13:55Z en verano son las 06:55 y 16:35Z ya es falta', ({
    assert,
  }) => {
    const early = repository().buildAssistDayInterface(
      rawRow('2026-07-15', '2026-07-15T13:55:00.000Z', '2026-07-16T00:05:00.000Z'),
      tolerances,
      '2026-07-15',
      'America/Tijuana'
    )
    assert.equal(early.assist.checkInStatus, 'ontime')

    const fault = repository().buildAssistDayInterface(
      rawRow('2026-07-15', '2026-07-15T16:35:00.000Z', '2026-07-16T00:05:00.000Z'),
      tolerances,
      '2026-07-15',
      'America/Tijuana'
    )
    assert.equal(fault.assist.checkInStatus, 'fault')
  })

  test('la salida anticipada se mide contra el fin del turno en la zona del sitio', ({
    assert,
  }) => {
    // Turno 08:00 + 9 h = 17:00 local en Ciudad de México = 23:00Z; salir 22:30Z = 16:30 → anticipada.
    const day = repository().buildAssistDayInterface(
      rawRow('2026-07-15', '2026-07-15T13:55:00.000Z', '2026-07-15T22:30:00.000Z'),
      tolerances,
      '2026-07-15',
      'America/Mexico_City'
    )
    assert.equal(day.assist.checkOutStatus, 'delay')
  })

  test('el permiso de llegada tarde se lee como hora civil del sitio', ({ assert }) => {
    const permitted = rawRow('2026-07-15', '2026-07-15T16:05:00.000Z', '2026-07-16T00:05:00.000Z')
    permitted.late_arrival_time = '10:00:00'
    // 16:05Z = 10:05 en Ciudad de México → 5 min tarde contra el permiso → tolerancia.
    const day = repository().buildAssistDayInterface(
      permitted,
      tolerances,
      '2026-07-15',
      'America/Mexico_City'
    )
    assert.equal(day.assist.checkInStatus, 'tolerance')
  })

  test('un día posterior a hoy es futuro y no se clasifica', ({ assert }) => {
    const day = repository().buildAssistDayInterface(
      rawRow('2099-01-15', null, null),
      tolerances,
      '2099-01-15',
      'America/Mexico_City'
    )
    assert.isTrue(day.assist.isFutureDay)
    assert.equal(day.assist.checkInStatus, '')
  })

  test('sin checada de entrada en un día pasado es falta', ({ assert }) => {
    const day = repository().buildAssistDayInterface(
      rawRow('2026-01-15', null, null),
      tolerances,
      '2026-01-15',
      'America/Mexico_City'
    )
    assert.equal(day.assist.checkInStatus, 'fault')
  })
})

test.group('Attendance-stats — zona del sitio por colaborador', () => {
  test('la sucursal gana a la empresa y quien no tiene nada cae al sistema', async ({ assert }) => {
    const service = new SiteTimeZoneService(
      fakeZoneRepository([
        { employeeId: 1, branchOfficeTimezone: 'America/Ciudad_Juarez', businessUnitTimezone: 'America/Mexico_City' },
        { employeeId: 2, branchOfficeTimezone: null, businessUnitTimezone: 'America/Tijuana' },
        { employeeId: 3, branchOfficeTimezone: 'America/Noexiste', businessUnitTimezone: null },
      ])
    )
    const zones = await service.forEmployees([1, 2, 3, 4])
    assert.equal(zones.get(1)?.zone, 'America/Ciudad_Juarez')
    assert.equal(zones.get(1)?.source, 'branch_office')
    assert.equal(zones.get(2)?.zone, 'America/Tijuana')
    assert.equal(zones.get(2)?.source, 'business_unit')
    assert.equal(zones.get(3)?.source, 'system')
    assert.isTrue(zones.get(3)?.fellBack)
    assert.equal(zones.get(4)?.source, 'system')
  })
})
