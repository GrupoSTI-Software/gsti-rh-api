import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import type { SupplyTypeTeleworkCategory } from '#constants/supply_type_telework_category'
import { MAX_ALLOWANCE } from '#constants/telework_compliance_setting'
import TeleworkComplianceSettingService from '#services/telework_compliance_setting_service'
import UploadService from '#services/upload_service'
import { CIVIL_DATE_ANCHOR_ZONE, toBusinessDateString } from '#utils/business_date'
import { TenantContext } from '#utils/tenant_context'
import { ASSET_ERROR_KEYS, ASSET_FILE_NAME_PREFIX, OWN_EQUIPMENT_ADJUSTED_CLOSE_REASON, type OwnEquipmentClosedReason } from './assets.constants.js'
import { AssetError } from './assets.error.js'
import { streamAssetFile, type AssetFile } from './assets.service.js'
import type { OwnEquipmentDeclarationDto } from './dto/own_equipment_declarations.dto.js'
import type { OwnEquipmentDeclarationsRepository } from './own_equipment_declarations.repository.js'
import OwnEquipmentDeclarationsRepositoryMysql from './own_equipment_declarations.repository.mysql.js'
import {
  hasOwnEquipmentChanges,
  resolveOwnEquipmentFeeSource,
} from './telework_supplies.rules.js'

/**
 * Alta de la declaración del uso de equipo propio con su cuota
 * (VLRH-H1791306075599). Es la ÚNICA escritura de la historia.
 *
 * Orden obligatorio (CA-8): la pertenencia del colaborador se evalúa antes que
 * cualquier 422/409, para que ajeno, inexistente y dado de baja sean el mismo
 * 404. El pre-chequeo de cobertura y de vigente corre fuera de la transacción
 * (respuesta rápida) y se repite DENTRO, con el colaborador bloqueado por
 * `forUpdate`, para que dos altas simultáneas dejen una sola fila (CA-6): el
 * candado serializa y, si el UNIQUE condicionado igual choca, `ER_DUP_ENTRY`
 * se traduce al mismo 409 de vigente existente.
 */

/** Fecha de calendario `YYYY-MM-DD` (espejo de `assets.service.ts`). */
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Cuota mensual válida: número o texto con 1 a 8 enteros y hasta dos decimales.
 * No acepta signo, notación científica ni separadores.
 */
const MONTHLY_FEE = /^\d{1,8}(\.\d{1,2})?$/

/**
 * Normaliza la cuota cruda que llega del body (sin pasar por Vine) a número.
 *
 * Pura y exportada (spec §7 paso 5): se valida el TEXTO, no el número, porque
 * `Number("")` es `0` y `Math.round(v * 100) === v * 100` rechaza `0.29`.
 * Acepta número o texto que cumpla `^\d{1,8}(\.\d{1,2})?$` y no exceda
 * `MAX_ALLOWANCE`; todo lo demás lanza 422 `cuota-de-equipo-propio-invalida`.
 *
 * @throws AssetError 422 `cuota-de-equipo-propio-invalida`.
 */
export function parseMonthlyFee(raw: unknown): number {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || !MONTHLY_FEE.test(String(raw)) || raw > MAX_ALLOWANCE) {
      throw AssetError.ownEquipmentFeeInvalid()
    }
    return raw
  }

  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!MONTHLY_FEE.test(text) || Number(text) > MAX_ALLOWANCE) {
      throw AssetError.ownEquipmentFeeInvalid()
    }
    return Number(text)
  }

  throw AssetError.ownEquipmentFeeInvalid()
}

/** Campos del alta que ya validó Vine (sin `monthlyFee`). */
export interface OwnEquipmentDeclarationInput {
  category: SupplyTypeTeleworkCategory
  description: string
  conditions: string | null
  startDate: string
}

/**
 * Campos del ajuste que ya validó Vine (sin `monthlyFee`): todos opcionales
 * porque el servicio decide si el cambio es real comparando contra la fila
 * vigente. `conditions: null` limpia las condiciones (R5) y `undefined` las
 * hereda; lo mismo la descripción y la fecha de vigencia (que por defecto es
 * el día de hoy en zona de negocio).
 */
export interface OwnEquipmentDeclarationAdjustInput {
  effectiveDate?: string
  description?: string
  conditions?: string | null
}

