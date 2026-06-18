import vine from '@vinejs/vine'

export const uploadEmployeeCertificationValidator = vine.compile(
  vine.object({
    compliedAt: vine.date({ formats: ['YYYY-MM-DD'] }),
  })
)
