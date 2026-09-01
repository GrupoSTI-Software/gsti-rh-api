import BusinessUnit from '#models/business_unit'
import { I18n } from '@adonisjs/i18n'
import { BusinessUnitInterface } from '../interfaces/business_unit_interface.js'
import { ResponseDataInterface } from '../interfaces/response_data_interface.js'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { randomStringFromAlphabet } from '../helpers/csprng_string.js'
import {
  BUSINESS_UNIT_SLUG_ALPHABET,
  BUSINESS_UNIT_SLUG_PREFIX,
  BUSINESS_UNIT_SLUG_RANDOM_LENGTH,
  BUSINESS_UNIT_SLUG_UNIQUE_INDEX,
} from '../constants/business_unit.js'

export default class BusinessUnitService {
  private t: (key: string, params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  /**
   * Genera un slug opaco para una empresa nueva (USRH1787932877000).
   *
   * Formato: `bu-` + 12 caracteres de `abcdefghjkmnpqrstuvwxyz23456789`.
   * - Sin efectos secundarios: no lee ni escribe en base de datos.
   * - CSPRNG con muestreo por rechazo vía `randomStringFromAlphabet`.
   * - La unicidad la garantiza el índice `business_units_slug_active_unique`;
   *   este método solo produce el candidato por intento.
   * - El nombre de la empresa no participa: dos empresas con el mismo nombre
   *   reciben tokens distintos, y una empresa borrada no puede ceder su slug.
   */
  generateOpaqueSlug(): string {
    return (
      BUSINESS_UNIT_SLUG_PREFIX +
      randomStringFromAlphabet(BUSINESS_UNIT_SLUG_ALPHABET, BUSINESS_UNIT_SLUG_RANDOM_LENGTH)
    )
  }

  /**
   * Comprueba si un error es un `ER_DUP_ENTRY` del índice de unicidad del
   * slug (`business_units_slug_active_unique`) y solo de ese índice.
   *
   * La discriminación es por nombre de índice, no por código de error a
   * secas: un `ER_DUP_ENTRY` de otro índice (p. ej. el de emails únicos)
   * no debe reintentarse y no debe confundirse con una colisión de slug.
   *
   * Revisa `error.code` y `error.original.code` porque Lucid puede envolver
   * el error del driver MySQL en un objeto propio.
   */
  isSlugDuplicateError(error: unknown): boolean {
    if (error === null || error === undefined || typeof error !== 'object') return false
    const err = error as {
      code?: string
      sqlMessage?: string
      original?: { code?: string; sqlMessage?: string }
    }
    const code = err.code ?? err.original?.code
    const sqlMessage = err.sqlMessage ?? err.original?.sqlMessage ?? ''
    return code === 'ER_DUP_ENTRY' && sqlMessage.includes(BUSINESS_UNIT_SLUG_UNIQUE_INDEX)
  }

  /**
   * @param trx Transacción opcional (p. ej. la del alta self-service en
   * `SignupDraftService.complete()`, USRH1783712837572). Sin `trx`, se
   * comporta igual que antes (compatible hacia atrás).
   */
  async create(businessUnit: BusinessUnit, trx?: TransactionClientContract): Promise<BusinessUnit> {
    const newBusinessUnit = new BusinessUnit()
    newBusinessUnit.businessUnitName = businessUnit.businessUnitName
    newBusinessUnit.businessUnitSlug = businessUnit.businessUnitSlug
    newBusinessUnit.businessUnitLegalName = businessUnit.businessUnitLegalName
    newBusinessUnit.businessUnitActive = businessUnit.businessUnitActive
    newBusinessUnit.businessUnitOrigin = businessUnit.businessUnitOrigin
    if (trx) {
      newBusinessUnit.useTransaction(trx)
    }
    await newBusinessUnit.save()
    return newBusinessUnit
  }

  async index(scopeIds: number[]): Promise<ResponseDataInterface> {
    try {
      const businessUnitsQuery =
        scopeIds.length > 0
          ? await BusinessUnit.query()
              .where('business_unit_active', 1)
              .whereNull('business_unit_deleted_at')
              .whereIn('business_unit_id', scopeIds)
              .orderBy('business_unit_name', 'asc')
          : []

      const businessUnitsRes: BusinessUnitInterface[] = [
        ...businessUnitsQuery,
      ] as unknown as BusinessUnitInterface[]

      return {
        status: 200,
        type: 'success',
        title: this.t('resources'),
        message: this.t('resources_were_found_successfully'),
        data: {
          data: businessUnitsRes,
        },
      }
    } catch (error) {
      throw new Error(error)
    }
  }
}
