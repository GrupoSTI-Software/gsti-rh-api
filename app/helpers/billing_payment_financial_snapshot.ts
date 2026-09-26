/**
 * Un pago sin desglose (marcador `totalCents = 0`, migración 1785766125021)
 * no puede facturarse. Regla única del producto: el detalle del pago y el
 * alta del comprobante fiscal la consumen tal cual.
 */
export function hasFinancialSnapshot(totalCents: number): boolean {
  return Number(totalCents) !== 0
}
