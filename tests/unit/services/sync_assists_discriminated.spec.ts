import { test } from '@japa/runner'
import SyncAssistsService from '#services/sync_assists_service'
import { AssistDayInterface } from '../../../app/interfaces/assist_day_interface.js'
import { AssistInterface } from '../../../app/interfaces/assist_interface.js'
import { ShiftInterface } from '../../../app/interfaces/shift_interface.js'
import { ShiftExceptionInterface } from '../../../app/interfaces/shift_exception_interface.js'

/**
 * Colaborador discriminado de asistencia: su calendario no se evalúa.
 *
 * `checkInStatus` y `checkOutStatus` ya respetaban la bandera, pero dos reglas
 * posteriores del pipeline la ignoraban y volvían a marcar el día: la entrada
 * sin salida con el turno ya cerrado (falta) y la excepción con horario propio
 * (retardo o tolerancia).
 */

type Rules = {
  verifyCheckOutToday(checkAssist: AssistDayInterface, discriminated?: boolean): AssistDayInterface
  hasSomeExceptionTimeCheckIn(
    checkAssist: AssistDayInterface,
    delayMinutes: number,
    discriminated?: boolean
  ): AssistDayInterface
  hasSomeExceptionTimeCheckOut(
    checkAssist: AssistDayInterface,
    discriminated?: boolean
  ): Promise<AssistDayInterface>
}

function rules(): Rules {
  return new SyncAssistsService() as unknown as Rules
}

function buildDay(
  punches: { checkIn?: string; checkOut?: string },
  exceptions: Partial<ShiftExceptionInterface>[] = []
): AssistDayInterface {
  return {
    day: '2026-01-20',
    assist: {
      checkIn: punches.checkIn
        ? ({ assistId: 1, assistPunchTimeUtc: punches.checkIn } as unknown as AssistInterface)
        : null,
      checkOut: punches.checkOut
        ? ({ assistId: 2, assistPunchTimeUtc: punches.checkOut } as unknown as AssistInterface)
        : null,
      checkEatIn: null,
      checkEatOut: null,
      dateShift: { shiftTimeStart: '09:00:00', shiftActiveHours: 9 } as unknown as ShiftInterface,
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
      hasExceptions: exceptions.length > 0,
      exceptions: exceptions as ShiftExceptionInterface[],
    },
  } as AssistDayInterface
}

// 09:40 CDMX = 15:40Z; el turno de 09:00 a 18:00 del 2026-01-20 ya cerró.
const LATE_CHECK_IN = '2026-01-20T15:40:00.000Z'
// 16:00 CDMX = 22:00Z, dos horas antes de la salida autorizada.
const EARLY_CHECK_OUT = '2026-01-20T22:00:00.000Z'

test.group('SyncAssistsService — colaborador discriminado de asistencia', () => {
  test('entrada sin salida con el turno cerrado no marca falta', ({ assert }) => {
    const result = rules().verifyCheckOutToday(buildDay({ checkIn: LATE_CHECK_IN }), true)
    assert.equal(result.assist.checkInStatus, '')
  })

  test('entrada sin salida sigue marcando falta si no está discriminado', ({ assert }) => {
    const result = rules().verifyCheckOutToday(buildDay({ checkIn: LATE_CHECK_IN }), false)
    assert.equal(result.assist.checkInStatus, 'fault')
  })

  test('excepción con hora de entrada no lo marca con retardo', ({ assert }) => {
    const day = buildDay({ checkIn: LATE_CHECK_IN }, [{ shiftExceptionCheckInTime: '09:00:00' }])
    const result = rules().hasSomeExceptionTimeCheckIn(day, 10, true)
    assert.equal(result.assist.checkInStatus, '')
  })

  test('excepción con hora de entrada sigue marcando retardo si no está discriminado', ({
    assert,
  }) => {
    const day = buildDay({ checkIn: LATE_CHECK_IN }, [{ shiftExceptionCheckInTime: '09:00:00' }])
    const result = rules().hasSomeExceptionTimeCheckIn(day, 10, false)
    assert.equal(result.assist.checkInStatus, 'delay')
  })

  test('excepción con hora de salida no lo marca con salida anticipada', async ({ assert }) => {
    const day = buildDay(
      { checkIn: LATE_CHECK_IN, checkOut: EARLY_CHECK_OUT },
      [{ shiftExceptionCheckOutTime: '18:00:00' }]
    )
    const result = await rules().hasSomeExceptionTimeCheckOut(day, true)
    assert.equal(result.assist.checkOutStatus, '')
  })
})
