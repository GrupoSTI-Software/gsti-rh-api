import { test } from '@japa/runner'
import type SyncAssistsService from '#services/sync_assists_service'
import WorkJournalMaterializer from '#modules/work-journal/work_journal.materializer'
import type { AssistDayInterface } from '../../../../app/interfaces/assist_day_interface.js'

/**
 * El sellado de jornada toma las checadas reales del colaborador, no el
 * horario esperado del turno, y nunca lee un estado vacío como "a tiempo".
 *
 * Turno de 08:00 a 18:00 en Ciudad de México (UTC-6, sin horario de verano).
 */

const CDMX = 'America/Mexico_City'
const SHIFT_START_EXPECTED = '2026-09-22T14:01:00.000Z'
const SHIFT_END_EXPECTED = '2026-09-23T23:59:00.000Z'

type Punch = { assistPunchTimeUtc: string }

function punch(isoUtc: string): Punch {
  return { assistPunchTimeUtc: isoUtc }
}

function buildDay(
  overrides: Partial<AssistDayInterface['assist']> = {},
  punches: { checkIn?: string; eatIn?: string; eatOut?: string; checkOut?: string } = {}
): AssistDayInterface {
  const list = [punches.checkIn, punches.eatIn, punches.eatOut, punches.checkOut]
    .filter((value): value is string => !!value)
    .map(punch)
  return {
    day: '2026-09-22',
    assist: {
      checkIn: punches.checkIn ? punch(punches.checkIn) : null,
      checkEatIn: punches.eatIn ? punch(punches.eatIn) : null,
      checkEatOut: punches.eatOut ? punch(punches.eatOut) : null,
      checkOut: punches.checkOut ? punch(punches.checkOut) : null,
      dateShift: { shiftId: 2, shiftTimeStart: '08:00:00', shiftActiveHours: 10 },
      checkInDateTime: SHIFT_START_EXPECTED,
      checkOutDateTime: SHIFT_END_EXPECTED,
      checkInStatus: 'fault',
      checkOutStatus: 'fault',
      isFutureDay: false,
      isRestDay: false,
      isVacationDate: false,
      isWorkDisabilityDate: false,
      isHoliday: false,
      hasExceptions: false,
      exceptions: [],
      assitFlatList: list,
      ...overrides,
    },
  } as unknown as AssistDayInterface
}

function materializerFor(calendar: AssistDayInterface[]): WorkJournalMaterializer {
  const assists = {
    index: async () => ({ data: { employeeCalendar: calendar, timeZone: CDMX } }),
  } as unknown as SyncAssistsService
  return new WorkJournalMaterializer(undefined, assists)
}

const employee = { employeeId: 679, employeeAssistDiscriminator: 0 }

test.group('WorkJournalMaterializer', () => {
  test('sin checadas sella ausencia, sin horas esperadas ni minutos', async ({ assert }) => {
    const [day] = await materializerFor([buildDay()]).buildForEmployee(employee, '2026-09-22', '2026-09-22')
    assert.equal(day.dayStatus, 'absence')
    assert.isNull(day.checkIn)
    assert.isNull(day.checkOut)
    assert.isNull(day.workedMinutes)
  })

  test('sella las checadas reales en la zona del sitio y descuenta la comida', async ({ assert }) => {
    const calendar = [
      buildDay(
        { checkInStatus: 'delay', checkOutStatus: 'delay' },
        {
          checkIn: '2026-09-22T14:25:00.000Z', // 08:25
          eatIn: '2026-09-22T20:00:00.000Z', // 14:00
          eatOut: '2026-09-22T20:30:00.000Z', // 14:30
          checkOut: '2026-09-22T21:00:00.000Z', // 15:00
        }
      ),
    ]
    const [day] = await materializerFor(calendar).buildForEmployee(employee, '2026-09-22', '2026-09-22')
    assert.equal(day.checkIn, '2026-09-22T08:25:00.000-06:00')
    assert.equal(day.checkOut, '2026-09-22T15:00:00.000-06:00')
    assert.equal(day.workedMinutes, 365)
    assert.equal(day.dayStatus, 'delay')
    assert.equal(day.shiftId, 2)
  })

  test('sin comida checada cuenta de la entrada a la salida', async ({ assert }) => {
    const calendar = [
      buildDay(
        { checkInStatus: 'ontime', checkOutStatus: 'ontime' },
        { checkIn: '2026-09-22T14:00:00.000Z', checkOut: '2026-09-23T00:00:00.000Z' }
      ),
    ]
    const [day] = await materializerFor(calendar).buildForEmployee(employee, '2026-09-22', '2026-09-22')
    assert.equal(day.workedMinutes, 600)
    assert.equal(day.dayStatus, 'ontime')
  })

  test('un colaborador discriminado queda como no evaluado, nunca a tiempo', async ({ assert }) => {
    const discriminated = { employeeId: 679, employeeAssistDiscriminator: 1 }
    const [day] = await materializerFor([buildDay({ checkInStatus: '', checkOutStatus: '' })]).buildForEmployee(
      discriminated,
      '2026-09-22',
      '2026-09-22'
    )
    assert.equal(day.dayStatus, 'not-evaluated')
    assert.isNull(day.checkIn)
  })

  test('un día con permiso con goce queda justificado', async ({ assert }) => {
    const calendar = [buildDay({ checkInStatus: 'exception', checkOutStatus: 'exception', hasExceptions: true })]
    const [day] = await materializerFor(calendar).buildForEmployee(employee, '2026-09-22', '2026-09-22')
    assert.equal(day.dayStatus, 'justified')
  })

  test('omite los días futuros y los que no tienen turno ni checadas', async ({ assert }) => {
    const calendar = [buildDay({ isFutureDay: true }), buildDay({ dateShift: null })]
    const days = await materializerFor(calendar).buildForEmployee(employee, '2026-09-22', '2026-09-22')
    assert.lengthOf(days, 0)
  })
})
