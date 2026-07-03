import vine from '@vinejs/vine'
import type { FieldContext } from '@vinejs/vine/types'
import { MASK_CHAR } from '#helpers/sensitive_mask'

/**
 * Regla VineJS que rechaza cualquier cadena que contenga el carácter de máscara `•` (U+2022).
 *
 * Propósito (USRH1783019898097 §9 — anti-corrupción):
 *   Los campos sensibles se entregan enmascarados en la API. Si el BO reenvía ese valor
 *   enmascarado como si fuera el dato real, la base de datos quedaría corrompida.
 *   Esta regla actúa como guard en la capa de validación, rechazando la escritura antes
 *   de que llegue al modelo.
 *
 * Uso en validators:
 * ```typescript
 * personCurp: vine.string().trim().use(noMaskCharRule()).optional()
 * ```
 */
export const noMaskCharRule = vine.createRule(
  (value: unknown, _options: undefined, field: FieldContext) => {
    if (typeof value !== 'string') return
    if (value.includes(MASK_CHAR)) {
      field.report(
        'El campo {{ field }} contiene el carácter de máscara y no puede guardarse como valor real.',
        'noMaskChar',
        field,
        undefined
      )
    }
  }
)
