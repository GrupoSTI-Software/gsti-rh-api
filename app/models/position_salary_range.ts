import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'
import encryption from '@adonisjs/core/services/encryption'
import BusinessUnit from './business_unit.js'
import Position from './position.js'
import User from './user.js'
import PositionSalaryRangeAudit from './position_salary_range_audit.js'

/**
 * @swagger
 * components:
 *   schemas:
 *      PositionSalaryRange:
 *        type: object
 *        properties:
 *          positionSalaryRangeId:
 *            type: number
 *            description: Identificador del rango salarial
 *          businessUnitId:
 *            type: number
 *            description: Razón social (FK a business_units)
 *          positionId:
 *            type: number
 *            description: Puesto (FK a positions)
 *          minSalaryDaily:
 *            type: number
 *            description: Salario mínimo diario (cifrado en BD)
 *          maxSalaryDaily:
 *            type: number
 *            description: Salario máximo diario (cifrado en BD)
 *          validFrom:
 *            type: string
 *            description: Inicio de vigencia
 *          validTo:
 *            type: string
 *            description: Fin de vigencia (null = vigente)
 *          createdBy:
 *            type: number
 *            description: Usuario que creó el registro
 *          positionSalaryRangeCreatedAt:
 *            type: string
 *          positionSalaryRangeUpdatedAt:
 *            type: string
 *          positionSalaryRangeDeletedAt:
 *            type: string
 */
export default class PositionSalaryRange extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  @column({ isPrimary: true })
  declare positionSalaryRangeId: number

  @column()
  declare businessUnitId: number

  @column()
  declare positionId: number

  /**
   * Salario mínimo diario — cifrado AES-256-CBC en reposo (LFPDPPP).
   * `prepare` cifra antes de persistir; `consume` descifra al leer desde BD.
   */
  @column({
    prepare: (value: number | string) => encryption.encrypt(String(value)),
    consume: (value: string) => {
      try {
        return Number(encryption.decrypt(value))
      } catch {
        return value
      }
    },
  })
  declare minSalaryDaily: number

  /**
   * Salario máximo diario — cifrado AES-256-CBC en reposo (LFPDPPP).
   */
  @column({
    prepare: (value: number | string) => encryption.encrypt(String(value)),
    consume: (value: string) => {
      try {
        return Number(encryption.decrypt(value))
      } catch {
        return value
      }
    },
  })
  declare maxSalaryDaily: number

  @column.date()
  declare validFrom: DateTime

  @column.date()
  declare validTo: DateTime | null

  @column()
  declare createdBy: number

  @column.dateTime({ autoCreate: true })
  declare positionSalaryRangeCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare positionSalaryRangeUpdatedAt: DateTime

  @column.dateTime({ columnName: 'position_salary_range_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @belongsTo(() => Position, {
    foreignKey: 'positionId',
  })
  declare position: BelongsTo<typeof Position>

  @belongsTo(() => User, {
    foreignKey: 'createdBy',
  })
  declare creator: BelongsTo<typeof User>

  @hasMany(() => PositionSalaryRangeAudit, {
    foreignKey: 'rangeId',
  })
  declare auditLogs: HasMany<typeof PositionSalaryRangeAudit>
}
