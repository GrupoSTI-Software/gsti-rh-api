import { BaseSchema } from '@adonisjs/lucid/schema'

const REASONS_BEFORE = [
  'unknown_pin',
  'employee_terminated',
  'ambiguous_code',
  'pin_quarantined',
  'ingestion_rejected',
]
const REASONS_AFTER = [...REASONS_BEFORE, 'shared_device_no_pivot']

const enumSql = (values: string[]) => values.map((value) => `'${value}'`).join(', ')

/** PIN sin pivote en un checador compartido: no se adivina por codigo (VLRH-P0065, D7). */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(
      `ALTER TABLE \`adms_held_punches\`
         MODIFY \`adms_held_punch_reason\` ENUM(${enumSql(REASONS_AFTER)}) NOT NULL`
    )
  }

  async down() {
    this.schema.raw(
      `UPDATE \`adms_held_punches\` SET \`adms_held_punch_reason\` = 'unknown_pin'
        WHERE \`adms_held_punch_reason\` = 'shared_device_no_pivot'`
    )
    this.schema.raw(
      `ALTER TABLE \`adms_held_punches\`
         MODIFY \`adms_held_punch_reason\` ENUM(${enumSql(REASONS_BEFORE)}) NOT NULL`
    )
  }
}
