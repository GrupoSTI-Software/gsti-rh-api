import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export default class Gallery extends BaseModel {
  @column({ isPrimary: true, columnName: 'galery_id' })
  id!: number

  @column({ columnName: 'galery_path' })
  galeryPath!: string

  @column({ columnName: 'galery_category' })
  galeryCategory?: string

  @column({ columnName: 'galery_id_table' })
  galeryIdTable!: number

  @column({ columnName: 'galery_name_table' })
  galeryNameTable?: string

  @column.dateTime({ autoCreate: true, columnName: 'galery_created_at' })
  galeryCreatedAt!: DateTime

  @column.dateTime({ autoUpdate: true, columnName: 'galery_updated_at' })
  galeryUpdatedAt?: DateTime

  @column.dateTime({ columnName: 'galery_deleted_at' })
  galeryDeletedAt?: DateTime
}
