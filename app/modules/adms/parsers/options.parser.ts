import type { AccessPointProfileVersionsSource } from '#models/access_point_profile'

export interface ParsedOptions {
  raw: Readonly<Record<string, string>>
  deviceName: string | null
  mac: string | null
  ipAddress: string | null
  platform: string | null
  oemVendor: string | null
  fwVersion: string | null
  pushVersion: string | null
  fpVersion: string | null
  faceVersion: string | null
  fvVersion: string | null
  pvVersion: string | null
  multiBioDataSupport: string | null
  multiBioPhotoSupport: string | null
  multiBioVersion: string | null
  maxMultiBioDataCount: string | null
  maxMultiBioPhotoCount: string | null
  maxFaceCount: number | null
  maxUserPhotoCount: number | null
  maxUserCount: number | null
  maxFingerCount: number | null
  maxAttLogCount: number | null
  userCount: number | null
  fpCount: number | null
  faceCount: number | null
  transactionCount: number | null
  fingerFunOn: number | null
  faceFunOn: number | null
  photoFunOn: number | null
  userPicUrlFunOn: number | null
  sipEnableUnit: number | null
  visualIntercomFunOn: number | null
  subcontractingUpgradeFunOn: number | null
  videoProtocol: string | null
}

export type BioModality = 'fp' | 'face' | 'fv' | 'pv'

export interface VersionMismatch {
  modality: BioModality
  flat: string
  multi: string
}

export interface ResolvedVersions {
  fpVersion: string | null
  faceVersion: string | null
  fvVersion: string | null
  pvVersion: string | null
  source: AccessPointProfileVersionsSource
  mismatches: VersionMismatch[]
}

/**
 * Indice de cada modalidad dentro de las cadenas `MultiBio*` (SDK PUSH de
 * ZKTeco): 0 general, 1 huella, 2 rostro infrarrojo, 3 voz, 4 iris, 5 retina,
 * 6 huella palmar, 7 vena del dedo, 8 palma, 9 rostro de luz visible.
 * Coherente con lo medido: el V5L declara `MultiBioDataSupport=0:1:0:0:0:0:0:0:1:1`
 * y trae `PvFunOn=1` (palma, indice 8) y `FaceVersion=39` (luz visible, indice 9);
 * el SenseFace declara `0:1:0:0:0:0:0:0:0:1` y `PvFunOn=0`.
 */
export const MULTI_BIO_INDEX: Readonly<Record<BioModality, number>> = {
  fp: 1,
  fv: 7,
  pv: 8,
  face: 9,
}

const KEY_VALUE = /^([^=]+)=(.*)$/s

function normalizeKey(key: string): string {
  return key.trim().replace(/^~/, '')
}

/**
 * `options` llega como `k=v,k=v,...` en una sola linea. Un valor puede traer
 * comas (`~OEMVendor=ZKTECO CO., LTD.`): todo fragmento sin `=` se pega al
 * valor anterior. El prefijo `~` es decoracion del firmware y se retira.
 * Un fragmento con clave vacia se descarta. Nunca lanza.
 */
export function splitOptions(body: string): Record<string, string> {
  const raw: Record<string, string> = Object.create(null) as Record<string, string>
  let currentKey: string | null = null
  for (const fragment of body.replace(/\r?\n/g, ',').split(',')) {
    const match = KEY_VALUE.exec(fragment)
    if (match) {
      const key = normalizeKey(match[1])
      if (key.length === 0) {
        currentKey = null
        continue
      }
      currentKey = key
      raw[key] = match[2].trim()
      continue
    }
    const tail = fragment.trim()
    if (currentKey !== null && tail.length > 0) {
      raw[currentKey] = `${raw[currentKey]}, ${tail}`
    }
  }
  return raw
}

function text(raw: Record<string, string>, key: string): string | null {
  const value = raw[key]
  return value !== undefined && value.length > 0 ? value : null
}

