import { BaseSchema } from '@adonisjs/lucid/schema'
import db from '@adonisjs/lucid/services/db'

/**
 * Llaves foraneas que faltaban en las tablas del canal ADMS.
 *
 * Se escribieron sin ellas por descuido, no por diseño: el resto del repo si
 * las declara. Sin la llave, una columna `..._id` es una promesa que nadie
 * cumple -- puede apuntar a una fila que ya no existe y nadie se entera hasta
 * que una pantalla muestra un hueco.
 *
 * El `onDelete` NO es uniforme, y elegirlo mal rompe cosas distintas:
 *
 * - `RESTRICT` en lo que no debe desaparecer con gente viva detras: la empresa
 *   y el colaborador dueño de un biometrico. Borrar eso teniendo checadas o
 *   huellas colgando tiene que fallar y decirlo.
 *
 * - `SET NULL` en todo lo que el sistema PURGA por retencion -- crudos,
 *   comandos, publicaciones de foto -- y en el "quien lo hizo". Con `RESTRICT`,
 *   `adms:purge-retention` empezaria a fallar en cuanto un incidente citara un
 *   crudo vencido, y borrar a un usuario seria imposible por haber resuelto un
 *   incidente hace un año. El hecho sobrevive aunque su origen se purgue.
 *
 * `device_command_wire_id` NO lleva llave: es el numero que viaja al aparato
 * dentro del protocolo, no apunta a ninguna tabla.
 *
 * Antes de cada llave se anulan los huerfanos que pudiera haber, o la creacion
 * del indice falla sobre datos ya existentes.
 */
