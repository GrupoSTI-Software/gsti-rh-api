#!/usr/bin/env node
/* eslint-disable no-console -- script de CLI: la salida es el propósito del archivo. */
/**
 * Verificación estadística del CSPRNG (USRH1783115930049 / USRH1786458240779).
 *
 * NO es parte de la suite de CI (los p-values son, por naturaleza, variables
 * de una corrida a otra incluso con una fuente perfecta; gatear el build con
 * un umbral estricto produciría flakiness). Es evidencia estadística
 * complementaria a la revisión de diseño (fuente = OS CSPRNG vía OpenSSL).
 *
 * Implementa un subconjunto real de NIST SP 800-22 (frequency/monobit test
 * y runs test, sección 2.1 y 2.3 del estándar) sobre los bytes crudos que
 * produce `crypto.randomBytes` — la misma fuente que usan
 * `randomStringFromAlphabet` y `secureRandomInt` — más un chi-cuadrado de
 * bondad de ajuste sobre la salida real de ambas funciones del helper.
 *
 * Uso: node scripts/run_verify_csprng.js
 * (el .js registra el loader ts-node/esm, igual que hace `ace.js`, porque
 * este script importa `#helpers/csprng_string`, un subpath import de TS).
 */
import { randomBytes, randomInt } from 'node:crypto'
import { randomStringFromAlphabet, secureRandomInt } from '#helpers/csprng_string'

// --- utilidades estadísticas -----------------------------------------------

/** erfc(x) — aproximación de Abramowitz & Stegun 7.1.26 (error < 1.5e-7). */
function erfc(x: number): number {
  const z = Math.abs(x)
  const t = 1 / (1 + 0.5 * z)
  const tau =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    )
  return x >= 0 ? tau : 2 - tau
}

/** Función gamma incompleta superior regularizada Q(a, x), para el p-value del chi-cuadrado. */
function upperIncompleteGammaQ(a: number, x: number): number {
  // Serie/fracción continua estándar (Numerical Recipes), suficiente para df grandes.
  if (x < a + 1) {
    // Serie para P(a,x), luego Q = 1 - P
    let sum = 1 / a
    let term = sum
    let n = a
    for (let i = 0; i < 500; i++) {
      n += 1
      term *= x / n
      sum += term
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break
    }
    const logGamma = lnGamma(a)
    const p = sum * Math.exp(-x + a * Math.log(x) - logGamma)
    return 1 - p
  }
  // Fracción continua para Q(a,x) directamente.
  let b = x + 1 - a
  let c = 1e300
  let d = 1 / b
  let h = d
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < 1e-300) d = 1e-300
    c = b + an / c
    if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-14) break
  }
  const logGamma = lnGamma(a)
  return h * Math.exp(-x + a * Math.log(x) - logGamma)
}

function lnGamma(x: number): number {
  const g = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x)
  }
  x -= 1
  let a = 0.99999999999980993
  const t = x + 7.5
  for (const [i, gi] of g.entries()) {
    a += gi / (x + i + 1)
  }
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}

/** p-value del chi-cuadrado de bondad de ajuste con `df` grados de libertad. */
function chiSquarePValue(statistic: number, df: number): number {
  return upperIncompleteGammaQ(df / 2, statistic / 2)
}

function bytesToBits(buf: Buffer): Uint8Array {
  const bits = new Uint8Array(buf.length * 8)
  let idx = 0
  for (const byte of buf) {
    for (let b = 7; b >= 0; b--) {
      bits[idx++] = (byte >> b) & 1
    }
  }
  return bits
}

// --- NIST SP 800-22 §2.1: Frequency (Monobit) Test -------------------------

function monobitTest(bits: Uint8Array) {
  const n = bits.length
  let sum = 0
  for (const bit of bits) sum += bit === 1 ? 1 : -1
  const sObs = Math.abs(sum) / Math.sqrt(n)
  const pValue = erfc(sObs / Math.SQRT2)
  return { name: 'Frequency (Monobit)', n, statistic: sObs, pValue }
}

// --- NIST SP 800-22 §2.3: Runs Test -----------------------------------------

function runsTest(bits: Uint8Array) {
  const n = bits.length
  const ones = bits.reduce((acc: number, b: number) => acc + b, 0)
  const pi = ones / n
  const tau = 2 / Math.sqrt(n)
  if (Math.abs(pi - 0.5) >= tau) {
    return { name: 'Runs', n, statistic: null, pValue: null, skipped: 'pre-test falló (pi lejos de 0.5)' }
  }
  let vObs = 1
  for (let i = 1; i < n; i++) {
    if (bits[i] !== bits[i - 1]) vObs++
  }
  const numerator = Math.abs(vObs - 2 * n * pi * (1 - pi))
  const denominator = 2 * Math.sqrt(2 * n) * pi * (1 - pi)
  const pValue = erfc(numerator / denominator)
  return { name: 'Runs', n, statistic: vObs, pValue }
}

