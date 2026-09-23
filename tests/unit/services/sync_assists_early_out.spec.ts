import { test } from '@japa/runner'
import SyncAssistsService from '#services/sync_assists_service'
import { AssistDayInterface } from '../../../app/interfaces/assist_day_interface.js'
import { AssistInterface } from '../../../app/interfaces/assist_interface.js'
import { ShiftInterface } from '../../../app/interfaces/shift_interface.js'

/**
 * Clasificación de entrada y salida con la zona del sitio.
 *
 * `assist_punch_time_utc` es un instante UTC real y el turno se evalúa en la
 * zona IANA del sitio: Ciudad de México no cambia de horario desde 2022,
 * Ciudad Juárez y Tijuana sí. La regla es una sola (`attendance-time`), sin
 * offsets fijos ni ajustes de verano hechos a mano.
 */

type Classifier = {
  checkInStatus(
    checkAssist: AssistDayInterface,
    faultMinutes: number,
    delayMinutes: number,
    discriminated?: Boolean,
    zone?: string
  ): AssistDayInterface
  checkOutStatus(
    checkAssist: AssistDayInterface,
    discriminated?: Boolean,
    zone?: string,
    delayMinutes?: number
  ): AssistDayInterface
}

function classifier(): Classifier {
  return new SyncAssistsService() as unknown as Classifier
}

