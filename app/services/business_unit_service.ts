import BusinessUnit from '#models/business_unit'
import { I18n } from '@adonisjs/i18n'
import { BusinessUnitInterface } from '../interfaces/business_unit_interface.js'
import { ResponseDataInterface } from '../interfaces/response_data_interface.js'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export default class BusinessUnitService {
  private t: (key: string, params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  private buildSlugBase(name: string): string {
    return (
      name
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-') || 'empresa'
    )
  }

  async resolveUniqueSlug(name: string): Promise<string> {
    const base = this.buildSlugBase(name)
    let slug = base
    let counter = 1
    let exists = await BusinessUnit.query().where('business_unit_slug', slug).first()
    while (exists) {
      slug = `${base}-${counter}`
      counter++
      exists = await BusinessUnit.query().where('business_unit_slug', slug).first()
    }
    return slug
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
