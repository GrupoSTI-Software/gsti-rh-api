import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { TenantContext } from '#utils/tenant_context'
import type { OffboardingConceptSource } from '#modules/employee-offboarding/concepts/concepts.constants'

/**
 * @swagger
 * components:
 *   schemas:
 *     OffboardingConcept:
 *       type: object
 *       properties:
 *         offboardingConceptId:
 *           type: number
 *           description: Identificador del concepto de salida
 *         offboardingConceptName:
 *           type: string
 *           description: Nombre del concepto (único por empresa entre vivos)
 *         offboardingConceptDescription:
 *           type: string
 *           nullable: true
 *           description: Qué se espera exactamente de este concepto en cada salida
 *         offboardingConceptSource:
 *           type: string
 *           enum: [manual, employee_supplies]
 *           description: Origen del concepto; employee_supplies se arma con los activos asignados
 *         offboardingConceptRequiresEvidence:
 *           type: boolean
 *           description: Si exige comprobante al cumplirse (efecto en USRH1786568279593)
 *         offboardingConceptAllowsAmount:
 *           type: boolean
 *           description: Si admite capturar un importe al cumplirse (efecto en USRH1786568279590)
 *         offboardingConceptActive:
 *           type: boolean
 *           description: Todos nacen activos; desactivar llega con USRH1786568279584
 *         offboardingConceptOrder:
 *           type: number
 *           description: Lugar del concepto en la lista de su empresa
 *         offboardingConceptCreatedAt:
 *           type: string
 *           format: date-time
 *         offboardingConceptUpdatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         offboardingConceptDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class OffboardingConcept extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  @column({ isPrimary: true })
  declare offboardingConceptId: number

  /**
   * LÍMITE DEL MIXIN — leer antes de consultar este modelo fuera de una
   * request. `withBusinessUnitScope()` NO filtra nada sin `TenantContext`
   * activo (`app/mixins/with_business_unit_scope.ts:22-28`): el
   * `whereRaw('1 = 0')` solo aplica con contexto activo y alcance vacío.
   * Cualquier lectura de `offboarding_concepts` fuera de una request con
   * `businessScope()` — de forma señalada la apertura automática del
   * expediente de USRH1786568279587, que corre en `EmployeeService.delete`
   * sin contexto de tenant — debe filtrar `where('business_unit_id', …)` de
   * forma EXPLÍCITA, o devolverá el catálogo de todas las empresas.
   */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde la unidad activa del request (nunca del payload). */
  @beforeCreate()
  static assignBusinessUnitId(instance: OffboardingConcept) {
    if (instance.businessUnitId) return
    const [businessUnitId] = TenantContext.getScope()
    if (!businessUnitId) {
      throw new Error(
        'No se pudo resolver la unidad de negocio: no hay unidad activa en el alcance'
      )
    }
    instance.businessUnitId = businessUnitId
  }

  @column()
  declare offboardingConceptName: string

  @column()
  declare offboardingConceptDescription: string | null

  @column()
  declare offboardingConceptSource: OffboardingConceptSource

  /** MySQL persiste tinyint(1); `consume` garantiza true/false en el JSON. */
  @column({ consume: (value: unknown) => Boolean(value) })
  declare offboardingConceptRequiresEvidence: boolean

  /** MySQL persiste tinyint(1); `consume` garantiza true/false en el JSON. */
  @column({ consume: (value: unknown) => Boolean(value) })
  declare offboardingConceptAllowsAmount: boolean

  /** MySQL persiste tinyint(1); `consume` garantiza true/false en el JSON. */
  @column({ consume: (value: unknown) => Boolean(value) })
  declare offboardingConceptActive: boolean

  @column()
  declare offboardingConceptOrder: number

  @column.dateTime({ autoCreate: true })
  declare offboardingConceptCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare offboardingConceptUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'offboarding_concept_deleted_at' })
  declare deletedAt: DateTime | null
}
