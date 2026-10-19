import type { HttpContext } from '@adonisjs/core/http'
import type { CompetencyErrorCode } from '#constants/competency_error_codes'

/**
 * 404 uniforme del dominio de competencias (anti-IDOR, VLRH-H1792032453526).
 *
 * Ajeno, plantilla, dado de baja e inexistente responden el mismo cuerpo: el
 * `code` dice qué referencia no resolvió, nunca si existe en otra empresa.
 * Aditivo sobre el 404 legacy — conserva `type`, `message` y `data` porque
 * `valanserh-bo` (`components/positionCompetencies/script.ts`,
 * `resources/scripts/utils/apiError.ts`) sigue leyendo `message`.
 */
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
