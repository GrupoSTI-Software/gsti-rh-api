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

export const complaintListValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).optional(),
    limit: vine.number().min(1).max(100).optional(),
    status: vine.enum(COMPLAINT_STATUSES).optional(),
    category: vine.enum(COMPLAINT_CATEGORIES).optional(),
  })
)

export const patchComplaintStatusValidator = vine.compile(
  vine.object({
    toStatus: vine.enum(COMPLAINT_STATUSES),
    note: vine.string().trim().maxLength(5000),
  })
)

export const revealComplaintIdentityValidator = vine.compile(
  vine.object({
    justification: vine.string().trim().minLength(1).maxLength(5000),
  })
)

/** @deprecated Usar patchComplaintStatusValidator */
export const updateComplaintStatusValidator = vine.compile(
  vine.object({
    status: vine.enum(COMPLAINT_STATUSES),
  })
)

export type CreateComplaintPayload = Awaited<ReturnType<typeof createComplaintValidator.validate>>

export type ConsultComplaintStatusPayload = Awaited<
  ReturnType<typeof consultComplaintStatusValidator.validate>
>

export type ComplaintListPayload = Awaited<ReturnType<typeof complaintListValidator.validate>>

export type PatchComplaintStatusPayload = Awaited<
  ReturnType<typeof patchComplaintStatusValidator.validate>
>

export type RevealComplaintIdentityPayload = Awaited<
  ReturnType<typeof revealComplaintIdentityValidator.validate>
>
