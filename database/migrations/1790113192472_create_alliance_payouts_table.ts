import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Liquidaciones de alianza (USRH1787719056820): deja escrito que GSTI ya
 * le pagó a la alianza un conjunto de comisiones concretas.
 *
 * Un solo archivo crea las dos tablas, sin `await this.schema`.
 *
 * `alliance_payouts`: cabecera de la liquidación. Trae ya las tres
 * columnas de anulación (las escribe USRH1787719056821); nacen vacías.
 * Sin borrado lógico: la liquidación se anula, no se borra.
 *
 * `alliance_payout_commissions`: pivote inmutable liquidación↔comisión.
 * La garantía de "una comisión nunca en dos liquidaciones vivas" la da
 * el UNIQUE sobre la columna generada VIRTUAL `alliance_payout_commission_is_live`
 * (1 si `alliance_payout_commission_annulled_at IS NULL`, si no NULL).
 * MySQL ignora los NULL en un UNIQUE: al anular, la comisión queda libre.
 * Columna y UNIQUE van con `this.schema.raw` fuera de `createTable`.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('alliance_payouts', (table) => {
      table.increments('alliance_payout_id').notNullable()

      table
        .integer('alliance_id')
        .unsigned()
        .notNullable()
        .references('alliance_id')
        .inTable('alliances')
        .onDelete('RESTRICT')

      table
        .date('alliance_payout_paid_on')
        .notNullable()
        .comment('Día en que GSTI le pagó a la alianza, hora de México')

      table
        .string('alliance_payout_reference', 160)
        .notNullable()
        .comment('Referencia con la que se reconoce la transferencia; texto libre de una línea')

      table
        .integer('alliance_payout_amount_cents')
        .unsigned()
        .notNullable()
        .comment('Suma de las comisiones incluidas, calculada por el servidor y congelada')

      table
        .integer('alliance_payout_created_by_user_id')
        .unsigned()
        .notNullable()

      table
        .foreign('alliance_payout_created_by_user_id', 'alliance_payouts_created_by_user_fk')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      // Las tres siguientes nacen vacías; las escribe USRH1787719056821.
      table.timestamp('alliance_payout_annulled_at').nullable()
      table.string('alliance_payout_annulment_reason', 500).nullable()

      table.integer('alliance_payout_annulled_by_user_id').unsigned().nullable()

      table
        .foreign('alliance_payout_annulled_by_user_id', 'alliance_payouts_annulled_by_user_fk')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').nullable()

      // Para el historial de liquidaciones de una alianza (USRH1787719056821)
      table.index(
        ['alliance_id', 'alliance_payout_paid_on', 'alliance_payout_id'],
        'idx_alliance_payouts_alliance_paid_on'
      )
    })

    this.schema.createTable('alliance_payout_commissions', (table) => {
      table.increments('alliance_payout_commission_id').notNullable()

      table
        .integer('alliance_payout_id')
        .unsigned()
        .notNullable()
        .references('alliance_payout_id')
        .inTable('alliance_payouts')
        .onDelete('RESTRICT')

      table
        .integer('alliance_commission_id')
        .unsigned()
        .notNullable()
        .references('alliance_commission_id')
        .inTable('alliance_commissions')
        .onDelete('RESTRICT')

      // NULL = viva (comisión pagada). No NULL = anulada por USRH1787719056821,
      // misma transacción que escribe la anulación de la cabecera.
      table.timestamp('alliance_payout_commission_annulled_at').nullable()

      table.timestamp('created_at').notNullable().defaultTo(this.now())

      table.index(['alliance_payout_id'], 'idx_alliance_payout_commissions_payout')
    })

    this.schema.raw(`
      ALTER TABLE \`alliance_payout_commissions\`
      ADD COLUMN \`alliance_payout_commission_is_live\` TINYINT UNSIGNED
        GENERATED ALWAYS AS (
          CASE WHEN \`alliance_payout_commission_annulled_at\` IS NULL
               THEN 1 ELSE NULL END
        ) VIRTUAL
    `)

    this.schema.raw(`
      ALTER TABLE \`alliance_payout_commissions\`
      ADD UNIQUE KEY \`alliance_payout_commissions_commission_live_unique\`
        (\`alliance_commission_id\`, \`alliance_payout_commission_is_live\`)
    `)
  }

  async down() {
    this.schema.dropTableIfExists('alliance_payout_commissions')
    this.schema.dropTableIfExists('alliance_payouts')
  }
}
