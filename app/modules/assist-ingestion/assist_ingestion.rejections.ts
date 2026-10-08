import { ASSIST_ERROR_CODES } from '#constants/assist_error_codes'
import type { AssistIngestionRejection } from './dto/assist_ingestion.dto.js'

/**
 * Motivos por los que un elemento se rechaza, con su triplete del estándar del área.
 *
 * Viven aquí, y no repartidos por el módulo, porque el mismo motivo tiene que
 * decirse igual en el alta unitaria y en la entrega de varias: un cliente que
 * vacía su cola discrimina por `code`, y dos textos distintos para el mismo motivo
 * lo obligarían a adivinar.
 */

/** El `employeeId` no resuelve a un colaborador de la empresa activa. */
export const ASSIST_INGESTION_EMPLOYEE_NOT_FOUND: AssistIngestionRejection = {
  status: 400,
  code: ASSIST_ERROR_CODES.VAL_EMPLOYEE_NOT_FOUND,
  key: 'colaborador-no-encontrado',
  i18nBase: 'assist_employee_not_found',
}

/** El colaborador existe en la empresa activa pero está dado de baja. */
export const ASSIST_INGESTION_EMPLOYEE_TERMINATED: AssistIngestionRejection = {
  status: 422,
  code: ASSIST_ERROR_CODES.AUTHZ_EMPLOYEE_TERMINATED,
  key: 'colaborador-dado-de-baja',
  i18nBase: 'assist_employee_terminated',
}

/** Captura de la checada de un tercero sin el permiso `add-assist-manual`. */
export const ASSIST_INGESTION_FOREIGN_WRITE: AssistIngestionRejection = {
  status: 403,
  code: ASSIST_ERROR_CODES.AUTHZ_FOREIGN_WRITE,
  key: 'sin-autorizacion-para-registrar-asistencia-ajena',
  i18nBase: 'assist_write_forbidden',
}

/** El elemento no pasó la lista blanca: falta un campo o trae un valor inválido. */
export const ASSIST_INGESTION_INVALID_ITEM: AssistIngestionRejection = {
  status: 400,
  code: ASSIST_ERROR_CODES.VAL_EMPLOYEE_ID,
  key: 'datos-de-checada-invalidos',
  i18nBase: 'assist_register_val_employee_id',
}

/** El canal declarado está fuera del vocabulario cerrado. */
export const ASSIST_INGESTION_CHANNEL_UNKNOWN: AssistIngestionRejection = {
  status: 400,
  code: ASSIST_ERROR_CODES.VAL_CHANNEL_UNKNOWN,
  key: 'canal-de-checada-no-reconocido',
  i18nBase: 'assist_channel_unknown',
}

/**
 * El elemento repite una checada que ya venía en la misma entrega.
 *
 * Se rechaza en vez de colapsarlo en silencio a "ya estaba": si la cola del equipo
 * lleva dos copias del mismo hecho, tiene un defecto, y marcarlo como preexistente
 * lo escondería. El equipo puede descartar el gemelo sin riesgo — su checada sí
 * quedó registrada, por el primero.
 */
export const ASSIST_INGESTION_BATCH_DUPLICATE_ITEM: AssistIngestionRejection = {
  status: 400,
  code: ASSIST_ERROR_CODES.VAL_BATCH_DUPLICATE_ITEM,
  key: 'checada-repetida-dentro-del-lote',
  i18nBase: 'assist_batch_duplicate_item',
}

/** No hay empresa resoluble para la checada: no se escribe en el lugar equivocado. */
export const ASSIST_INGESTION_TENANT_UNRESOLVED: AssistIngestionRejection = {
  status: 422,
  code: ASSIST_ERROR_CODES.TENANT_UNRESOLVED,
  key: 'empresa-de-la-checada-no-resuelta',
  i18nBase: 'assist_tenant_unresolved',
}

