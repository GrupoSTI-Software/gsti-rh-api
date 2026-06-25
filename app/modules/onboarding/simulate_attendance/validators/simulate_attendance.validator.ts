import vine from '@vinejs/vine'

export const simulateAttendanceValidator = vine.compile(
  vine.object({
    employeeId: vine.number().min(1),
    shiftId: vine.number().min(1),
    date: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
)

export type SimulateAttendancePayload = Awaited<
  ReturnType<typeof simulateAttendanceValidator.validate>
>
