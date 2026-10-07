import vine from '@vinejs/vine'

/**
 * Validador del `PUT /api/nom037/telework-settings` (VLRH-H1791306074375).
 *
 * Solo exige presencia y tipo: la enteridad y los rangos los valida el servicio
 * de dominio (R3-R5) para responder la `key` y el `data.field` por campo
 * (CA-5/6/7). Por eso NO se usa `withoutDecimals()`: mataría con `TWS.VAL.001`
 * un valor no entero que el contrato exige reportar como `TWS.VAL.002`.
 */
export const upsertTeleworkComplianceSettingValidator = vine.compile(
  vine.object({
    revalidationPeriodMonths: vine.number(),
    expirationNoticeDays: vine.number(),
    electricityAllowanceDefault: vine.number().nullable(),
    internetAllowanceDefault: vine.number().nullable(),
    ownEquipmentFeeDefault: vine.number().nullable(),
  })
)

export type UpsertTeleworkComplianceSettingPayload = Awaited<
  ReturnType<typeof upsertTeleworkComplianceSettingValidator.validate>
>
