/**
 * Cantidad con letra e importe impreso en pesos mexicanos para documentos
 * legales (USRH1789097550395). Módulo puro: sin estado, sin consultas, sin
 * traducción; lanza `RangeError` solo por contrato (fuera de rango). Siempre
 * en español de México y en mayúsculas, sin depender del locale de quien
 * emite: el documento es en español siempre.
 *
 * Número y letra salen del MISMO entero de centavos (`toCents`, único
 * redondeo del módulo): por construcción no pueden discrepar.
 */

/** Importe máximo admitido: por debajo del `decimal(14,2)` de la columna de snapshot. */
export const MAX_AMOUNT = 999_999_999_999.99

const UNITS = [
  '',
  'UNO',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISÉIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
  'VEINTE',
  'VEINTIUNO',
  'VEINTIDÓS',
  'VEINTITRÉS',
  'VEINTICUATRO',
  'VEINTICINCO',
  'VEINTISÉIS',
  'VEINTISIETE',
  'VEINTIOCHO',
  'VEINTINUEVE',
] as const

const TENS = [
  '',
  '',
  '',
  'TREINTA',
  'CUARENTA',
  'CINCUENTA',
  'SESENTA',
  'SETENTA',
  'OCHENTA',
  'NOVENTA',
] as const

const HUNDREDS = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
] as const

/**
 * Único redondeo del módulo. Devuelve el entero de centavos del que se
 * derivan la cifra y la letra; exacto hasta `MAX_AMOUNT` (cabe en
 * `Number.MAX_SAFE_INTEGER`).
 *
 * @throws RangeError si el importe no es un número finito, es negativo o excede `MAX_AMOUNT`.
 */
export function toCents(amount: number): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new RangeError('El importe debe ser un número finito')
  }
  if (amount < 0) {
    throw new RangeError('El importe no puede ser negativo')
  }
  if (amount > MAX_AMOUNT) {
    throw new RangeError(`El importe excede el máximo admitido (${MAX_AMOUNT})`)
  }
  return Math.round(amount * 100)
}

/**
 * 1–999 en letra con apócope: "UN" en lugar de "UNO" cuando precede a un
 * sustantivo masculino (PESOS, MIL, MILLÓN), que es siempre el caso aquí.
 * "CIEN" solo para el 100 exacto; "CIENTO" con resto.
 */
function hundredsToWords(value: number): string {
  if (value === 0) return ''
  if (value === 100) return 'CIEN'
  const hundreds = Math.floor(value / 100)
  const rest = value % 100
  const parts: string[] = []
  if (hundreds > 0) parts.push(HUNDREDS[hundreds])
  if (rest > 0) parts.push(tensToWords(rest))
  return parts.join(' ')
}

function tensToWords(value: number): string {
  if (value === 1) return 'UN'
  if (value === 21) return 'VEINTIÚN'
  if (value < 30) return UNITS[value]
  const tens = Math.floor(value / 10)
  const unit = value % 10
  if (unit === 0) return TENS[tens]
  return `${TENS[tens]} Y ${unit === 1 ? 'UN' : UNITS[unit]}`
}

/**
 * 1–999 999 en letra: el grupo de miles no lleva "UN" ("MIL", no "UN MIL"),
 * pero sí su cantidad cuando es mayor a uno ("DOS MIL", "VEINTIÚN MIL").
 */
function thousandsToWords(value: number): string {
  const thousands = Math.floor(value / 1000)
  const rest = value % 1000
  const parts: string[] = []
  if (thousands === 1) parts.push('MIL')
  else if (thousands > 1) parts.push(`${hundredsToWords(thousands)} MIL`)
  if (rest > 0) parts.push(hundredsToWords(rest))
  return parts.join(' ')
}

/** Entero de pesos en letra: millones (con su singular) + resto. Cero entra como "CERO". */
function integerToWords(pesos: number): string {
  if (pesos === 0) return 'CERO'
  const millions = Math.floor(pesos / 1_000_000)
  const rest = pesos % 1_000_000
  const parts: string[] = []
  if (millions === 1) parts.push('UN MILLÓN')
  else if (millions > 1) parts.push(`${thousandsToWords(millions)} MILLONES`)
  if (rest > 0) parts.push(thousandsToWords(rest))
  return parts.join(' ')
}

/**
 * Cantidad con letra en pesos mexicanos: `DOCE MIL TRESCIENTOS CUARENTA Y
 * CINCO PESOS 67/100 M.N.`; "UN PESO" para el uno exacto; "DE PESOS" cuando
 * el entero es un múltiplo exacto de millón ("UN MILLÓN DE PESOS").
 *
 * @throws RangeError fuera de rango (ver `toCents`).
 */
export function amountInWords(amount: number): string {
  const cents = toCents(amount)
  const pesos = Math.floor(cents / 100)
  const fraction = cents % 100
  const words = integerToWords(pesos)
  const currency =
    pesos === 1 ? 'PESO' : pesos > 0 && pesos % 1_000_000 === 0 ? 'DE PESOS' : 'PESOS'
  return `${words} ${currency} ${String(fraction).padStart(2, '0')}/100 M.N.`
}

/**
 * Cifra impresa: `$43,250.80`, con separador de miles y dos decimales. Sin
 * `toLocaleString`: el formato no depende del locale de quien emite.
 *
 * @throws RangeError fuera de rango (ver `toCents`).
 */
export function formatAmountMxn(amount: number): string {
  const cents = toCents(amount)
  const pesos = Math.floor(cents / 100)
  const fraction = cents % 100
  const grouped = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `$${grouped}.${String(fraction).padStart(2, '0')}`
}
