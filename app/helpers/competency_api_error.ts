import type { HttpContext } from '@adonisjs/core/http'
import { COMPETENCY_ERROR_CODES, type CompetencyErrorCode } from '#constants/competency_error_codes'

/**
 * 404 uniforme del dominio de competencias (anti-IDOR, VLRH-H1792032453526).
 *
 * Ajeno, plantilla, dado de baja e inexistente responden el mismo cuerpo: el
 * `code` dice qué referencia no resolvió, nunca si existe en otra empresa.
 * Aditivo sobre el 404 legacy — conserva `type`, `message` y `data` porque
 * `valanserh-bo` (`components/positionCompetencies/script.ts`,
 * `resources/scripts/utils/apiError.ts`) sigue leyendo `message`.
 */
/**
 * 422 aditivo del dominio de competencias (VLRH-H1792175042593).
 *
 * Recibe el error ya identificado como `E_VALIDATION_ERROR` de Vine y lo
 * traduce al cuerpo estándar del área: `message` fijo en español (el BO
 * construye el aviso a partir de él) + `errors` con el detalle por campo.
 */
export function competencyValidationErrorResponse(
  response: HttpContext['response'],
  error: { messages: Array<{ field: string; message: string; rule: string }> }
) {
  const detail = 'Los datos enviados no son válidos. Revisa los campos marcados.'
  return response.status(422).json({
    type: 'error',
    title: 'Datos no válidos',
    message: detail, // legacy: el BO lee `message`
    detail,
    key: 'datos-no-validos',
    code: COMPETENCY_ERROR_CODES.VALIDATION_FAILED,
    errors: error.messages,
  })
}

export function competencyNotFoundResponse(
  response: HttpContext['response'],
  code: CompetencyErrorCode
) {
  const detail = 'El recurso solicitado no existe o está fuera de tu alcance.'
  return response.status(404).json({
    type: 'warning',
    title: 'Recurso no encontrado',
    message: detail, // legacy: el BO lee `message`
    detail,
    key: 'recurso-no-encontrado',
    code,
    data: {}, // sin eco del id: no confirma ni descarta que exista en otra empresa
  })
}
