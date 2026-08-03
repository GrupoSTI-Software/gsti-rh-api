import { test } from '@japa/runner'
import SyncAssistsService from '#services/sync_assists_service'
import { AssistDayInterface } from '../../../app/interfaces/assist_day_interface.js'
import { AssistInterface } from '../../../app/interfaces/assist_interface.js'
import { ShiftInterface } from '../../../app/interfaces/shift_interface.js'

/**
 * USRH1785436961903 — clasificación de salida anticipada.
 *
 * El biométrico guarda `assist_punch_time_utc` como hora de pared + offset con
 * SU horario de verano (abr-oct → +5; resto → +6). La convención vieja (`-6`
 * fijo) adelantaba 1 h la salida dentro de la ventana de verano y marcaba
 * anticipada una salida puntual. Estos casos cubren los criterios 1-3 del spec:
 * turno 9:00 + 9 h activas (fin 17:59), salida puntual y salida realmente
 * anticipada, en verano y en invierno.
 */

type CheckOutClassifier = {
  checkOutStatus(checkAssist: AssistDayInterface, discriminated?: Boolean): AssistDayInterface
}

function classifier(): CheckOutClassifier {
  return new SyncAssistsService() as unknown as CheckOutClassifier
}

function buildDay(day: string, punchUtc: string): AssistDayInterface {
  return {
    day,
    assist: {
      checkIn: null,
      checkOut: { assistPunchTimeUtc: punchUtc } as unknown as AssistInterface,
      checkEatIn: null,
      checkEatOut: null,
      dateShift: { shiftTimeStart: '09:00:00', shiftActiveHours: 9 } as unknown as ShiftInterface,
      dateShiftApplySince: null,
      employeeShiftId: null,
      shiftCalculateFlag: '',
      checkInDateTime: null,
      checkOutDateTime: null,
      checkInStatus: 'ontime',
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
  } as AssistDayInterface
}

test.group('SyncAssistsService.checkOutStatus — offset del biométrico (USRH1785436961903)', () => {
  test('verano: salida puntual 18:00 (marca 23:00 = pared + 5) queda a tiempo', async ({
    assert,
  }) => {
    const day = buildDay('2026-07-22', '2026-07-22T23:00:00.000Z')
    const result = classifier().checkOutStatus(day)
    assert.equal(result.assist.checkOutStatus, 'ontime')
  })

  test('verano: salida real 17:20 (marca 22:20) sigue marcándose anticipada', async ({
    assert,
  }) => {
    const day = buildDay('2026-07-22', '2026-07-22T22:20:00.000Z')
    const result = classifier().checkOutStatus(day)
    assert.equal(result.assist.checkOutStatus, 'delay')
  })

  test('invierno: salida puntual 18:00 (marca 00:00 del día siguiente = pared + 6) queda a tiempo', async ({
    assert,
  }) => {
    const day = buildDay('2026-01-14', '2026-01-15T00:00:00.000Z')
    const result = classifier().checkOutStatus(day)
    assert.equal(result.assist.checkOutStatus, 'ontime')
  })

  test('invierno: salida real 17:20 (marca 23:20) sigue marcándose anticipada', async ({
    assert,
  }) => {
    const day = buildDay('2026-01-14', '2026-01-14T23:20:00.000Z')
    const result = classifier().checkOutStatus(day)
    assert.equal(result.assist.checkOutStatus, 'delay')
  })
})
