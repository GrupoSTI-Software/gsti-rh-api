import vine from '@vinejs/vine'

/**
 * 100 KB de HTML por componente. A diferencia de `legal_document` (1 MB, pero
 * un solo campo `content.es`/`content.en`), aquí van **12 componentes en el
 * mismo request** — con 1 MB por componente el payload podría llegar a ~12 MB
 * y el bodyparser lo rechaza con 413 "Entity too large" antes de que Vine
 * llegue a validar nada. 100 KB × 12 ≈ 1.2 MB de contenido, holgado bajo el
 * límite global `json.limit` de `config/bodyparser.ts` (ver ese archivo) y
 * más que suficiente para el texto de un numeral del 5.2 (decenas de páginas).
 */
const MAX_BODY_LENGTH = 100_000

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
