import vine from '@vinejs/vine'
import { DOCUMENT_TEMPLATE_VERSIONS_MAX_LIMIT } from '../document_templates.constants.js'

/**
 * Query del historial de versiones (USRH1788553841100): solo paginado. El
 * `documentType` NO se valida aquí: viaja en la ruta y lo resuelve el
 * servicio contra la constante del slice (422 `tipo-de-documento-no-valido`);
 * con VineJS degradaría a 400 `datos-invalidos`.
 */
export const listDocumentTemplateVersionsValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).optional(),
    limit: vine.number().min(1).max(DOCUMENT_TEMPLATE_VERSIONS_MAX_LIMIT).optional(),
  })
)
