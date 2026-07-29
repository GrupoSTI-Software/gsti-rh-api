import scheduler from 'adonisjs-scheduler/services/main'
import { LACTATION_NOTIFY_EXPIRING_COMMAND } from '#constants/employee_lactation_notification'
import { REPSE_NOTIFY_FOLIO_EXPIRING_COMMAND } from '#constants/repse_folio_aviso'
import {
  ANNIVERSARY_DAY_EMAIL_COMMAND,
  ANNIVERSARY_REMINDER_EMAIL_COMMAND,
  BIRTH_DAY_EMAIL_COMMAND,
  BIRTHDAY_REMINDER_EMAIL_COMMAND,
  EMPLOYEE_CELEBRATION_EMAIL_CRON,
} from '#constants/employee_celebration_email'

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
 * Correos de celebración (cumpleaños y aniversario laboral): felicitación al
 * empleado y recordatorio a RH, por cada system setting activo con su flag.
 * 13:00 UTC = 07:00 CDMX. Fuera de producción el servicio aplica
 * DEVELOPMENT_EMAIL_LIST; en producción solo clientes con la opción encendida.
 *
 * Coordinar con infra el retiro de crons externos en Forge al liberar, para
 * evitar doble envío durante la transición.
 */
scheduler.command(BIRTH_DAY_EMAIL_COMMAND).cron(EMPLOYEE_CELEBRATION_EMAIL_CRON)
scheduler.command(BIRTHDAY_REMINDER_EMAIL_COMMAND).cron(EMPLOYEE_CELEBRATION_EMAIL_CRON)
scheduler.command(ANNIVERSARY_DAY_EMAIL_COMMAND).cron(EMPLOYEE_CELEBRATION_EMAIL_CRON)
scheduler.command(ANNIVERSARY_REMINDER_EMAIL_COMMAND).cron(EMPLOYEE_CELEBRATION_EMAIL_CRON)

/**
 * Cierre automático de jornada (USRH1782268640950): corre una vez al día,
 * después de medianoche en zona de negocio (07:00 UTC = 01:00 CDMX), para
 * evaluar como fecha de corte "ayer" completo y detectar los periodos de
 * nómina que vencieron. Reintenta lo fallido en corridas previas.
 */
scheduler.command('work-journal:seal-period').cron('0 7 * * *')

/**
 * Reloj de suscripción (USRH1784574994921): evalúa cada suscripción no
 * cancelada y mueve su estado según sus fechas de prueba y periodo
 * (trialing → active/past_due, active → past_due). Barrido idempotente.
 *
 * Se programa a las 13:00 UTC (07:00 CDMX), misma ventana que
 * `lactation_notify_expiring`, para que los estados queden actualizados
 * al inicio del día de negocio. Confirmar hora con Wilvardo en review.
 */
scheduler.command('billing:tick-subscriptions').cron('0 13 * * *')
