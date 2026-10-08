/**
 * Contrato de dependencia que expone VLRH-H1791306074375.
 *
 * Lo consumen VLRH-H1790812613870, VLRH-H1791306076849, VLRH-H1791306075599 y
 * VLRH-H1791306081115, este último desde un cron sin contexto HTTP. La unión
 * discriminada por `isDefault` es el contrato: no se aplana a campos opcionales
 * ni se usa `?? 0` en importes (`null` significa "la empresa no propone monto").
 */

/** Valores efectivos de los ajustes de teletrabajo de una empresa. */
export interface TeleworkComplianceValues {
  /** Periodicidad de revalidación, entera de 1 a 12 meses. */
  revalidationPeriodMonths: number
  /** Ventana de aviso, entera de 1 a (meses * 30 - 1) días. */
  expirationNoticeDays: number
  /** Monto mensual por defecto de luz en MXN, o `null` si no se propone. */
  electricityAllowanceDefault: number | null
  /** Monto mensual por defecto de internet en MXN, o `null` si no se propone. */
  internetAllowanceDefault: number | null
  /** Cuota mensual por uso de equipo propio en MXN, o `null` si no se propone. */
  ownEquipmentFeeDefault: number | null
}

/**
 * Resultado de `getEffective`/`upsert`: los valores del sistema (`isDefault:
 * true`, sin fila) o los de la empresa (`isDefault: false`, con fila).
 */
export type TeleworkComplianceSettingEffective =
  | (TeleworkComplianceValues & {
      isDefault: true
      teleworkComplianceSettingId: null
      updatedAt: null
      updatedByName: null
    })
  | (TeleworkComplianceValues & {
      isDefault: false
      teleworkComplianceSettingId: number
      updatedAt: string
      updatedByName: string
    })

/** Payload del `upsert`: los cinco valores obligatorios del PUT de reemplazo. */
export type UpsertTeleworkComplianceSettingInput = TeleworkComplianceValues
