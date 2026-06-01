import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import BusinessUnit from '#models/business_unit'

/**
 * @swagger
 * components:
 *   schemas:
 *     EmpresaContratante:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         razonSocial:
 *           type: string
 *         rfc:
 *           type: string
 *         domicilioFiscal:
 *           type: string
 *         representanteLegal:
 *           type: string
 *           nullable: true
 *         correo:
 *           type: string
 *           nullable: true
 *         telefono:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class EmpresaContratante extends compose(BaseModel, SoftDeletes) {
  static table = 'empresas_contratantes'

  @column({ isPrimary: true })
  declare empresaContratanteId: number

  @column()
  declare businessUnitId: number

  @column({ columnName: 'empresa_contratante_razon_social' })
  declare razonSocial: string

  @column({ columnName: 'empresa_contratante_rfc' })
  declare rfc: string

  @column({ columnName: 'empresa_contratante_domicilio_fiscal' })
  declare domicilioFiscal: string

  @column({ columnName: 'empresa_contratante_representante_legal' })
  declare representanteLegal: string | null

  @column({ columnName: 'empresa_contratante_correo' })
  declare correo: string | null

  @column({ columnName: 'empresa_contratante_telefono' })
  declare telefono: string | null

  @column.dateTime({ columnName: 'empresa_contratante_created_at', autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({
    columnName: 'empresa_contratante_updated_at',
    autoCreate: true,
    autoUpdate: true,
  })
  declare updatedAt: DateTime | null

  @column.dateTime({ columnName: 'empresa_contratante_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  /**
   * Restringe la consulta a las unidades de negocio permitidas del tenant.
   */
  static forAllowedBusinessUnits(
    query: ModelQueryBuilderContract<typeof EmpresaContratante>,
    allowedBusinessUnitIds: number[]
  ) {
    return query
      .whereNull('empresa_contratante_deleted_at')
      .whereIn('business_unit_id', allowedBusinessUnitIds)
  }
}
