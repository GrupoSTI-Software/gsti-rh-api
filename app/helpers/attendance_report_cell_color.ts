/**
 * Color de la celda de un día en el reporte de asistencia según el estado de
 * la entrada (verde, azul claro, naranja, rojo claro).
 *
 * Un estado vacío o que el cálculo no califica (colaborador discriminado,
 * permiso con goce, excepción) queda en blanco: antes se pintaba verde, como
 * si fuera puntual.
 */
export function attendanceStatusCellColor(checkInStatus: string | null | undefined): string {
  switch ((checkInStatus || '').trim().toLowerCase()) {
    case 'ontime':
      return 'FFC6EFCE' // Verde claro
    case 'tolerance':
      return 'FFB7D8FA' // Azul claro
    case 'delay':
      return 'FFFFC000' // Naranja
    case 'fault':
      return 'FFFFAAA3' // Rojo claro
    default:
      return 'FFFFFFFF'
  }
}
