import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Publicaciones de la foto hacia un checador (spec ADMS 7.3, decision D1).
 *
 * El equipo no acepta que le empujemos la imagen: la descarga el solo por una
 * URL. Esa URL es la unica puerta a una foto de una persona, asi que es un
 * token opaco de un solo uso practico, con caducidad corta y guardado HASHEADO:
 * quien lea esta tabla no puede reconstruir el enlace.
 */
export default class extends BaseSchema {
  protected tableName = 'biometric_photo_publications'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('biometric_photo_publication_id')
      table.integer('business_unit_id').unsigned().notNullable()
      table.integer('employee_id').unsigned().notNullable()
      table.integer('access_point_id').unsigned().notNullable()

      /** sha256 del token en base64url. El claro solo vive en el payload. */
      table.string('biometric_photo_publication_token_hash', 64).notNullable()
      table.string('biometric_photo_publication_pin', 9).notNullable()
      table.integer('biometric_photo_publication_derivative_version').unsigned().notNullable()
      table
        .enum('biometric_photo_publication_status', [
          'published',
          'downloaded',
          'expired',
          'withdrawn',
        ])
        .notNullable()
        .defaultTo('published')
      table.dateTime('biometric_photo_publication_expires_at').notNullable()
      table.dateTime('biometric_photo_publication_downloaded_at').nullable()
      table.dateTime('biometric_photo_publication_withdrawn_at').nullable()
      table.integer('biometric_photo_publication_download_count').unsigned().notNullable().defaultTo(0)

      table.dateTime('biometric_photo_publication_created_at').notNullable()
      table.dateTime('biometric_photo_publication_updated_at').notNullable()

      table.unique(['biometric_photo_publication_token_hash'], 'uq_photo_publication_token')
      table.index(
        ['access_point_id', 'biometric_photo_publication_status'],
        'idx_photo_publication_device_status'
      )
      table.index(['employee_id'], 'idx_photo_publication_employee')
      table.index(
        ['biometric_photo_publication_status', 'biometric_photo_publication_expires_at'],
        'idx_photo_publication_expiry'
      )

      table
        .foreign('business_unit_id', 'fk_photo_publication_business_unit')
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')
      table
        .foreign('employee_id', 'fk_photo_publication_employee')
        .references('employee_id')
        .inTable('employees')
        .onDelete('RESTRICT')
      table
        .foreign('access_point_id', 'fk_photo_publication_access_point')
        .references('access_point_id')
        .inTable('access_points')
        .onDelete('RESTRICT')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
