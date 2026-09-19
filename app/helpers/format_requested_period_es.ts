import { DateTime } from 'luxon'

/**
 * Normaliza una fecha pedida.
 *
 * `requested_date` es un día del calendario, no un instante: el 3 de octubre es
 * el 3 de octubre en cualquier parte. Por eso aquí NO se convierte de zona. La
 * conexión declara `timezone: 'Z'`, así que un DATE llega como medianoche UTC;
 * pasarlo a la zona de México lo retrocedería al día anterior, y el correo
 * anunciaría un permiso para un día que nadie pidió.
 *
 * La columna entrega cadena, `Date` o `DateTime` según por dónde haya pasado el
 * modelo, así que quien la quiera leer tiene que aceptar las tres formas. Todas
 * se reducen a la misma referencia —medianoche UTC del día civil— para que
 * comparar dos fechas no dependa de cómo llegó cada una.
 *
 * @param valor - Fecha tal como la devuelve el modelo.
 * @returns El día civil, o `null` si no es interpretable.
 */
export function toRequestedDate(valor: DateTime | string | Date): DateTime | null {
  const civil =
    valor instanceof DateTime
      ? valor
      : valor instanceof Date
        ? DateTime.fromJSDate(valor, { zone: 'utc' })
        : DateTime.fromISO(`${valor}`.slice(0, 10), { zone: 'utc' })

  if (!civil.isValid) {
    return null
  }

  return DateTime.utc(civil.year, civil.month, civil.day)
}

/**
 * Redacta en español los días que cubre un conjunto de fechas.
 *
 * Tres formas, porque son tres hechos distintos: un día suelto, un tramo
 * corrido o días salteados. Lo último no es un caso raro — aparece en cuanto la
 * empresa autoriza unos días de la petición y rechaza otros, y escribir "del 1
 * al 5" cuando solo se autorizaron el 1, el 3 y el 5 sería mentir.
 *
 * @param fechas - Fechas a redactar, en cualquier orden y con repetidos.
 * @returns El periodo redactado, o cadena vacía si no hay ninguna fecha válida.
 */
export function formatRequestedPeriodEs(fechas: Array<DateTime | string | Date>): string {
  const ordenadas = [
    ...new Map(
      fechas
        .map((fecha) => toRequestedDate(fecha))
        .filter((fecha): fecha is DateTime => fecha !== null)
        .map((fecha) => [fecha.toISODate(), fecha])
    ).values(),
  ].sort((a, b) => a.toMillis() - b.toMillis())

  if (ordenadas.length === 0) {
    return ''
  }

  if (ordenadas.length === 1) {
    return `el ${formatFullDateEs(ordenadas[0])}`
  }

  const primera = ordenadas[0]
  const ultima = ordenadas[ordenadas.length - 1]
  const corridas = ultima.diff(primera, 'days').days === ordenadas.length - 1

  if (corridas) {
    const mismoMes = primera.hasSame(ultima, 'month') && primera.hasSame(ultima, 'year')

    return mismoMes
      ? `del ${primera.day} al ${formatFullDateEs(ultima)}`
      : `del ${formatFullDateEs(primera)} al ${formatFullDateEs(ultima)}`
  }

  return ordenadas.map((fecha) => formatFullDateEs(fecha)).join(', ')
}

/** Fecha larga en español: "3 de octubre de 2026". */
export function formatFullDateEs(fecha: DateTime): string {
  return fecha.setLocale('es').toFormat("d 'de' LLLL 'de' yyyy")
}
