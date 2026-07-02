import vine from '@vinejs/vine'

export const nom035DisclosureQueryValidator = vine.compile(
  vine.object({
    branchOfficeId: vine.number().positive().optional(),
  })
)

export type Nom035DisclosureQueryInput = Awaited<
  ReturnType<typeof nom035DisclosureQueryValidator.validate>
>
