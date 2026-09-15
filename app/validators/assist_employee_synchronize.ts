import vine from '@vinejs/vine'

/**
 * Fecha del rango a sincronizar. Se valida como TEXTO y se entrega como texto,
 * no como `Date`: el servicio usa el mismo valor para dos cosas distintas
 * —`new Date(...)` al pedirle el rango al biométrico y el string tal cual como
 * `date` del recálculo de calendario (`setDateCalendar`)—, así que convertirlo
 * aquí cambiaría en silencio lo que recibe la segunda.
 *
 * Acepta `YYYY-MM-DD` y esa misma fecha con hora (el backoffice manda a veces un
 * `Date` serializado a ISO en el query string).
 */
const synchronizeDateField = vine
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}([T ].*)?$/)

/**
 * Entrada de `POST /api/v1/assists/employee-synchronize`.
 *
 * Sin validación, `startDate` y `endDate` llegaban al servicio como `undefined`:
 * `new Date(undefined)` produce `Invalid Date` y el `toISOString()` que arma la
 * petición al biométrico reventaba. El controller devolvía entonces un 400 crudo
 * (`{ message: 'Invalid time value' }`), sin título, detalle ni key, que el panel
 * de asistencia del backoffice no puede distinguir de una caída del equipo.
 *
 * `empCode` es obligatorio por la misma razón: el servicio lo usa como filtro del
 * colaborador contra el biométrico y, vacío, sincroniza lo que no se pidió.
 *
 * El backoffice manda los tres campos en el query string, no en el cuerpo;
 * `request.validateUsing` valida ambos (`request.all()` mezcla query y body).
 */
export const employeeSynchronizeAssistsValidator = vine.compile(
  vine.object({
    startDate: synchronizeDateField,
    endDate: synchronizeDateField,
    empCode: vine.string().trim().minLength(1),
  })
)
