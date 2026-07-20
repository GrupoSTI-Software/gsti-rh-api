import { compose } from '@adonisjs/core/helpers'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { DateTime } from 'luxon'
import encryption from '@adonisjs/core/services/encryption'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import BusinessUnit from '#models/business_unit'
import ProveedorRepseValidacion from '#models/proveedor_repse_validacion'
import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'

/**
 * @swagger
 * components:
 *   schemas:
 *     ProveedorRepse:
 *       type: object
 *       properties:
 *         proveedorRepseId:
 *           type: integer
 *           description: Identificador único del proveedor REPSE.
 *         businessUnitId:
 *           type: integer
 *           description: Empresa contratante propietaria del catálogo (FK a business_units).
 *         razonSocial:
 *           type: string
 *           maxLength: 255
 *         rfc:
 *           type: string
 *           minLength: 12
 *           maxLength: 13
 *         folio:
 *           type: string
 *           maxLength: 50
 *           description: Folio REPSE asignado por la STPS al proveedor.
 *         objetoRegistrado:
 *           type: string
 *           description: Servicio que el folio del proveedor ampara.
 *         folioVencimiento:
 *           type: string
 *           format: date
 *         periodicidadMeses:
 *           type: integer
 *           minimum: 1
 *           description: Periodicidad de validación del folio, en meses (default 1 = mensual).
 *         nextReviewAt:
 *           type: string
 *           format: date
 *           nullable: true
 *           description: Próxima fecha de revisión (null si aún no tiene ninguna validación).
 *         proveedorRepseCreatedAt:
 *           type: string
 *           format: date-time
 *         proveedorRepseUpdatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         proveedorRepseDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 */
export default class ProveedorRepse extends compose(BaseModel, SoftDeletes, withBusinessUnitScope()) {
  static table = 'proveedores_repse'

  @column({ isPrimary: true })
  declare proveedorRepseId: number

  @column()
  declare businessUnitId: number

  @column({ columnName: 'proveedor_repse_razon_social' })
  declare razonSocial: string

  /**
   * RFC del proveedor — cifrado AES-256-CBC en reposo (LFPDPPP art. 3.VI, dato
   * de identificación fiscal), mismo patrón que `EmpresaContratante.rfc`. La
   * unicidad no se impone sobre este campo (un proveedor puede tener varios
   * folios en el tiempo); la unicidad de negocio vive sobre `folio`.
   */
  @column({
    columnName: 'proveedor_repse_rfc',
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
  @column({ columnName: 'proveedor_repse_rfc_hash', serializeAs: null })
  declare rfcHash: string | null

  @column({ columnName: 'proveedor_repse_folio' })
  declare folio: string

  @column({ columnName: 'proveedor_repse_objeto_registrado' })
  declare objetoRegistrado: string

  @column.date({ columnName: 'proveedor_repse_folio_vencimiento' })
  declare folioVencimiento: DateTime

  @column({ columnName: 'proveedor_repse_periodicidad_meses' })
  declare periodicidadMeses: number

  @column.date({ columnName: 'proveedor_repse_next_review_at' })
  declare nextReviewAt: DateTime | null

  @column.dateTime({ columnName: 'proveedor_repse_created_at', autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({
    columnName: 'proveedor_repse_updated_at',
    autoCreate: true,
    autoUpdate: true,
  })
  declare updatedAt: DateTime | null

  @column.dateTime({ columnName: 'proveedor_repse_deleted_at' })
  declare deletedAt: DateTime | null

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>

  @hasMany(() => ProveedorRepseValidacion, {
    foreignKey: 'proveedorRepseId',
    localKey: 'proveedorRepseId',
  })
  declare validaciones: HasMany<typeof ProveedorRepseValidacion>
}
