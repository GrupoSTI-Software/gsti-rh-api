import vine from '@vinejs/vine'
import { DateTime } from 'luxon'

export const storeExceptionRequestValidator = vine.compile(
  vine.object({
    employeeId: vine.number().min(1),
    exceptionTypeId: vine.number().min(1),
    exceptionRequestStatus: vine.enum(['requested', 'pending', 'accepted', 'refused']),
    exceptionRequestDescription: vine.string().trim().maxLength(255).optional(),
    exceptionRequestCheckInTime: vine.string().trim().maxLength(10).optional(),
    exceptionRequestCheckOutTime: vine.string().trim().maxLength(10).optional(),
    exceptionRequestPeriodInHours: vine.number().min(0).optional(),
    requestedDate:
      vine.date().transform((value) => DateTime.fromJSDate(value)) || vine.string().maxLength(10),
    role: vine
      .object({
        roleId: vine.number().min(1),
        roleName: vine.string().trim().maxLength(50).optional(),
      })
      .optional(),
  })
)

export const updateExceptionRequestValidator = vine.compile(
  vine.object({
    exceptionRequestStatus: vine.enum(['requested', 'pending', 'accepted', 'refused']).optional(),
    exceptionRequestDescription: vine.string().trim().maxLength(255).optional(),
    requestedDate: vine.date().transform((value) => DateTime.fromJSDate(value)),
    exceptionRequestCheckInTime: vine.string().trim().maxLength(10).optional(),
    exceptionRequestCheckOutTime: vine.string().trim().maxLength(10).optional(),
    role: vine
      .object({
        roleId: vine.number().min(1),
        roleName: vine.string().trim().maxLength(50).optional(),
      })
      .optional(),
  })
)
