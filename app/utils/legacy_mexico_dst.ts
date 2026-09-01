/**
 * Ajuste heredado de horario de verano del camino de registro de checadas.
 *
 * México dejó de aplicar el horario de verano en 2022, así que este ajuste ya no
 * corrige nada: sólo desplaza una hora los instantes entre el primer domingo de
 * abril y el último de octubre. Se conserva **temporalmente** para que el alta
 * unitaria y la entrega de varias escriban exactamente el mismo instante —y por
 * tanto la misma identidad— mientras el ajuste siga vivo.
 *
 * Lo retira `USRH1788135907803` del camino de registro, y `USRH1788135907804` su
 * espejo del camino de consulta. Ningún camino nuevo debe empezar a usarlo.
 */

function mexicoDstChangeDates(year: number): { startDST: Date; endDST: Date } {
  const startDST = new Date(year, 3, 1)
  startDST.setDate(1 + ((7 - startDST.getDay()) % 7))

  const endDST = new Date(year, 9, 31)
  endDST.setDate(endDST.getDate() - endDST.getDay())

  return { startDST, endDST }
}

/** El instante cae dentro del antiguo periodo de horario de verano mexicano. */
export function isLegacyMexicoSummerTime(date: Date): boolean {
  const { startDST, endDST } = mexicoDstChangeDates(date.getFullYear())
  return date >= startDST && date < endDST
}