function buildDay(
  day: string,
  punches: { checkIn?: string; checkOut?: string },
  shift: { start: string; hours: number } = { start: '09:00:00', hours: 9 }
): AssistDayInterface {
  return {
    day,
    assist: {
      checkIn: punches.checkIn
        ? ({ assistPunchTimeUtc: punches.checkIn } as unknown as AssistInterface)
        : null,
      checkOut: punches.checkOut
        ? ({ assistPunchTimeUtc: punches.checkOut } as unknown as AssistInterface)
        : null,
      checkEatIn: null,
      checkEatOut: null,
      dateShift: {
        shiftTimeStart: shift.start,
        shiftActiveHours: shift.hours,
      } as unknown as ShiftInterface,
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

const CDMX = 'America/Mexico_City'
const JUAREZ = 'America/Ciudad_Juarez'
const TIJUANA = 'America/Tijuana'

test.group('SyncAssistsService.checkOutStatus — salida en la zona del sitio', () => {
  test('verano CDMX: salida puntual 18:00 (00:00Z del día siguiente) queda a tiempo', ({
    assert,
  }) => {
    const day = buildDay('2026-07-22', { checkOut: '2026-07-23T00:00:00.000Z' })
    const result = classifier().checkOutStatus(day, false, CDMX)
    assert.equal(result.assist.checkOutStatus, 'ontime')
  })

  test('verano CDMX: salida real 17:20 (23:20Z) sigue marcándose anticipada', ({ assert }) => {
    const day = buildDay('2026-07-22', { checkOut: '2026-07-22T23:20:00.000Z' })
    const result = classifier().checkOutStatus(day, false, CDMX)
    assert.equal(result.assist.checkOutStatus, 'delay')
  })

  test('invierno CDMX: mismo instante para la misma pared, no hay horario de verano', ({
    assert,
  }) => {
    const puntual = buildDay('2026-01-14', { checkOut: '2026-01-15T00:00:00.000Z' })
    assert.equal(classifier().checkOutStatus(puntual, false, CDMX).assist.checkOutStatus, 'ontime')
    const anticipada = buildDay('2026-01-14', { checkOut: '2026-01-14T23:20:00.000Z' })
    assert.equal(classifier().checkOutStatus(anticipada, false, CDMX).assist.checkOutStatus, 'delay')
  })

  test('la salida dentro de la tolerancia configurada es tolerancia, no anticipada', ({
    assert,
  }) => {
    // 17:55 en CDMX = 23:55Z; con tolerancia de 10 min es tolerancia, con 3 es anticipada.
    const day = buildDay('2026-07-22', { checkOut: '2026-07-22T23:55:00.000Z' })
    assert.equal(classifier().checkOutStatus(day, false, CDMX, 10).assist.checkOutStatus, 'tolerance')
    assert.equal(classifier().checkOutStatus(day, false, CDMX, 3).assist.checkOutStatus, 'delay')
  })
})

test.group('SyncAssistsService.checkInStatus — entrada en la zona del sitio', () => {
  test('verano CDMX: entrada 08:00 con turno de 08:00 es 14:00Z y queda a tiempo', ({ assert }) => {
    const day = buildDay('2026-07-22', { checkIn: '2026-07-22T14:00:30.000Z' }, { start: '08:00:00', hours: 9 })
    const result = classifier().checkInStatus(day, 30, 10, false, CDMX)
    assert.equal(result.assist.checkInStatus, 'ontime')
  })

  test('verano CDMX: 08:55 (14:55Z) supera la tolerancia de falta y es falta', ({ assert }) => {
    const day = buildDay('2026-07-22', { checkIn: '2026-07-22T14:55:00.000Z' }, { start: '08:00:00', hours: 9 })
    const result = classifier().checkInStatus(day, 30, 10, false, CDMX)
    assert.equal(result.assist.checkInStatus, 'fault')
  })

  test('Ciudad Juárez en invierno: 08:00 es 15:00Z; 14:00Z sería una hora antes y sigue a tiempo', ({
    assert,
  }) => {
    const puntual = buildDay('2026-01-14', { checkIn: '2026-01-14T15:00:00.000Z' }, { start: '08:00:00', hours: 9 })
    assert.equal(classifier().checkInStatus(puntual, 30, 10, false, JUAREZ).assist.checkInStatus, 'ontime')
    // El mismo instante leído como si fuera CDMX (UTC-6) parece 09:00: falta. La zona decide.
    assert.equal(classifier().checkInStatus(puntual, 30, 10, false, CDMX).assist.checkInStatus, 'fault')
  })

  test('Ciudad Juárez en verano sí aplica horario de verano: 08:00 es 14:00Z', ({ assert }) => {
    const day = buildDay('2026-07-22', { checkIn: '2026-07-22T14:05:00.000Z' }, { start: '08:00:00', hours: 9 })
    const result = classifier().checkInStatus(day, 30, 10, false, JUAREZ)
    assert.equal(result.assist.checkInStatus, 'tolerance')
  })

  test('Tijuana: 08:00 es 15:00Z en verano y 16:00Z en invierno', ({ assert }) => {
    const verano = buildDay('2026-07-22', { checkIn: '2026-07-22T15:00:00.000Z' }, { start: '08:00:00', hours: 9 })
    assert.equal(classifier().checkInStatus(verano, 30, 10, false, TIJUANA).assist.checkInStatus, 'ontime')
    const invierno = buildDay('2026-01-14', { checkIn: '2026-01-14T16:12:00.000Z' }, { start: '08:00:00', hours: 9 })
    assert.equal(classifier().checkInStatus(invierno, 30, 10, false, TIJUANA).assist.checkInStatus, 'delay')
  })

  test('los segundos no cuentan: 08:00:59 es a tiempo y 08:01:00 ya es tolerancia', ({ assert }) => {
    const limite = buildDay('2026-07-22', { checkIn: '2026-07-22T14:00:59.000Z' }, { start: '08:00:00', hours: 9 })
    assert.equal(classifier().checkInStatus(limite, 30, 10, false, CDMX).assist.checkInStatus, 'ontime')
    const minuto = buildDay('2026-07-22', { checkIn: '2026-07-22T14:01:00.000Z' }, { start: '08:00:00', hours: 9 })
    assert.equal(classifier().checkInStatus(minuto, 30, 10, false, CDMX).assist.checkInStatus, 'tolerance')
  })

  test('sin entrada ni salida es falta; un colaborador discriminado no se evalúa', ({ assert }) => {
    const sinChecadas = buildDay('2026-07-22', {})
    assert.equal(classifier().checkInStatus(sinChecadas, 30, 10, false, CDMX).assist.checkInStatus, 'fault')
    const discriminado = buildDay('2026-07-22', { checkIn: '2026-07-22T16:00:00.000Z' })
    assert.equal(classifier().checkInStatus(discriminado, 30, 10, true, CDMX).assist.checkInStatus, '')
  })
})
