import vine from '@vinejs/vine'
import { REFORM_SIMULATION_TARGET_YEARS } from '#constants/reform_simulator'

/**
 * Validador del query de simulación de reforma de jornada.
 *
 * Exige targetYear en {2026, 2027, 2028, 2029, 2030}. La empresa se toma del
 * header X-Business-Unit-Id (ctx.businessUnitScope), no del query.
 */
export const simulateReformValidator = vine.compile(
  vine.object({
    targetYear: vine.number().in([...REFORM_SIMULATION_TARGET_YEARS]),
  })
)

export type SimulateReformPayload = Awaited<ReturnType<typeof simulateReformValidator.validate>>
