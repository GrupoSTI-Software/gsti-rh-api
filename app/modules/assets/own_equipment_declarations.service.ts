import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import type { SupplyTypeTeleworkCategory } from '#constants/supply_type_telework_category'
import { MAX_ALLOWANCE } from '#constants/telework_compliance_setting'
import { TenantContext } from '#utils/tenant_context'
import { ASSET_ERROR_KEYS } from './assets.constants.js'
import { AssetError } from './assets.error.js'
import type { OwnEquipmentDeclarationDto } from './dto/own_equipment_declarations.dto.js'
import type { OwnEquipmentDeclarationsRepository } from './own_equipment_declarations.repository.js'
import OwnEquipmentDeclarationsRepositoryMysql from './own_equipment_declarations.repository.mysql.js'

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

export default class OwnEquipmentDeclarationsService {
  constructor(
    private readonly repository: OwnEquipmentDeclarationsRepository = new OwnEquipmentDeclarationsRepositoryMysql()
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

    const monthlyFee = parseMonthlyFee(rawMonthlyFee)

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
          conditions: input.conditions,
          startDate,
          monthlyFee,
          feeSource: 'adjusted',
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
}
