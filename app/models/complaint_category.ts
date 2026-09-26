import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'

/**
 * @swagger
 * components:
 *   schemas:
 *     ComplaintCategory:
 *       type: object
 *       properties:
 *         complaintCategoryId:
 *           type: number
 *           description: ID interno de la categoría del buzón
 *         complaintCategorySlug:
 *           type: string
 *           description: Identificador estable de la categoría (contrato con clientes)
 *         complaintCategoryActive:
 *           type: number
 *           description: 1 activa, 0 inactiva
 *         complaintCategoryOrder:
 *           type: number
 *           description: Orden de presentación en catálogos
 *         complaintCategoryCreatedAt:
 *           type: string
 *           format: date-time
 *         complaintCategoryUpdatedAt:
 *           type: string
 *           format: date-time
 *         complaintCategoryDeletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *     ComplaintCategoryCatalogItem:
 *       type: object
 *       description: Categoría activa del buzón con etiqueta ya traducida por el API
 *       properties:
 *         complaintCategoryId:
 *           type: integer
 *           example: 1
 *         complaintCategorySlug:
 *           type: string
 *           example: violencia-laboral
 *         complaintCategoryLabel:
 *           type: string
 *           example: Violencia laboral
 */
export default class ComplaintCategory extends compose(BaseModel, SoftDeletes) {
  static table = 'complaint_categories'

  @column({ isPrimary: true })
  declare complaintCategoryId: number

  @column()
  declare complaintCategorySlug: string

  @column()
  declare complaintCategoryActive: number

  @column()
  declare complaintCategoryOrder: number

  @column.dateTime({ autoCreate: true })
  declare complaintCategoryCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare complaintCategoryUpdatedAt: DateTime

  @column.dateTime({ columnName: 'complaint_category_deleted_at' })
  declare deletedAt: DateTime | null
}
