import vine from '@vinejs/vine'
import { LEGAL_DOCUMENT_TYPES } from './legal_document_query.validator.js'

/** 1 MB de HTML por idioma (definido por Wilvardo 2026-07-06). */
const MAX_CONTENT_LENGTH_PER_LOCALE = 1_048_576

/**
 * Crear borrador: `content` puede llegar con un solo idioma completo (regla de
 * negocio 8 — un borrador puede guardarse incompleto). La obligatoriedad de
 * ambos idiomas al publicar se valida en el service, no aquí.
 */
export const createLegalDocumentDraftValidator = vine.compile(
  vine.object({
    type: vine.enum(LEGAL_DOCUMENT_TYPES),
    version: vine.string().trim().minLength(1).maxLength(20),
    content: vine.object({
      es: vine.string().trim().maxLength(MAX_CONTENT_LENGTH_PER_LOCALE).optional(),
      en: vine.string().trim().maxLength(MAX_CONTENT_LENGTH_PER_LOCALE).optional(),
    }),
  })
)

/** Editar borrador: mismas reglas de contenido; `version` es opcional (no siempre se cambia). */
export const updateLegalDocumentDraftValidator = vine.compile(
  vine.object({
    version: vine.string().trim().minLength(1).maxLength(20).optional(),
    content: vine.object({
      es: vine.string().trim().maxLength(MAX_CONTENT_LENGTH_PER_LOCALE).optional(),
      en: vine.string().trim().maxLength(MAX_CONTENT_LENGTH_PER_LOCALE).optional(),
    }),
  })
)

export type CreateLegalDocumentDraftInput = Awaited<
  ReturnType<typeof createLegalDocumentDraftValidator.validate>
>
export type UpdateLegalDocumentDraftInput = Awaited<
  ReturnType<typeof updateLegalDocumentDraftValidator.validate>
>
