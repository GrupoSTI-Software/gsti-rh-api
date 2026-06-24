import scheduler from 'adonisjs-scheduler/services/main'
import { LACTATION_NOTIFY_EXPIRING_COMMAND } from '#constants/employee_lactation_notification'

// scheduler.command('inspire').everyFiveSeconds()
scheduler.command('sync:assistance').cron('*/5 * * * *')

/**
 * Aviso diario a RH cuando un periodo de lactancia está a ≤ 30 días de
 * vencer. Se programa a las 13:00 UTC (07:00 CDMX) para que el correo
 * llegue antes del inicio normal de la jornada de RH y el equipo pueda
 * coordinar la renovación con la empleada el mismo día.
 *
 * El comando es idempotente: la bitácora
 * `employee_lactation_period_notifications` evita reenvíos del mismo
 * tipo de aviso para el mismo periodo.
 */
scheduler.command(LACTATION_NOTIFY_EXPIRING_COMMAND).cron('0 13 * * *')