/**
 * Campos del término que ya validó Vine (sin `monthlyFee`): fecha de fin
 * opcional —por omisión, el día de hoy en zona de negocio— y motivo
 * obligatorio del catálogo (Vine rebota `adjusted`).
 */
export interface OwnEquipmentCloseInput {
  endDate?: string
  closedReason: OwnEquipmentClosedReason
}

/**
 * Lo que la declaración necesita del almacenamiento: subir la evidencia del
 * alta y entregarla en la descarga. Inyectable por constructor para poder
 * doblarlo en las pruebas.
 */
export type OwnEquipmentEvidenceStorage = Pick<UploadService, 'fileUpload' | 'streamStoredFile'>

export default class OwnEquipmentDeclarationsService {
  constructor(
    private readonly repository: OwnEquipmentDeclarationsRepository = new OwnEquipmentDeclarationsRepositoryMysql(),
    private readonly storage: OwnEquipmentEvidenceStorage = new UploadService(),
    private readonly settings: Pick<TeleworkComplianceSettingService, 'getEffective'> = new TeleworkComplianceSettingService()
  ) {}

  /**
   * Da de alta la declaración del colaborador y devuelve su DTO.
   *
   * @throws AssetError 404 `colaborador-no-encontrado` | 422
   *   `colaborador-sin-teletrabajo` / `entrada-invalida` /
   *   `cuota-de-equipo-propio-invalida` | 409 `categoria-cubierta-por-activo` /
   *   `declaracion-de-equipo-propio-vigente-existente`.
   */
  async create(
    employeeId: number,
    input: OwnEquipmentDeclarationInput,
    rawMonthlyFee: unknown,
    userId: number
  ): Promise<OwnEquipmentDeclarationDto> {
    const scope = TenantContext.getScope()

    // Pertenencia primero: la empresa sale de la fila del colaborador, nunca del
    // body. Ajeno, inexistente o dado de baja → el mismo 404 (CA-8).
    const employee = await this.repository.findEmployeeForDeclaration(db, scope, employeeId, {
      lock: false,
    })
    if (employee === null) throw AssetError.employeeNotFound()

    if (employee.teleworkPercentage <= 0) throw AssetError.employeeWithoutTelework()

    const { startDate } = input
    if (!CALENDAR_DATE.test(startDate) || !DateTime.fromISO(startDate).isValid) {
      throw new AssetError(
        422,
        ASSET_ERROR_KEYS.INVALID_INPUT,
        'asset_invalid_input',
        'Datos inválidos',
        'Revisa los datos enviados.'
      )
    }

    // Cuota estándar de la empresa (Tarea 3): la cuota deja de ser obligatoria
    // en el alta; si no viene se toma la estándar vigente y, si tampoco existe,
    // se rechaza. El origen (`feeSource`) lo decide el servidor comparando
    // centavos contra la estándar (`resolveOwnEquipmentFeeSource`), nunca el
    // cliente ni la igualdad de flotantes.
    const { ownEquipmentFeeDefault } = await this.settings.getEffective(employee.businessUnitId)

    let monthlyFee: number
    if (rawMonthlyFee === undefined || rawMonthlyFee === null || rawMonthlyFee === '') {
      if (ownEquipmentFeeDefault === null) throw AssetError.ownEquipmentFeeInvalid()
      monthlyFee = ownEquipmentFeeDefault
    } else {
      monthlyFee = parseMonthlyFee(rawMonthlyFee)
    }

    const feeSource = resolveOwnEquipmentFeeSource(monthlyFee, ownEquipmentFeeDefault)

    if (await this.repository.hasOpenCoverage(db, scope, employeeId, input.category)) {
      throw AssetError.categoryCoveredByAsset()
    }
    if (await this.repository.hasOpenDeclaration(db, scope, employeeId, input.category)) {
      throw AssetError.ownEquipmentDeclarationOpenExists()
    }

    let declarationId: number
    try {
      declarationId = await db.transaction(async (trx) => {
        // Candado del colaborador: serializa dos altas simultáneas de la misma
        // categoría antes del re-chequeo (CA-6).
        const locked = await this.repository.findEmployeeForDeclaration(trx, scope, employeeId, {
          lock: true,
        })
        if (locked === null) throw AssetError.employeeNotFound()

        if (await this.repository.hasOpenCoverage(trx, scope, employeeId, input.category)) {
          throw AssetError.categoryCoveredByAsset()
        }
        if (await this.repository.hasOpenDeclaration(trx, scope, employeeId, input.category)) {
          throw AssetError.ownEquipmentDeclarationOpenExists()
        }

        return this.repository.insert(trx, {
          employeeId,
          businessUnitId: locked.businessUnitId,
          category: input.category,
          description: input.description,
          // La columna es NULL-able y el contrato dice `null`: la cadena vacía
          // (ya recortada por Vine) no es un valor de negocio, así que se guarda
          // como NULL en vez de persistir ''.
          conditions: input.conditions === '' ? null : input.conditions,
          startDate,
          monthlyFee,
          feeSource,
          createdByUserId: userId,
        })
      })
    } catch (error) {
      // Único re-mapeo: el UNIQUE condicionado que ganó la carrera del re-chequeo.
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw AssetError.ownEquipmentDeclarationOpenExists()
      }
      throw error
    }

