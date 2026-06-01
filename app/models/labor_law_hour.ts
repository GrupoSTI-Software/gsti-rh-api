import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import { compose } from '@adonisjs/core/helpers'

/**
 * @swagger
 * components:
 *   schemas:
 *      LaborLawHour:
 *        type: object
 *        properties:
 *          laborLawHoursId:
 *            type: number
 *            description: Labor law hours id
 *          laborLawHoursHoursPerWeek:
 *            type: number
 *            description: Hours per week according to labor law
 *          laborLawHoursActive:
 *            type: number
 *            description: Labor law hours status
 *          laborLawHoursApplySince:
 *            type: date
 *            description: Date since this configuration applies
 *          laborLawHoursDescription:
 *            type: string
 *            description: Description of the labor law configuration
 *          laborLawHoursCreatedAt:
 *            type: string
 *          laborLawHoursUpdatedAt:
 *            type: string
 *          laborLawHoursDeletedAt:
 *            type: string
 *
 */
/**
 * @deprecated DEPRECADO (EPIC-08-12). La fuente única de verdad del marco legal de
 * jornada laboral ahora es la tabla `working_time_rules` (modelo `WorkingTimeRule`),
 * que cubre horas semanales con vigencia por año, horas extra, jornadas diurna/nocturna/mixta,
 * regla 6x1 y protección salarial.
 *
 * Esta tabla solo cubría `hours_per_week` y representa una segunda fuente de verdad del
 * mismo dato, por lo que no debe usarse para nuevas funcionalidades.
 *
 * Pendiente de migración de datos y eliminación en historia posterior del CAP
 * (responsable: Wilvardo Ramírez Colunga).
 */
export default class LaborLawHour extends compose(BaseModel, SoftDeletes) {
  @column({ isPrimary: true })
  declare laborLawHoursId: number

  @column()
  declare laborLawHoursHoursPerWeek: number

  @column()
  declare laborLawHoursActive: number

  @column()
  declare laborLawHoursApplySince: string | Date

  @column()
  declare laborLawHoursDescription: string | null

  @column.dateTime({ autoCreate: true })
  declare laborLawHoursCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare laborLawHoursUpdatedAt: DateTime

  @column.dateTime({ columnName: 'labor_law_hours_deleted_at' })
  declare deletedAt: DateTime | null
}
