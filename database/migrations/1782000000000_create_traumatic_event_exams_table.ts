import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'traumatic_event_exams'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('traumatic_event_exam_id').notNullable()

      table.integer('traumatic_event_report_id').unsigned().notNullable()
      table.enum('traumatic_event_exam_type', ['medical', 'psychological']).notNullable()
      table.date('traumatic_event_exam_performed_at').notNullable()
      table.string('traumatic_event_exam_performed_by', 150).notNullable()
      table
        .enum('traumatic_event_exam_outcome', ['fit', 'needs_follow_up', 'referred'])
        .notNullable()
      table.string('traumatic_event_exam_notes', 500).nullable()
      table.integer('traumatic_event_exam_captured_by_user_id').unsigned().notNullable()

      table.timestamp('traumatic_event_exam_created_at').notNullable()
      table.timestamp('traumatic_event_exam_updated_at').nullable()
      table.timestamp('traumatic_event_exam_deleted_at').nullable()

      table
        .foreign('traumatic_event_report_id', 'fk_tex_report_id')
        .references('traumatic_event_report_id')
        .inTable('traumatic_event_reports')
        .onDelete('RESTRICT')

      table
        .foreign('traumatic_event_exam_captured_by_user_id', 'fk_tex_captured_by_user_id')
        .references('user_id')
        .inTable('users')
        .onDelete('RESTRICT')

      table.index(['traumatic_event_report_id'], 'idx_tex_report_id')
      table.index(['traumatic_event_exam_performed_at'], 'idx_tex_performed_at')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
