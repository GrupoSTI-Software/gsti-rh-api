import factory from '@adonisjs/lucid/factories'
import ShiftException from '#models/shift_exception'

/**
 * Excepciones de turno (vacaciones, permisos, faltas, etc.).
 * Los campos obligatorios (`employeeId`, `exceptionTypeId`, fechas, `vacationSettingId`)
 * deben pasarse con `.merge()` desde el seeder.
 */
export const ShiftExceptionFactory = factory
  .define(ShiftException, ({ faker }) => {
    const baseDate = faker.date.recent({ days: 45 })
    return {
      employeeId: 0,
      exceptionTypeId: 0,
      shiftExceptionsDate: baseDate.toISOString().split('T')[0],
      shiftExceptionsDescription: faker.lorem.sentence(),
      shiftExceptionCheckInTime: null,
      shiftExceptionCheckOutTime: null,
      shiftExceptionEnjoymentOfSalary: null,
      shiftExceptionTimeByTime: null,
      workDisabilityPeriodId: null,
      vacationSettingId: null,
    }
  })
  .build()
