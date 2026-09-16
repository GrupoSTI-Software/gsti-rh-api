import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Key S3 del PNG del QR de la alianza (USRH1788505941895).
 * NULL = la imagen aún no se ha subido (transitorio, se repara solo).
 * El `down()` no borra objetos de S3: una migración no hace red.
 */
export default class extends BaseSchema {
  protected tableName = 'alliances'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .string('alliance_qr_storage_key', 255)
        .nullable()
        .comment('Key S3 devuelta por uploadPrivateBuffer. NULL = QR aún no subido.')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('alliance_qr_storage_key')
    })
  }
}