// --- Chi-cuadrado de frecuencia sobre la salida real del helper ------------

function chiSquareUniformity(counts: number[], expectedPerBin: number) {
  let chiSq = 0
  for (const observed of counts) {
    chiSq += (observed - expectedPerBin) ** 2 / expectedPerBin
  }
  const df = counts.length - 1
  const pValue = chiSquarePValue(chiSq, df)
  return { chiSq, df, pValue }
}

// --- Ejecución ---------------------------------------------------------------

const ALPHA = 0.001 // umbral NIST estándar

function report(label: string, pValue: number | null, skipped?: string | null): boolean {
  if (skipped) {
    console.log(`  ${label}: OMITIDO (${skipped})`)
    return true
  }
  const verdict = pValue !== null && pValue >= ALPHA ? 'PASA' : 'FALLA'
  console.log(`  ${label}: p-value = ${pValue?.toFixed(6)} → ${verdict} (umbral α=${ALPHA})`)
  return pValue !== null && pValue >= ALPHA
}

console.log('=== 1) NIST SP 800-22 — Frequency (Monobit) Test sobre randomBytes crudo ===')
{
  const buf = randomBytes(125000) // 1,000,000 bits
  const bits = bytesToBits(buf)
  const { pValue, n } = monobitTest(bits)
  console.log(`  n = ${n} bits`)
  report('Monobit', pValue)
}

console.log('\n=== 2) NIST SP 800-22 — Runs Test sobre randomBytes crudo ===')
{
  const buf = randomBytes(125000)
  const bits = bytesToBits(buf)
  const { pValue, skipped } = runsTest(bits)
  report('Runs', pValue, skipped)
}

console.log('\n=== 3) Chi-cuadrado de bondad de ajuste — secureRandomInt sobre rango real del PIN ===')
{
  // Rango real usado por generateRecoveryPin/generatePin: [100000, 1000000).
  // Se re-mapea a 900 buckets (100 valores por bucket) para tener población
  // esperada por bucket suficientemente grande (regla práctica >= 5, aquí ~222).
  const SAMPLES = 200000
  const BUCKETS = 900
  const counts = new Array(BUCKETS).fill(0)
  for (let i = 0; i < SAMPLES; i++) {
    const value = secureRandomInt(100000, 1000000) - 100000 // [0, 900000)
    counts[Math.floor(value / 1000)]++
  }
  const expected = SAMPLES / BUCKETS
  const { chiSq, df, pValue } = chiSquareUniformity(counts, expected)
  console.log(`  muestras=${SAMPLES}, buckets=${BUCKETS}, esperado/bucket=${expected.toFixed(1)}`)
  console.log(`  chi² = ${chiSq.toFixed(2)}, df = ${df}`)
  report('Chi² secureRandomInt', pValue)
}

console.log('\n=== 4) Chi-cuadrado de bondad de ajuste — randomStringFromAlphabet (passphrase del buzón) ===')
{
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 32 símbolos, el real del buzón
  const SAMPLES_CHARS = 660000 // 20,000 caracteres esperados por símbolo
  const counts = new Array(ALPHABET.length).fill(0)
  const chunk = randomStringFromAlphabet(ALPHABET, SAMPLES_CHARS)
  for (const char of chunk) {
    counts[ALPHABET.indexOf(char)]++
  }
  const expected = SAMPLES_CHARS / ALPHABET.length
  const { chiSq, df, pValue } = chiSquareUniformity(counts, expected)
  console.log(`  caracteres=${SAMPLES_CHARS}, símbolos=${ALPHABET.length}, esperado/símbolo=${expected.toFixed(1)}`)
  console.log(`  chi² = ${chiSq.toFixed(2)}, df = ${df}`)
  report('Chi² randomStringFromAlphabet', pValue)
}

console.log('\n=== 5) Sanidad cruzada: randomInt nativo vs. secureRandomInt (deben comportarse igual) ===')
{
  const SAMPLES = 100000
  const BUCKETS = 100
  const counts = new Array(BUCKETS).fill(0)
  for (let i = 0; i < SAMPLES; i++) {
    counts[randomInt(0, BUCKETS)]++
  }
  const expected = SAMPLES / BUCKETS
  const { chiSq, df, pValue } = chiSquareUniformity(counts, expected)
  console.log(`  chi² = ${chiSq.toFixed(2)}, df = ${df}`)
  report('Chi² randomInt nativo (control)', pValue)
}

console.log('\nNota: los p-values variarán entre corridas (son estadísticos sobre datos aleatorios reales).')
console.log('Un solo FALLA aislado con α=0.001 no es concluyente; una corrida sistemáticamente sesgada sí lo sería.')
