/** Body de `POST /api/platform/alliances/:allianceId/payouts`. */
export interface CreateAlliancePayoutInput {
  commissionIds: number[]
  /** `YYYY-MM-DD`, día en que GSTI le pagó a la alianza (hora de México). */
  paidOn: string
  /** Referencia de una línea, hasta 160 caracteres. */
  reference: string
}

/**
 * Vista pública de una liquidación recién registrada. `USRH1787719056821`
 * extiende esta vista con estado, anulación y detalle; no la redefine.
 */
export interface AlliancePayoutView {
  alliancePayoutId: number
  allianceId: number
  /** `YYYY-MM-DD` */
  alliancePayoutPaidOn: string
  alliancePayoutReference: string
  alliancePayoutAmountCents: number
  alliancePayoutCommissionsCount: number
  /** Ascendente. */
  allianceCommissionIds: number[]
  alliancePayoutCreatedByUserId: number
  /** `"{person_firstname} {person_lastname}"` */
  alliancePayoutCreatedByName: string
  /** ISO-8601 */
  createdAt: string
}