export default class extends BaseSchema {
  async up() {
    /** Anula referencias que no resuelven, para que la llave se pueda crear. */
    this.defer(async () => {
      const saneos: Array<[string, string, string, string]> = [
        ['adms_raw_messages', 'business_unit_id', 'business_units', 'business_unit_id'],
        ['adms_incidents', 'business_unit_id', 'business_units', 'business_unit_id'],
        ['adms_incidents', 'adms_raw_message_id', 'adms_raw_messages', 'adms_raw_message_id'],
        ['adms_incidents', 'device_command_id', 'device_commands', 'device_command_id'],
        ['adms_incidents', 'adms_incident_resolved_by_user_id', 'users', 'user_id'],
        ['adms_quarantined_devices', 'claimed_business_unit_id', 'business_units', 'business_unit_id'],
        ['adms_quarantined_devices', 'claimed_access_point_id', 'access_points', 'access_point_id'],
        ['adms_quarantined_devices', 'adms_quarantined_device_resolved_by_user_id', 'users', 'user_id'],
        ['access_point_stamps', 'access_point_stamp_reset_by_user_id', 'users', 'user_id'],
        ['adms_unmapped_pins', 'adms_unmapped_pin_resolved_by_user_id', 'users', 'user_id'],
        ['adms_unmapped_pins', 'linked_employee_id', 'employees', 'employee_id'],
        ['adms_held_punches', 'adms_raw_message_id', 'adms_raw_messages', 'adms_raw_message_id'],
        ['adms_held_punches', 'assist_id', 'assists', 'assist_id'],
        ['access_point_employees', 'last_device_command_id', 'device_commands', 'device_command_id'],
        ['assist_calendar_recalc_jobs', 'business_unit_id', 'business_units', 'business_unit_id'],
        ['assist_calendar_recalc_jobs', 'employee_id', 'employees', 'employee_id'],
        ['device_commands', 'employee_id', 'employees', 'employee_id'],
        ['device_commands', 'access_point_employee_id', 'access_point_employees', 'access_point_employee_id'],
        ['device_commands', 'biometric_template_id', 'biometric_templates', 'biometric_template_id'],
        ['device_commands', 'biometric_photo_publication_id', 'biometric_photo_publications', 'biometric_photo_publication_id'],
        ['device_commands', 'device_command_requested_by_user_id', 'users', 'user_id'],
        ['biometric_templates', 'employee_id', 'employees', 'employee_id'],
        ['biometric_templates', 'source_access_point_id', 'access_points', 'access_point_id'],
        ['adms_held_biometrics', 'biometric_template_id', 'biometric_templates', 'biometric_template_id'],
        ['access_point_employee_events', 'device_command_id', 'device_commands', 'device_command_id'],
        ['access_point_employee_events', 'access_point_employee_event_actor_user_id', 'users', 'user_id'],
      ]
      for (const [tabla, columna, padre, llave] of saneos) {
        await db.rawQuery(
          `UPDATE \`${tabla}\` AS \`h\`
           LEFT JOIN \`${padre}\` AS \`p\` ON \`p\`.\`${llave}\` = \`h\`.\`${columna}\`
           SET \`h\`.\`${columna}\` = NULL
           WHERE \`h\`.\`${columna}\` IS NOT NULL AND \`p\`.\`${llave}\` IS NULL`
        )
      }
    })

    /** Nunca `await this.schema`: los builders corren al terminar `up()`. */
    this.schema.alterTable('adms_raw_messages', (table) => {
      table.foreign('business_unit_id', 'fk_adms_raw_business_unit').references('business_unit_id').inTable('business_units').onDelete('RESTRICT')
    })

    this.schema.alterTable('adms_incidents', (table) => {
      table.foreign('business_unit_id', 'fk_adms_incident_business_unit').references('business_unit_id').inTable('business_units').onDelete('RESTRICT')
      table.foreign('adms_raw_message_id', 'fk_adms_incident_raw').references('adms_raw_message_id').inTable('adms_raw_messages').onDelete('SET NULL')
      table.foreign('device_command_id', 'fk_adms_incident_command').references('device_command_id').inTable('device_commands').onDelete('SET NULL')
      table.foreign('adms_incident_resolved_by_user_id', 'fk_adms_incident_user').references('user_id').inTable('users').onDelete('SET NULL')
    })

    this.schema.alterTable('adms_quarantined_devices', (table) => {
      table.foreign('claimed_business_unit_id', 'fk_quarantine_business_unit').references('business_unit_id').inTable('business_units').onDelete('SET NULL')
      table.foreign('claimed_access_point_id', 'fk_quarantine_access_point').references('access_point_id').inTable('access_points').onDelete('SET NULL')
      table.foreign('adms_quarantined_device_resolved_by_user_id', 'fk_quarantine_user').references('user_id').inTable('users').onDelete('SET NULL')
    })

    this.schema.alterTable('access_point_stamps', (table) => {
      table.foreign('access_point_stamp_reset_by_user_id', 'fk_stamp_reset_user').references('user_id').inTable('users').onDelete('SET NULL')
    })

    this.schema.alterTable('adms_unmapped_pins', (table) => {
      table.foreign('adms_unmapped_pin_resolved_by_user_id', 'fk_unmapped_pin_user').references('user_id').inTable('users').onDelete('SET NULL')
      table.foreign('linked_employee_id', 'fk_unmapped_pin_employee').references('employee_id').inTable('employees').onDelete('SET NULL')
    })

    this.schema.alterTable('adms_held_punches', (table) => {
      table.foreign('adms_raw_message_id', 'fk_held_punch_raw').references('adms_raw_message_id').inTable('adms_raw_messages').onDelete('SET NULL')
      table.foreign('assist_id', 'fk_held_punch_assist').references('assist_id').inTable('assists').onDelete('SET NULL')
    })

    this.schema.alterTable('access_point_employees', (table) => {
      table.foreign('last_device_command_id', 'fk_ape_last_command').references('device_command_id').inTable('device_commands').onDelete('SET NULL')
    })

    this.schema.alterTable('assist_calendar_recalc_jobs', (table) => {
      table.foreign('business_unit_id', 'fk_recalc_business_unit').references('business_unit_id').inTable('business_units').onDelete('RESTRICT')
      table.foreign('employee_id', 'fk_recalc_employee').references('employee_id').inTable('employees').onDelete('RESTRICT')
    })

    this.schema.alterTable('device_commands', (table) => {
      table.foreign('employee_id', 'fk_command_employee').references('employee_id').inTable('employees').onDelete('SET NULL')
      table.foreign('access_point_employee_id', 'fk_command_ape').references('access_point_employee_id').inTable('access_point_employees').onDelete('SET NULL')
      table.foreign('biometric_template_id', 'fk_command_template').references('biometric_template_id').inTable('biometric_templates').onDelete('SET NULL')
      table.foreign('biometric_photo_publication_id', 'fk_command_publication').references('biometric_photo_publication_id').inTable('biometric_photo_publications').onDelete('SET NULL')
      table.foreign('device_command_requested_by_user_id', 'fk_command_user').references('user_id').inTable('users').onDelete('SET NULL')
    })

    this.schema.alterTable('biometric_templates', (table) => {
      table.foreign('employee_id', 'fk_template_employee').references('employee_id').inTable('employees').onDelete('RESTRICT')
      table.foreign('source_access_point_id', 'fk_template_source_ap').references('access_point_id').inTable('access_points').onDelete('SET NULL')
    })

    this.schema.alterTable('adms_held_biometrics', (table) => {
      table.foreign('biometric_template_id', 'fk_held_bio_template').references('biometric_template_id').inTable('biometric_templates').onDelete('SET NULL')
    })

    this.schema.alterTable('access_point_employee_events', (table) => {
      table.foreign('device_command_id', 'fk_ape_event_command').references('device_command_id').inTable('device_commands').onDelete('SET NULL')
      table.foreign('access_point_employee_event_actor_user_id', 'fk_ape_event_user').references('user_id').inTable('users').onDelete('SET NULL')
    })
  }

