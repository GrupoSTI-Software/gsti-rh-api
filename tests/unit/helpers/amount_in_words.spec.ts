import { test } from '@japa/runner'
import { MAX_AMOUNT, amountInWords, formatAmountMxn, toCents } from '#helpers/amount_in_words'

/**
 * USRH1789097550395 (CA-8) — cantidad con letra en pesos mexicanos: las 23
 * filas de referencia (incluidos los casos que siempre se escriben mal: uno,
 * veintiuno, cien, mil, un millón y los centavos), los cuatro casos de rango
 * y el assert de coherencia número ↔ letra sobre las mismas 23 filas.
 */

/** Importe → cifra impresa → cantidad con letra. Verificadas a mano con las reglas del español de México. */
const CASES: ReadonlyArray<readonly [number, string, string]> = [
  [0, '$0.00', 'CERO PESOS 00/100 M.N.'],
  [0.01, '$0.01', 'CERO PESOS 01/100 M.N.'],
  [1, '$1.00', 'UN PESO 00/100 M.N.'],
  [1.5, '$1.50', 'UN PESO 50/100 M.N.'],
  [16, '$16.00', 'DIECISÉIS PESOS 00/100 M.N.'],
  [21, '$21.00', 'VEINTIÚN PESOS 00/100 M.N.'],
  [22.99, '$22.99', 'VEINTIDÓS PESOS 99/100 M.N.'],
  [31, '$31.00', 'TREINTA Y UN PESOS 00/100 M.N.'],
  [100, '$100.00', 'CIEN PESOS 00/100 M.N.'],
  [101, '$101.00', 'CIENTO UN PESOS 00/100 M.N.'],
  [999.99, '$999.99', 'NOVECIENTOS NOVENTA Y NUEVE PESOS 99/100 M.N.'],
  [1000, '$1,000.00', 'MIL PESOS 00/100 M.N.'],
  [1001, '$1,001.00', 'MIL UN PESOS 00/100 M.N.'],
  [2000, '$2,000.00', 'DOS MIL PESOS 00/100 M.N.'],
  [7250.8, '$7,250.80', 'SIETE MIL DOSCIENTOS CINCUENTA PESOS 80/100 M.N.'],
  [12345.67, '$12,345.67', 'DOCE MIL TRESCIENTOS CUARENTA Y CINCO PESOS 67/100 M.N.'],
  [21000, '$21,000.00', 'VEINTIÚN MIL PESOS 00/100 M.N.'],
  [43250.8, '$43,250.80', 'CUARENTA Y TRES MIL DOSCIENTOS CINCUENTA PESOS 80/100 M.N.'],
  [100000, '$100,000.00', 'CIEN MIL PESOS 00/100 M.N.'],
  [1000000, '$1,000,000.00', 'UN MILLÓN DE PESOS 00/100 M.N.'],
  [1500000.05, '$1,500,000.05', 'UN MILLÓN QUINIENTOS MIL PESOS 05/100 M.N.'],
  [2000000, '$2,000,000.00', 'DOS MILLONES DE PESOS 00/100 M.N.'],
  [1000000000, '$1,000,000,000.00', 'MIL MILLONES DE PESOS 00/100 M.N.'],
]

const WORD_VALUES: Readonly<Record<string, number>> = {
  CERO: 0,
  UN: 1,
  UNO: 1,
  DOS: 2,
  TRES: 3,
  CUATRO: 4,
  CINCO: 5,
  SEIS: 6,
  SIETE: 7,
  OCHO: 8,
  NUEVE: 9,
  DIEZ: 10,
  ONCE: 11,
  DOCE: 12,
  TRECE: 13,
  CATORCE: 14,
  QUINCE: 15,
  DIECISÉIS: 16,
  DIECISIETE: 17,
  DIECIOCHO: 18,
  DIECINUEVE: 19,
  VEINTE: 20,
  VEINTIUNO: 21,
  VEINTIÚN: 21,
  VEINTIDÓS: 22,
  VEINTITRÉS: 23,
  VEINTICUATRO: 24,
  VEINTICINCO: 25,
  VEINTISÉIS: 26,
  VEINTISIETE: 27,
  VEINTIOCHO: 28,
  VEINTINUEVE: 29,
  TREINTA: 30,
  CUARENTA: 40,
  CINCUENTA: 50,
  SESENTA: 60,
  SETENTA: 70,
  OCHENTA: 80,
  NOVENTA: 90,
  CIEN: 100,
  CIENTO: 100,
  DOSCIENTOS: 200,
  TRESCIENTOS: 300,
  CUATROCIENTOS: 400,
  QUINIENTOS: 500,
  SEISCIENTOS: 600,
  SETECIENTOS: 700,
  OCHOCIENTOS: 800,
  NOVECIENTOS: 900,
}

/**
 * Lee la cantidad con letra de regreso a centavos con un acumulador
 * independiente del helper: si la letra y el número no describen el mismo
 * entero de centavos, la fila falla aunque el literal esperado pase.
 */
function wordsToCents(words: string): number {
  const match = /^(.+?) (?:DE )?PESOS? (\d{2})\/100 M\.N\.$/.exec(words)
  if (!match) throw new Error(`Cantidad con letra mal formada: ${words}`)
  let total = 0
  let current = 0
  for (const token of match[1].split(' ')) {
    if (token === 'Y') continue
    if (token === 'MIL') {
      total += (current === 0 ? 1 : current) * 1000
      current = 0
      continue
    }
    if (token === 'MILLÓN' || token === 'MILLONES') {
      const base = total + current
      total = (base === 0 ? 1 : base) * 1_000_000
      current = 0
      continue
    }
    const value = WORD_VALUES[token]
    if (value === undefined) throw new Error(`Palabra desconocida: ${token}`)
    current += value
  }
  return (total + current) * 100 + Number(match[2])
}

test.group('amount_in_words (USRH1789097550395)', () => {
  test('CA-8: las 23 filas de referencia, en número y en letra', ({ assert }) => {
    assert.lengthOf(CASES, 23)
    for (const [amount, expectedText, expectedWords] of CASES) {
      assert.strictEqual(formatAmountMxn(amount), expectedText, String(amount))
      assert.strictEqual(amountInWords(amount), expectedWords, String(amount))
    }
  })

  test('CA-8: número y letra describen el mismo entero de centavos', ({ assert }) => {
    for (const [amount] of CASES) {
      const cents = toCents(amount)
      assert.strictEqual(wordsToCents(amountInWords(amount)), cents, String(amount))
      assert.strictEqual(Number(formatAmountMxn(amount).replace(/[$,]/g, '')) * 100, cents)
    }
  })

  test('CA-8: los cuatro casos de rango lanzan RangeError', ({ assert }) => {
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, MAX_AMOUNT + 0.01]) {
      assert.throws(() => amountInWords(value), RangeError)
      assert.throws(() => formatAmountMxn(value), RangeError)
    }
  })

  test('el redondeo a centavos ocurre una sola vez y nunca produce 100/100', ({ assert }) => {
    // Un importe con tres decimales solo llega si alguien salta la captura: se redondea UNA vez, al entero de centavos
    assert.strictEqual(amountInWords(0.999), 'UN PESO 00/100 M.N.')
    assert.strictEqual(amountInWords(1.999), 'DOS PESOS 00/100 M.N.')
    assert.strictEqual(amountInWords(999.999), 'MIL PESOS 00/100 M.N.')
    assert.strictEqual(formatAmountMxn(999.999), '$1,000.00')
    assert.strictEqual(amountInWords(MAX_AMOUNT).endsWith(' PESOS 99/100 M.N.'), true)
  })
})
