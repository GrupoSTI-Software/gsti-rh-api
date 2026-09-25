import vine from '@vinejs/vine'
import { DateTime } from 'luxon'
import { MAX_DAYS_TO_APPLY } from '#constants/exception_request_self_service'

export const storeExceptionRequestValidator = vine.compile(
  vine.object({
    /**
     * A quien se le registra el permiso. Solo se lee cuando quien llama tiene
     * la facultad de gestionar solicitudes de terceros; en el autoservicio de
     * la app el servidor lo deriva del token y este campo no viaja. Por eso es
     * opcional aqui y el controlador exige su presencia en la rama que si lo
     * usa.
     */
    employeeId: vine.number().min(1).optional(),
    /**
     * Dias consecutivos que cubre la peticion; cada uno se guarda como una
     * solicitud propia. Estaba fuera del validator, leido con `request.input`,
     * asi que llegaba sin tipo ni tope y una sola llamada podia disparar tantos
     * INSERT como quisiera quien la mandara.
     */
    daysToApply: vine.number().min(1).max(MAX_DAYS_TO_APPLY).optional(),
    exceptionTypeId: vine.number().min(1),
    /**
     * Estatus con el que nace la solicitud. Lo usa el backoffice para registrar
     * permisos ya autorizados; en el autoservicio se ignora y se fuerza
     * `pending`, asi que la app no lo manda.
     */
    exceptionRequestStatus: vine.enum(['pending', 'accepted', 'refused']).optional(),
    exceptionRequestDescription: vine.string().trim().maxLength(255).optional(),
    exceptionRequestCheckInTime: vine.string().trim().maxLength(10).optional(),
    exceptionRequestCheckOutTime: vine.string().trim().maxLength(10).optional(),
    exceptionRequestPeriodInHours: vine.number().min(0).optional(),
    requestedDate:
      vine.date().transform((value) => DateTime.fromJSDate(value)) || vine.string().maxLength(10),
    role: vine
      .object({
        roleId: vine.number().min(1),
        roleName: vine.string().trim().maxLength(50).optional(),
      })
      .optional(),
  })
)

export const updateExceptionRequestValidator = vine.compile(
  vine.object({
    exceptionRequestStatus: vine.enum(['pending', 'accepted', 'refused']).optional(),
    exceptionRequestDescription: vine.string().trim().maxLength(255).optional(),
    requestedDate: vine.date().transform((value) => DateTime.fromJSDate(value)),
    exceptionRequestCheckInTime: vine.string().trim().maxLength(10).optional(),
    exceptionRequestCheckOutTime: vine.string().trim().maxLength(10).optional(),
    role: vine
      .object({
        roleId: vine.number().min(1),
        roleName: vine.string().trim().maxLength(50).optional(),
      })
      .optional(),
  })
)
