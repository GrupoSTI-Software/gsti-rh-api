import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import encryption from '@adonisjs/core/services/encryption'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import BusinessUnit from '#models/business_unit'
import BranchOffice from '#models/branch_office'
import ContratoServicioEspecializado from '#models/contrato_servicio_especializado'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'

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
export default class EmpresaContratante extends compose(
  BaseModel,
  SoftDeletes,
  withBusinessUnitScope()
) {
  static table = 'empresas_contratantes'

  @column({ isPrimary: true })
  declare empresaContratanteId: number

  @column()
  declare businessUnitId: number

  @column({ columnName: 'empresa_contratante_razon_social' })
  declare razonSocial: string

  /**
   * RFC de la empresa contratante — cifrado AES-256-CBC en reposo (LFPDPPP art. 3.VI,
   * dato de identificación fiscal). Columna ampliada a VARCHAR(191).
   * La unicidad fiscal se impone sobre `empresa_contratante_rfc_hash`
   * (UNIQUE: business_unit_id + rfc_hash + is_active) desde USRH1782854998788.
   */
  @column({
    columnName: 'empresa_contratante_rfc',
    prepare: (value: string | null) =>
      value !== null && value !== undefined ? encryption.encrypt(value) : null,
    consume: (value: string | null) => {
      if (value === null || value === undefined) return null
      try {
        return encryption.decrypt<string>(value)
      } catch {
        return null
      }
    },
  })
  declare rfc: string | null

  /** Huella HMAC-SHA256 del RFC normalizado. Uso interno; no se serializa en respuestas. */
  @column({ columnName: 'empresa_contratante_rfc_hash', serializeAs: null })
  declare rfcHash: string | null

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

  @hasMany(() => ContratoServicioEspecializado, {
    foreignKey: 'empresaContratanteId',
    localKey: 'empresaContratanteId',
  })
  declare contratosServiciosEspecializados: HasMany<typeof ContratoServicioEspecializado>

  @hasMany(() => BranchOffice, {
    foreignKey: 'empresaContratanteId',
    localKey: 'empresaContratanteId',
    onQuery: (query) => {
      query.whereNull('branch_office_deleted_at')
    },
  })
  declare sitiosServicio: HasMany<typeof BranchOffice>

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
