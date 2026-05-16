import factory from '@adonisjs/lucid/factories'
import { DateTime } from 'luxon'
import ExceptionRequest from '#models/exception_request'

/**
 * Solicitud de permiso / excepción pendiente de aprobación.
 * Requiere `.merge({ employeeId, exceptionTypeId, userId })`.
 */
export const ExceptionRequestFactory = factory
  .define(ExceptionRequest, ({ faker }) => {
    const requested = DateTime.fromJSDate(faker.date.soon({ days: 14 }))
    return {
      employeeId: 0,
      exceptionTypeId: 0,
      exceptionRequestStatus: 'accepted' as const,
      exceptionRequestDescription: faker.lorem.sentence(),
      exceptionRequestCheckInTime: null,
      exceptionRequestCheckOutTime: null,
      exceptionRequestPeriodInHours: null,
      requestedDate: requested.toISODate()!,
      exceptionRequestRhRead: 1,
      exceptionRequestGerencialRead: 1,
      userId: 0,
    }
  })
  .build()
