import scheduler from 'adonisjs-scheduler/services/main'
import { LACTATION_NOTIFY_EXPIRING_COMMAND } from '#constants/employee_lactation_notification'
import { REPSE_NOTIFY_FOLIO_EXPIRING_COMMAND } from '#constants/repse_folio_aviso'

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

/**
 * Aviso diario de vigencia del folio REPSE (renovación trienal e
 * informativas cuatrimestrales). 13:00 UTC = 07:00 CDMX. Idempotente
 * vía bitácora `repse_folio_avisos`.
 */
scheduler.command(REPSE_NOTIFY_FOLIO_EXPIRING_COMMAND).cron('0 13 * * *')

/**
 * Cierre automático de jornada (USRH1782268640950): corre una vez al día,
 * después de medianoche en zona de negocio (07:00 UTC = 01:00 CDMX), para
 * evaluar como fecha de corte "ayer" completo y detectar los periodos de
 * nómina que vencieron. Reintenta lo fallido en corridas previas.
 */
scheduler.command('work-journal:seal-period').cron('0 7 * * *')
