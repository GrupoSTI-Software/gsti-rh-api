import vine from '@vinejs/vine'

/**
 * Reordenamiento del catálogo completo (adelantado de USRH1786568279584 por
 * decisión de producto: drag & drop de las tarjetas en la pantalla). La
 * lista debe cubrir exactamente todos los conceptos vivos de la empresa; la
 * cobertura la valida el servicio sobre filas bloqueadas. Sin
 * `businessUnitId`: el tenant lo resuelve el header (convención de la cadena).
 */
export const reorderOffboardingConceptsValidator = vine.compile(
  vine.object({
    orderedOffboardingConceptIds: vine
      .array(vine.number().withoutDecimals().min(1))
      .minLength(1),
  })
)
