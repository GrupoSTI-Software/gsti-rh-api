import { test } from '@japa/runner'
import type Employee from '#models/employee'
import AssistsService, { formatDecimalHours } from '#services/assist_service'
import { reportI18n } from '#helpers/report_locale'
import type { AssistDayInterface } from '../../../app/interfaces/assist_day_interface.js'

/**
 * Reportes de asistencia: horas `HH:mm` sin "07:60", fechas de calendario
 * independientes de la zona del servidor, nombres sin "null" y checadas en la
 * zona del sitio con la que se evaluó el día.
 */

/** Corre `fn` con el proceso en otra zona horaria y la restaura al terminar. */
function withProcessZone<T>(zone: string, fn: () => T): T {
  const previous = process.env.TZ
  process.env.TZ = zone
  try {
    return fn()
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
}

/** Día de calendario mínimo para `addRowCalendar`. */
function calendarDay(day: string, checkInUtc: string | null): AssistDayInterface {
  const checkIn = checkInUtc ? { assistPunchTimeUtc: checkInUtc } : null
  return {
    day,
    assist: {
      checkIn,
      checkOut: null,
      checkEatIn: null,
      checkEatOut: null,
      dateShift: null,
      dateShiftApplySince: null,
      employeeShiftId: null,
      shiftCalculateFlag: '',
      checkInDateTime: null,
      checkOutDateTime: null,
      checkInStatus: '',
      checkOutStatus: '',
      isFutureDay: false,
      isSundayBonus: false,
      isRestDay: false,
      isVacationDate: false,
      isWorkDisabilityDate: false,
      isHoliday: false,
      isBirthday: false,
      holiday: null,
      hasExceptions: false,
      exceptions: [],
    },
  } as unknown as AssistDayInterface
}

function employeeWithoutSecondLastName(): Employee {
  return {
    employeeCode: 1234,
    person: { personFirstname: 'Ana', personLastname: 'López', personSecondLastname: null },
    department: null,
    position: null,
  } as unknown as Employee
}

test.group('Reportes de asistencia: horas', () => {
  test('redondea los minutos totales antes de partirlos', ({ assert }) => {
    assert.equal(formatDecimalHours(7.999), '08:00')
    assert.equal(formatDecimalHours(8.5), '08:30')
    assert.equal(formatDecimalHours(0), '00:00')
    assert.equal(formatDecimalHours(0.9999), '01:00')
    assert.equal(formatDecimalHours(12.25), '12:15')
    assert.equal(formatDecimalHours(100.5), '100:30')
  })

  test('negativos con signo y sin "-00:00"', ({ assert }) => {
    assert.equal(formatDecimalHours(-0.5), '-00:30')
    assert.equal(formatDecimalHours(-7.999), '-08:00')
    assert.equal(formatDecimalHours(-0.001), '00:00')
    assert.equal(formatDecimalHours(Number.NaN), '00:00')
  })

  test('el método del servicio usa la misma regla', ({ assert }) => {
    const service = new AssistsService(reportI18n())
    assert.equal(service.decimalToTimeString(7.999), '08:00')
  })
})

test.group('Reportes de asistencia: fechas de calendario', () => {
  test('primera quincena y aniversario leídos como día de calendario', ({ assert }) => {
    const service = new AssistsService(reportI18n())
    withProcessZone('America/Mexico_City', () => {
      assert.isTrue(service.isFirstPayMonth('2026-09-01'))
      assert.isFalse(service.isFirstPayMonth('2026-09-16'))
      assert.isTrue(service.isAnniversaryInPayMonth('2020-09-01', '2026-09-10'))
      assert.isFalse(service.isAnniversaryInPayMonth('2020-08-31', '2026-09-10'))
    })
  })
})

test.group('Reportes de asistencia: filas', () => {
  test('fecha dd/MM/yyyy, nombre sin "null" y checada en la zona del sitio', async ({ assert }) => {
    const service = new AssistsService(reportI18n())
    const withZone = service as unknown as { adoptCalendarZone(data: { timeZone: string }): void }
    withZone.adoptCalendarZone({ timeZone: 'America/Mexico_City' })

    const previous = process.env.TZ
    process.env.TZ = 'Asia/Tokyo'
    const rows = await service
      .addRowCalendar(employeeWithoutSecondLastName(), [
        calendarDay('2026-09-24', '2026-09-24T14:05:00.000Z'),
      ])
      .finally(() => {
        if (previous === undefined) delete process.env.TZ
        else process.env.TZ = previous
      })

    assert.lengthOf(rows, 1)
    assert.equal(rows[0].date, '24/09/2026')
    assert.equal(rows[0].name, 'Ana López')
    assert.equal(rows[0].firstCheck, '24/09/2026 08:05:00')
  })
})