    const declaration = await this.repository.findById(db, scope, declarationId)
    if (declaration === null) {
      // No debería faltar: se acaba de insertar y el alcance es el mismo.
      throw new Error('La declaración de equipo propio recién creada no se pudo leer.')
    }
    return declaration
  }

  /**
   * Ajusta la declaración versionada (VLRH-H1791493045968): cierra la vigente el
   * día civil anterior a la fecha de vigencia y abre la versión nueva en la
   * MISMA transacción, con el `UPDATE` antes del `INSERT` (al revés el UNIQUE de
   * vigente rechaza).
   *
   * Orden obligatorio (§11): cuota del body → pre-chequeo sin candado (404/409)
   * → transacción con el candado del colaborador primero y luego el de la
   * declaración → teletrabajo → cobertura → fecha → cambios → cierre + alta. La
   * empresa, el colaborador y la categoría de la versión nueva salen de la fila
   * vieja, nunca del body.
   *
   * @throws AssetError 422 `cuota-de-equipo-propio-invalida` /
   *   `colaborador-sin-teletrabajo` / `entrada-invalida` (fecha o sin cambios) |
   *   404 `declaracion-de-equipo-propio-no-encontrada` /
   *   `colaborador-no-encontrado` | 409
   *   `declaracion-de-equipo-propio-no-vigente` / `categoria-cubierta-por-activo` /
   *   `declaracion-de-equipo-propio-vigente-existente`.
   */
  async adjust(
    declarationId: number,
    input: OwnEquipmentDeclarationAdjustInput,
    rawMonthlyFee: unknown,
    userId: number
  ): Promise<OwnEquipmentDeclarationDto> {
    const scope = TenantContext.getScope()

    // La cuota es REQUERIDA en el ajuste (spec §11): se parsea
    // incondicionalmente justo tras el alcance y ANTES del pre-chequeo, de modo
    // que un PUT sin `monthlyFee` responde 422 `cuota-de-equipo-propio-invalida`
    // en vez de caer a los chequeos de fecha/cambios. La cuota parseada es el
    // monto de la versión nueva y el que compara `hasOwnEquipmentChanges`.
    const fee = parseMonthlyFee(rawMonthlyFee)

    // Pre-chequeo sin candado (respuesta rápida): inexistente, ajena o borrada
    // → 404 indistinguible (CA-11); ya cerrada → 409.
    const prechecked = await this.repository.findDeclarationForChange(db, scope, declarationId, {
      lock: false,
    })
    if (prechecked === null) throw AssetError.ownEquipmentDeclarationNotFound()
    if (prechecked.status !== 'active') throw AssetError.ownEquipmentDeclarationNotActive()

    const employeeId = prechecked.employeeId

    let newDeclarationId: number
    try {
      newDeclarationId = await db.transaction(async (trx) => {
        // Candado en orden fijo: colaborador primero, luego declaración (CA-10:
        // serializa dos ajustes simultáneos y el segundo ve la vieja ya cerrada).
        const employee = await this.repository.findEmployeeForDeclaration(trx, scope, employeeId, {
          lock: true,
        })
        if (employee === null) throw AssetError.employeeNotFound()

        const forChange = await this.repository.findDeclarationForChange(trx, scope, declarationId, {
          lock: true,
        })
        // Dado de baja lógicamente entre el pre-chequeo y el candado, o fuera
        // del alcance: el mismo 404 / 409 del pre-chequeo.
        if (forChange === null) throw AssetError.ownEquipmentDeclarationNotFound()
        if (forChange.status !== 'active') throw AssetError.ownEquipmentDeclarationNotActive()

        if (employee.teleworkPercentage <= 0) throw AssetError.employeeWithoutTelework()

        if (await this.repository.hasOpenCoverage(trx, scope, employeeId, forChange.category)) {
          throw AssetError.categoryCoveredByAsset()
        }

        const effectiveDate = input.effectiveDate ?? toBusinessDateString()
        if (
          !CALENDAR_DATE.test(effectiveDate) ||
          !DateTime.fromISO(effectiveDate).isValid ||
          effectiveDate <= forChange.startDate
        ) {
          // Prefijo i18n fantasma (no existe en `resources/langs/*`): el detalle
          // propio es siempre el del respaldo.
          throw new AssetError(
            422,
            ASSET_ERROR_KEYS.INVALID_INPUT,
            'asset_own_equipment_declaration_invalid_date',
            'Datos inválidos',
            'La fecha de vigencia debe ser posterior al inicio de la declaración vigente'
          )
        }

        // El chequeo de cambios va DESPUÉS del de fecha.
        if (!hasOwnEquipmentChanges(forChange, { monthlyFee: fee, ...input })) {
          throw new AssetError(
            422,
            ASSET_ERROR_KEYS.INVALID_INPUT,
            'asset_own_equipment_declaration_no_changes',
            'Datos inválidos',
            'El ajuste no cambia nada: cuota, descripción o condiciones deben diferir de la versión vigente'
          )
        }

        // El origen de la cuota se recalcula contra la estándar vigente de la
        // empresa, sin heredarlo de la versión vieja (R2, Review Focus 2).
        const { ownEquipmentFeeDefault } = await this.settings.getEffective(forChange.businessUnitId)

        // El `UPDATE` de la vieja va ANTES del `INSERT` de la nueva: libera el
        // UNIQUE de vigente de la categoría.
        await this.repository.closeDeclaration(trx, declarationId, {
          endDate: this.díaCivilAnterior(effectiveDate),
          reason: OWN_EQUIPMENT_ADJUSTED_CLOSE_REASON,
          userId,
        })

        return this.repository.insert(trx, {
          // Empresa, colaborador y categoría salen de la fila vieja, nunca del body.
          employeeId: forChange.employeeId,
          businessUnitId: forChange.businessUnitId,
          category: forChange.category,
          description: input.description ?? forChange.description,
          conditions:
            input.conditions === undefined
              ? forChange.conditions
              : input.conditions === ''
                ? null
                : input.conditions,
          startDate: effectiveDate,
          monthlyFee: fee,
          feeSource: resolveOwnEquipmentFeeSource(fee, ownEquipmentFeeDefault),
          createdByUserId: userId,
        })
      })
    } catch (error) {
      // Único re-mapeo: el UNIQUE condicionado que ganó la carrera del candado.
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw AssetError.ownEquipmentDeclarationOpenExists()
      }
      throw error
    }

    const declaration = await this.repository.findById(db, scope, newDeclarationId)
    if (declaration === null) {
      // No debería faltar: se acaba de insertar y el alcance es el mismo.
      throw new Error('La declaración de equipo propio ajustada no se pudo leer.')
    }
    return declaration
  }

  /**
   * Termina la declaración vigente (VLRH-H1791493045968): fija su periodo, su
   * motivo del catálogo y su autor. El término solo bloquea la DECLARACIÓN,
   * nunca el colaborador: procede con el colaborador dado de baja o a 0% para
   * poder limpiar siempre.
   *
   * Orden: pre-chequeo sin candado (404/409) → transacción con el candado de la
   * declaración y su re-chequeo → fecha (borde INCLUSIVO: `endDate` igual al
   * inicio es válido) → cierre. `endDate` por omisión es hoy en zona de negocio.
   *
   * @throws AssetError 404 `declaracion-de-equipo-propio-no-encontrada` |
   *   409 `declaracion-de-equipo-propio-no-vigente` | 422 `entrada-invalida`.
   */
  async close(
    declarationId: number,
    input: OwnEquipmentCloseInput,
    userId: number
  ): Promise<OwnEquipmentDeclarationDto> {
    const scope = TenantContext.getScope()

    // Pre-chequeo sin candado (respuesta rápida): inexistente, ajena o borrada
    // → 404 indistinguible (CA-11); ya cerrada → 409.
    const prechecked = await this.repository.findDeclarationForChange(db, scope, declarationId, {
      lock: false,
    })
    if (prechecked === null) throw AssetError.ownEquipmentDeclarationNotFound()
    if (prechecked.status !== 'active') throw AssetError.ownEquipmentDeclarationNotActive()

    await db.transaction(async (trx) => {
      // Solo el candado de la DECLARACIÓN: el término no exige al colaborador
      // vivo ni con teletrabajo (baja y 0% se permiten para poder limpiar).
      const forChange = await this.repository.findDeclarationForChange(trx, scope, declarationId, {
        lock: true,
      })
      if (forChange === null) throw AssetError.ownEquipmentDeclarationNotFound()
      if (forChange.status !== 'active') throw AssetError.ownEquipmentDeclarationNotActive()

      // `endDate` por omisión es hoy en zona de negocio, nunca `new Date()` en UTC.
      const endDate = input.endDate ?? toBusinessDateString()
      if (!CALENDAR_DATE.test(endDate) || !DateTime.fromISO(endDate).isValid) {
        // Prefijo i18n fantasma (no existe en `resources/langs/*`): el detalle
        // propio es siempre el del respaldo.
        throw new AssetError(
          422,
          ASSET_ERROR_KEYS.INVALID_INPUT,
          'asset_own_equipment_declaration_invalid_date',
          'Datos inválidos',
          'La fecha de término no es una fecha válida'
        )
      }
      // Borde INCLUSIVO: `endDate` igual al inicio de la vigente es válido (regla 8).
      if (endDate < forChange.startDate) {
        throw new AssetError(
          422,
          ASSET_ERROR_KEYS.INVALID_INPUT,
          'asset_own_equipment_declaration_invalid_date',
          'Datos inválidos',
          'La fecha de término no puede ser anterior al inicio de la declaración'
        )
      }

      await this.repository.closeDeclaration(trx, declarationId, {
        endDate,
        reason: input.closedReason,
        userId,
      })
    })

    const declaration = await this.repository.findById(db, scope, declarationId)
    if (declaration === null) {
      // No debería faltar: se acaba de cerrar y el alcance es el mismo.
      throw new Error('La declaración de equipo propio terminada no se pudo leer.')
    }
    return declaration
  }

  /**
   * Evidencia adjunta de la declaración, lista para escribirse en la respuesta
   * (VLRH-H1791493046616, CA-7). El alcance de empresas viaja DENTRO de la
   * consulta del puerto, así que la declaración ajena, la inexistente y la que
   * no tiene archivo responden el MISMO 404 (CA-8); el nombre de la descarga es
   * genérico (`equipo-propio-<declarationId>`), nunca el del archivo original.
   *
   * @throws AssetError 404 `archivo-no-encontrado`.
   */
  async evidenceFile(declarationId: number): Promise<AssetFile> {
    const record = await this.repository.findEvidencePath(TenantContext.getScope(), declarationId)
    if (record === null) throw AssetError.fileNotFound()
    // La ruta viaja TAL CUAL: una cadena vacía (escritura fuera de banda) la
    // trata `streamAssetFile` como «sin archivo», igual que `null`.
    return streamAssetFile(this.storage, record.storedPath, [
      ASSET_FILE_NAME_PREFIX.ownEquipmentEvidence,
      declarationId,
    ])
  }

  /**
   * Día civil anterior a una fecha `YYYY-MM-DD`, anclado al calendario
   * (`CIVIL_DATE_ANCHOR_ZONE`) para no correr el día por UTC: la vigente cierra
   * justo el día previo al inicio de la versión nueva.
   */
  private díaCivilAnterior(iso: string): string {
    return toBusinessDateString(DateTime.fromISO(iso, { zone: CIVIL_DATE_ANCHOR_ZONE }).minus({ days: 1 }))
  }
}