  async down() {
    const bajas: Array<[string, string]> = [
      ['adms_raw_messages', 'fk_adms_raw_business_unit'],
      ['adms_incidents', 'fk_adms_incident_business_unit'],
      ['adms_incidents', 'fk_adms_incident_raw'],
      ['adms_incidents', 'fk_adms_incident_command'],
      ['adms_incidents', 'fk_adms_incident_user'],
      ['adms_quarantined_devices', 'fk_quarantine_business_unit'],
      ['adms_quarantined_devices', 'fk_quarantine_access_point'],
      ['adms_quarantined_devices', 'fk_quarantine_user'],
      ['access_point_stamps', 'fk_stamp_reset_user'],
      ['adms_unmapped_pins', 'fk_unmapped_pin_user'],
      ['adms_unmapped_pins', 'fk_unmapped_pin_employee'],
      ['adms_held_punches', 'fk_held_punch_raw'],
      ['adms_held_punches', 'fk_held_punch_assist'],
      ['access_point_employees', 'fk_ape_last_command'],
      ['assist_calendar_recalc_jobs', 'fk_recalc_business_unit'],
      ['assist_calendar_recalc_jobs', 'fk_recalc_employee'],
      ['device_commands', 'fk_command_employee'],
      ['device_commands', 'fk_command_ape'],
      ['device_commands', 'fk_command_template'],
      ['device_commands', 'fk_command_publication'],
      ['device_commands', 'fk_command_user'],
      ['biometric_templates', 'fk_template_employee'],
      ['biometric_templates', 'fk_template_source_ap'],
      ['adms_held_biometrics', 'fk_held_bio_template'],
      ['access_point_employee_events', 'fk_ape_event_command'],
      ['access_point_employee_events', 'fk_ape_event_user'],
    ]
    for (const [tabla, llave] of bajas) {
      this.schema.alterTable(tabla, (table) => {
        table.dropForeign([], llave)
      })
    }
  }
}