function integer(raw: Record<string, string>, key: string): number | null {
  const value = text(raw, key)
  if (value === null) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

/** Banderas `*FunOn`: `1`, `0` o vacio (el aparato no la declara). */
function flag(raw: Record<string, string>, key: string): number | null {
  const value = text(raw, key)
  if (value === '1') return 1
  if (value === '0') return 0
  return null
}

export function parseOptionsBody(body: string): ParsedOptions {
  const raw = splitOptions(body)
  return {
    raw,
    deviceName: text(raw, 'DeviceName'),
    mac: text(raw, 'MAC'),
    ipAddress: text(raw, 'IPAddress'),
    platform: text(raw, 'Platform'),
    oemVendor: text(raw, 'OEMVendor'),
    fwVersion: text(raw, 'FWVersion'),
    pushVersion: text(raw, 'PushVersion'),
    fpVersion: text(raw, 'FPVersion'),
    faceVersion: text(raw, 'FaceVersion'),
    fvVersion: text(raw, 'FvVersion'),
    pvVersion: text(raw, 'PvVersion'),
    multiBioDataSupport: text(raw, 'MultiBioDataSupport'),
    multiBioPhotoSupport: text(raw, 'MultiBioPhotoSupport'),
    multiBioVersion: text(raw, 'MultiBioVersion'),
    maxMultiBioDataCount: text(raw, 'MaxMultiBioDataCount'),
    maxMultiBioPhotoCount: text(raw, 'MaxMultiBioPhotoCount'),
    maxFaceCount: integer(raw, 'MaxFaceCount'),
    maxUserPhotoCount: integer(raw, 'MaxUserPhotoCount'),
    maxUserCount: integer(raw, 'MaxUserCount'),
    maxFingerCount: integer(raw, 'MaxFingerCount'),
    maxAttLogCount: integer(raw, 'MaxAttLogCount'),
    userCount: integer(raw, 'UserCount'),
    fpCount: integer(raw, 'FPCount'),
    faceCount: integer(raw, 'FaceCount'),
    transactionCount: integer(raw, 'TransactionCount'),
    fingerFunOn: flag(raw, 'FingerFunOn'),
    faceFunOn: flag(raw, 'FaceFunOn'),
    photoFunOn: flag(raw, 'PhotoFunOn'),
    userPicUrlFunOn: flag(raw, 'UserPicURLFunOn'),
    sipEnableUnit: flag(raw, 'SipEnableUnit'),
    visualIntercomFunOn: flag(raw, 'VisualIntercomFunOn'),
    subcontractingUpgradeFunOn: flag(raw, 'SubcontractingUpgradeFunOn'),
    videoProtocol: text(raw, 'VideoProtocol'),
  }
}

/** Posicion de una modalidad en `MultiBioVersion`; `0` o vacio es "sin version". */
export function multiBioSlot(value: string | null, index: number): string | null {
  if (value === null) return null
  const slot = value.split(':')[index]?.trim()
  return slot !== undefined && slot.length > 0 && slot !== '0' ? slot : null
}

/**
 * Version por modalidad (spec 9.1): si `MultiBioVersion` trae la modalidad,
 * prevalece y se registra `multibio`; si ademas el campo plano discrepa, se
 * deja constancia para el incidente `version_source_mismatch`. Sin
 * `MultiBioVersion`, vale el campo plano (`flat`). Ausencia es `null`.
 */
export function resolveVersions(parsed: ParsedOptions): ResolvedVersions {
  const flat: Record<BioModality, string | null> = {
    fp: parsed.fpVersion,
    face: parsed.faceVersion,
    fv: parsed.fvVersion,
    pv: parsed.pvVersion,
  }
  const resolved: Record<BioModality, string | null> = { fp: null, face: null, fv: null, pv: null }
  const source: AccessPointProfileVersionsSource = {}
  const mismatches: VersionMismatch[] = []

  for (const modality of Object.keys(MULTI_BIO_INDEX) as BioModality[]) {
    const multi = multiBioSlot(parsed.multiBioVersion, MULTI_BIO_INDEX[modality])
    const plain = flat[modality]
    if (multi !== null) {
      resolved[modality] = multi
      source[modality] = 'multibio'
      if (plain !== null && plain !== multi) mismatches.push({ modality, flat: plain, multi })
      continue
    }
    if (plain !== null) {
      resolved[modality] = plain
      source[modality] = 'flat'
    }
  }

  return {
    fpVersion: resolved.fp,
    faceVersion: resolved.face,
    fvVersion: resolved.fv,
    pvVersion: resolved.pv,
    source,
    mismatches,
  }
}
