import vine from '@vinejs/vine'

/** 1 MB de HTML por componente (mismo límite que `legal_document`). */
const MAX_BODY_LENGTH = 1_048_576

/**
 * Editar el borrador: la cantidad exacta (12) se valida aquí; el **set** exacto
 * de `key` esperados (`5_2_a`..`5_2_l`, sin duplicados/faltantes/extra) no es
 * expresable en Vine — lo valida el service y lanza `estructura-componentes-invalida`.
 */
export const teleworkPolicyUpdateValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(3).maxLength(150),
    components: vine
      .array(
        vine.object({
          key: vine.string().trim().minLength(1).maxLength(20),
          title: vine.string().trim().minLength(1).maxLength(200),
          // `.optional()`: un componente puede guardarse sin contenido todavía
          // (regla de negocio 5) — Vine trata la cadena vacía como "ausente"
          // bajo `required`, igual que `legal_document_draft.validator.ts`.
          body: vine.string().trim().maxLength(MAX_BODY_LENGTH).optional(),
        })
      )
      .minLength(12)
      .maxLength(12),
  })
)

export type TeleworkPolicyUpdateInput = Awaited<
  ReturnType<typeof teleworkPolicyUpdateValidator.validate>
>
