import vine from '@vinejs/vine'

export const createNoticeValidator = vine.compile(
  vine.object({
    noticeSubject: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(500),
    noticeDescription: vine
      .string()
      .trim()
      .minLength(1),
    recipientEmployeeIds: vine
      .array(vine.number())
      .optional(),
  })
)

export const updateNoticeValidator = vine.compile(
  vine.object({
    noticeSubject: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(500),
    noticeDescription: vine
      .string()
      .trim()
      .minLength(1),
  })
)
