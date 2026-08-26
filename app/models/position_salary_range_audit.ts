import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'
import encryption from '@adonisjs/core/services/encryption'
import User from './user.js'
import PositionSalaryRange from './position_salary_range.js'
import { sensitiveSerializeNumeric } from '#helpers/sensitive_serialize'

export type SalaryRangeAuditAction = 'create' | 'update' | 'close'

/**
 * @swagger
 * components:
 *   schemas:
 *      PositionSalaryRangeAudit:
 *        type: object
 *        properties:
 *          positionSalaryRangeAuditId:
 *            type: number
 *            description: Identificador del registro de auditoría
 *          rangeId:
 *            type: number
 *            description: FK al rango salarial auditado
 *          action:
 *            type: string
 *            enum: [create, update, close]
 *            description: Tipo de operación registrada
 *          oldMinSalaryDaily:
 *            type: number
 *            description: Mínimo anterior cifrado (null en acción create)
 *          oldMaxSalaryDaily:
 *            type: number
 *            description: Máximo anterior cifrado (null en acción create)
 *          newMinSalaryDaily:
 *            type: number
 *            description: Mínimo nuevo cifrado (null en acción close)
 *          newMaxSalaryDaily:
 *            type: number
 *            description: Máximo nuevo cifrado (null en acción close)
 *          actorId:
 *            type: number
 *            description: Usuario que realizó la operación
 *          reason:
 *            type: string
 *            description: Motivo del cambio (opcional)
 *          positionSalaryRangeAuditCreatedAt:
 *            type: string
 *          positionSalaryRangeAuditDeletedAt:
 *            type: string
 */
export default class PositionSalaryRangeAudit extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  static table = 'position_salary_range_audit'

  @column({ isPrimary: true })
  declare positionSalaryRangeAuditId: number

  @column()
  declare rangeId: number

  /**
   * Marca de pertenencia propia (defensa en profundidad, ESB-07-08-03-08).
   * Derivada de `position_salary_ranges.business_unit_id` vía `rangeId`.
   */
  @column()
  declare businessUnitId: number

  /** Resuelve businessUnitId desde position_salary_ranges (ESB-07-08-03-08). */
  @beforeCreate()
  static async assignBusinessUnitId(instance: PositionSalaryRangeAudit) {
    if (instance.businessUnitId) return
    instance.businessUnitId = await resolveParentBusinessUnitId(
      () => PositionSalaryRange.query().where('positionSalaryRangeId', instance.rangeId).first(),
      'el rango salarial'
    )
  }

  @column()
  declare action: SalaryRangeAuditAction

  /**
   * Valor anterior cifrado — null en acción 'create' (no había valor previo).
   */
  @column({
    prepare: (value: number | string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(String(value)) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) return null
      try {
        return Number(encryption.decrypt(value))
      } catch {
        return value
      }
    },
    serialize: sensitiveSerializeNumeric('PositionSalaryRangeAudit', 'oldMinSalaryDaily'),
  })
  declare oldMinSalaryDaily: number | null

  /**
   * Valor anterior cifrado — null en acción 'create'.
   */
  @column({
    prepare: (value: number | string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(String(value)) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) return null
      try {
        return Number(encryption.decrypt(value))
      } catch {
        return value
      }
    },
    serialize: sensitiveSerializeNumeric('PositionSalaryRangeAudit', 'oldMaxSalaryDaily'),
  })
  declare oldMaxSalaryDaily: number | null

  /**
   * Valor nuevo cifrado — null en acción 'close' (no hay valor nuevo).
   */
  @column({
    prepare: (value: number | string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(String(value)) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) return null
      try {
        return Number(encryption.decrypt(value))
      } catch {
        return value
      }
    },
    serialize: sensitiveSerializeNumeric('PositionSalaryRangeAudit', 'newMinSalaryDaily'),
  })
  declare newMinSalaryDaily: number | null

  /**
   * Valor nuevo cifrado — null en acción 'close'.
   */
  @column({
    prepare: (value: number | string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(String(value)) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) return null
      try {
        return Number(encryption.decrypt(value))
      } catch {
        return value
      }
    },
    serialize: sensitiveSerializeNumeric('PositionSalaryRangeAudit', 'newMaxSalaryDaily'),
  })
  declare newMaxSalaryDaily: number | null

  @column()
  declare actorId: number

  @column()
  declare reason: string | null

  @column.dateTime({ autoCreate: true })
  declare positionSalaryRangeAuditCreatedAt: DateTime

  @column.dateTime({ columnName: 'position_salary_range_audit_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => PositionSalaryRange, {
    foreignKey: 'rangeId',
    localKey: 'positionSalaryRangeId',
  })
  declare salaryRange: BelongsTo<typeof PositionSalaryRange>

  @belongsTo(() => User, {
    foreignKey: 'actorId',
  })
  declare actor: BelongsTo<typeof User>
}
