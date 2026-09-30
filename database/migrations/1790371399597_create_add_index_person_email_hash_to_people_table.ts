import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Índice SIMPLE, NO ÚNICO, sobre `people.person_email_hash` (USRH1789762889970).
 *
 * Cierra el canal del TIEMPO DE RESPUESTA, que ningún texto tapa: hoy la
 * columna no tiene índice (`1782900000011` solo la agrega), así que un acierto
 * corta el escaneo en la primera fila que casa y un fallo ESCANEA `people`
 * ENTERA. La diferencia es medible desde fuera y crece con la tabla.
 *
 * NO es el UNIQUE que quedó fuera del set (ése es alcance aparte): no requiere
 * censo previo de duplicados y no puede fallar por datos existentes. De paso
 * arregla que hoy cada alta de persona escanee la tabla completa.
 */
export default class extends BaseSchema {
  protected tableName = 'people'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.index(['person_email_hash'], 'people_person_email_hash_index')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['person_email_hash'], 'people_person_email_hash_index')
    })
  }
}
