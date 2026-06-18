import vine from '@vinejs/vine'
import { COMPLAINT_CATEGORIES, COMPLAINT_STATUSES } from '#constants/complaint'

export const createComplaintValidator = vine.compile(
  vine.object({
    category: vine.enum(COMPLAINT_CATEGORIES),
    description: vine.string().trim().minLength(10).maxLength(10000),
  })
)

export const consultComplaintStatusValidator = vine.compile(
  vine.object({
    folio: vine.string().trim().minLength(5).maxLength(50),
    passphrase: vine.string().trim().minLength(6).maxLength(64),
  })
)

export const updateComplaintStatusValidator = vine.compile(
  vine.object({
    status: vine.enum(COMPLAINT_STATUSES),
  })
)

export type CreateComplaintPayload = Awaited<ReturnType<typeof createComplaintValidator.validate>>

export type ConsultComplaintStatusPayload = Awaited<
  ReturnType<typeof consultComplaintStatusValidator.validate>
>
