/** Catálogo c_MotivoCancelacion del SAT (USRH1788288461952). Cuatro claves estables. */
export const SAT_CANCELLATION_REASON_SEED_DATA = [
  {
    code: '01',
    description: 'Comprobante emitido con errores con relación',
    requiresSubstitute: true,
  },
  {
    code: '02',
    description: 'Comprobante emitido con errores sin relación',
    requiresSubstitute: false,
  },
  { code: '03', description: 'No se llevó a cabo la operación', requiresSubstitute: false },
  {
    code: '04',
    description: 'Operación nominativa relacionada en una factura global',
    requiresSubstitute: false,
  },
] as const

export const SAT_CANCELLATION_REASON_EXPECTED_COUNT = 4
