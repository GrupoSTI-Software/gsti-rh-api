import { test } from '@japa/runner'
import SyncAssistsService from '#services/sync_assists_service'
import Employee from '#models/employee'
import { AssistDayInterface } from '../../../app/interfaces/assist_day_interface.js'
import { ShiftInterface } from '../../../app/interfaces/shift_interface.js'
import { ShiftExceptionInterface } from '../../../app/interfaces/shift_exception_interface.js'

/**
 * Día de incapacidad en el calendario de asistencia.
 *
 * La incapacidad por maternidad salía como excepción genérica (`exception`) y
 * el backoffice la pintaba "a tiempo"; ahora marca el día como incapacidad
 * igual que la falta por incapacidad.
 */

type Rules = {
  isWorkDisabilityDate(
    employeeId: number | undefined,
    checkAssist: AssistDayInterface,
    employee: Employee | null
  ): AssistDayInterface
}

function rules(): Rules {
  return new SyncAssistsService() as unknown as Rules
}

function buildDay(slug: string, enjoymentOfSalary: number): AssistDayInterface {
  const exception = {
    shiftExceptionEnjoymentOfSalary: enjoymentOfSalary,
    exceptionType: { exceptionTypeSlug: slug },
  } as unknown as ShiftExceptionInterface
  return {
    day: '2026-07-22',
    assist: {
      checkIn: null,
      checkOut: null,
      checkEatIn: null,
      checkEatOut: null,
      dateShift: { shiftTimeStart: '08:00:00', shiftActiveHours: 10 } as unknown as ShiftInterface,
      checkInStatus: 'fault',
      checkOutStatus: 'fault',
      isWorkDisabilityDate: false,
      hasExceptions: true,
      exceptions: [exception],
    },
  } as unknown as AssistDayInterface
}

const employee = new Employee()

test.group('SyncAssistsService.isWorkDisabilityDate', () => {
  test('la incapacidad por maternidad marca el día como incapacidad', ({ assert }) => {
    const result = rules().isWorkDisabilityDate(1, buildDay('incapacidad-por-maternidad', 1), employee)
    assert.isTrue(result.assist.isWorkDisabilityDate)
    assert.equal(result.assist.checkInStatus, '')
  })

  test('la falta por incapacidad sigue marcando el día como incapacidad', ({ assert }) => {
    const result = rules().isWorkDisabilityDate(1, buildDay('falta-por-incapacidad', 1), employee)
    assert.isTrue(result.assist.isWorkDisabilityDate)
  })

  test('otro tipo de excepción no es incapacidad', ({ assert }) => {
    const result = rules().isWorkDisabilityDate(1, buildDay('nuevo-ingreso', 1), employee)
    assert.isFalse(result.assist.isWorkDisabilityDate)
  })
})