/** La hora de captura declarada no es legible en ninguno de los dos formatos. */
export const ASSIST_INGESTION_PUNCH_TIME_FORMAT: AssistIngestionRejection = {
  status: 400,
  code: ASSIST_ERROR_CODES.VAL_PUNCH_TIME_FORMAT,
  key: 'hora-de-captura-invalida',
  i18nBase: 'assist_punch_time_format',
}

/** La hora de captura se adelanta al reloj del servidor más allá de la tolerancia. */
export const ASSIST_INGESTION_PUNCH_TIME_FUTURE: AssistIngestionRejection = {
  status: 422,
  code: ASSIST_ERROR_CODES.VAL_PUNCH_TIME_FUTURE,
  key: 'hora-de-captura-en-el-futuro',
  i18nBase: 'assist_punch_time_future',
}

/**
 * La hora de captura es más antigua que la ventana permitida.
 *
 * Ni el mensaje ni la respuesta dicen cuánto se puede retroceder: publicar el ancho
 * es entregarle el margen exacto a quien quiera aprovecharlo.
 */
export const ASSIST_INGESTION_PUNCH_TIME_OUT_OF_WINDOW: AssistIngestionRejection = {
  status: 422,
  code: ASSIST_ERROR_CODES.VAL_PUNCH_TIME_OUT_OF_WINDOW,
  key: 'hora-de-captura-fuera-de-la-ventana-permitida',
  i18nBase: 'assist_punch_time_out_of_window',
}

/**
 * La captura administrativa va más atrás de lo que el rol puede modificar.
 *
 * Es un motivo distinto del anterior y por eso tiene código propio: aquí no
 * manda la ventana del canal sino el alcance en días del rol de quien captura,
 * y la salida no es esperar ni reintentar, sino pedírselo a un rol con más
 * alcance.
 */
export const ASSIST_INGESTION_PUNCH_TIME_ROLE_SCOPE: AssistIngestionRejection = {
  status: 422,
  code: ASSIST_ERROR_CODES.VAL_PUNCH_TIME_ROLE_SCOPE,
  key: 'hora-de-captura-fuera-del-alcance-del-rol',
  i18nBase: 'assist_punch_time_role_scope',
}

/**
 * Coordenadas imposibles: solo una de las dos, no finitas o fuera de rango
 * (VLRH-H1790812613754, regla 3). No se asumen válidas ni se tratan como
 * checada sin ubicación.
 */
export const ASSIST_INGESTION_COORDINATES_INVALID: AssistIngestionRejection = {
  status: 400,
  code: ASSIST_ERROR_CODES.VAL_COORDINATES_INVALID,
  key: 'coordenadas-invalidas',
  i18nBase: 'assist_coordinates_invalid',
}

/**
 * La checada cae fuera de toda zona evaluable del empleado, con la holgura de su
 * empresa (regla 4). El rechazo no dice la distancia ni cuál zona: sería una
 * sonda para dibujar el contorno.
 */
export const ASSIST_INGESTION_OUTSIDE_ZONE: AssistIngestionRejection = {
  status: 422,
  code: ASSIST_ERROR_CODES.GEO_OUTSIDE_ZONE,
  key: 'checada-fuera-de-zona',
  i18nBase: 'assist_outside_zone',
}

/** Sin zonas asignadas en su empresa y sin "cualquier zona" (regla 6). */
export const ASSIST_INGESTION_NO_AUTHORIZED_ZONE: AssistIngestionRejection = {
  status: 422,
  code: ASSIST_ERROR_CODES.GEO_NO_AUTHORIZED_ZONE,
  key: 'empleado-sin-zona-autorizada',
  i18nBase: 'assist_without_authorized_zone',
}

/**
 * Con zonas asignadas, ninguna evaluable: mal dibujada, sin empresa o de otra
 * empresa (regla 7). Nunca se acepta por omisión.
 */
export const ASSIST_INGESTION_ZONE_NOT_EVALUABLE: AssistIngestionRejection = {
  status: 422,
  code: ASSIST_ERROR_CODES.GEO_ZONE_NOT_EVALUABLE,
  key: 'zona-no-evaluable',
  i18nBase: 'assist_zone_not_evaluable',
}
