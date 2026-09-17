import vine from '@vinejs/vine'
import type { FieldContext } from '@vinejs/vine/types'
import { DateTime } from 'luxon'

/** `YYYY-MM-DD`, opcionalmente seguido de hora (`T` o espacio). */
const SYNCHRONIZE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}([T ].*)?$/

/**
 * Rechaza una fecha que el regex acepta pero el calendario no (`2026-13-45`) y
 * una con sufijo basura que `new Date` no sabe leer (`2026-09-15Tzzz`).
 *
 * El regex por sí solo no cierra el 400 crudo: el servicio hace
 * `new Date(filters.startDate).toISOString()` para armar la petición al
 * biométrico (`sync_assists_service.ts`), y con una fecha imposible eso lanza
 * `Invalid time value`, que el controller devolvía como un 400 sin título,
 * detalle ni key —exactamente el defecto que el validador venía a cerrar—.
 *
 * Se valida el DÍA por separado del sufijo horario: `2026-02-30` no existe, y
 * `new Date` lo rodaría en silencio a `2026-03-02`, sincronizando un rango que
 * nadie pidió.
 */
const parseableSynchronizeDateRule = vine.createRule(
  (value: unknown, _options: undefined, field: FieldContext) => {
    if (typeof value !== 'string' || !field.isValid) return

    const day = value.slice(0, 10)
    const calendarDay = DateTime.fromFormat(day, 'yyyy-MM-dd', { zone: 'utc' })
    const parseable = !Number.isNaN(new Date(value).getTime())

    if (!calendarDay.isValid || !parseable) {
      field.report(
        'La fecha {{ field }} no existe o no puede interpretarse.',
        'parseableSynchronizeDate',
        field,
        undefined
      )
    }
  }
)

/**
 * Rechaza un rango invertido. El commit que introdujo este validador se titula
 * "validar su rango" y no lo validaba: con `startDate` posterior a `endDate`, el
 * servicio le pide al biométrico una ventana al revés y recalcula el calendario
 * con ese mismo par (`setDateCalendar`).
 *
 * Corre sobre el objeto, no sobre el campo, porque necesita los dos valores.
 */
const orderedRangeRule = vine.createRule(
  (value: unknown, _options: undefined, field: FieldContext) => {
    if (!field.isValid || typeof value !== 'object' || value === null) return

    const { startDate, endDate } = value as { startDate?: unknown; endDate?: unknown }
    if (typeof startDate !== 'string' || typeof endDate !== 'string') return

    if (startDate.slice(0, 10) > endDate.slice(0, 10)) {
      field.report(
        'La fecha inicial no puede ser posterior a la final.',
        'orderedRange',
        field,
        undefined
      )
    }
  }
)

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
  .regex(SYNCHRONIZE_DATE_PATTERN)
  .use(parseableSynchronizeDateRule())

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
 * El backoffice manda los tres campos en el query string, no en el cuerpo; el
 * controller valida `request.all()`, que mezcla query y cuerpo.
 */
export const employeeSynchronizeAssistsValidator = vine.compile(
  vine
    .object({
      startDate: synchronizeDateField,
      endDate: synchronizeDateField,
      empCode: vine.string().trim().minLength(1),
    })
    .use(orderedRangeRule())
)
