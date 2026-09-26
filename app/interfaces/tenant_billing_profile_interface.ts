import type { BillingProfileMissingField } from '../helpers/tenant_billing_profile_completeness.js'
import type { SatTaxpayerType } from '../helpers/sat_taxpayer_type.js'

export type { BillingProfileMissingField } from '../helpers/tenant_billing_profile_completeness.js'
export type { SatTaxpayerType } from '../helpers/sat_taxpayer_type.js'

/**
 * Contrato HTTP del perfil de facturación fiscal del tenant (USRH1786737531057, USRH1786737531066).
 *
 * Envoltura de éxito fijada para las historias siguientes de la cadena CAP-07-06:
 * `{ type: 'success', data: TenantBillingProfileView }`.
 * Errores: `{ title, detail, key, code }` vía prefijo `TNT.BILL.*`.
 *
 * `billingProfileComplete` y `missingFields` se calculan en servidor; el landlord GSTI
 * (USRH1786737531069) consume este contrato sin reimplementar la regla de completitud.
 */

/** Vista del perfil de facturación expuesta al cliente tenant. */
export interface TenantBillingProfileView {
  /** Indica si ya existe fila persistida en `tenant_billing_profiles`. */
  exists: boolean
  /** RFC en claro; `null` si no se ha capturado o se omitió en el alta. */
  rfc: string | null
  /** Razón social fiscal impresa en la factura (independiente del nombre legal registrado). */
  legalName: string
  /** Código postal del domicilio fiscal; `null` si no se ha capturado. */
  postalCode: string | null
  /** Clave c_RegimenFiscal del SAT; `null` si no se ha capturado. */
  taxRegimeCode: string | null
  /** Correo de contacto fiscal; independiente del correo del owner. */
  billingEmail: string | null
  /** Clave c_UsoCFDI por default de la empresa; `null` si no se ha capturado. */
  cfdiUseCode: string | null
  /** Calle del domicilio fiscal (USRH1789097550393); `null` si no se ha capturado. */
  street: string | null
  /** Número exterior; `null` si no se ha capturado. */
  exteriorNumber: string | null
  /** Número interior; `null` si no aplica o no se ha capturado. */
  interiorNumber: string | null
  /** Colonia; `null` si no se ha capturado. */
  neighborhood: string | null
  /** Municipio o alcaldía; `null` si no se ha capturado. */
  municipality: string | null
  /** Entidad federativa (texto libre); `null` si no se ha capturado. */
  state: string | null
  /** Nombre completo del representante legal; `null` si no se ha capturado. */
  legalRepresentativeName: string | null
  /** Cargo con el que firma el representante legal; `null` si no se ha capturado. */
  legalRepresentativeRole: string | null
  /** Derivado del RFC; `null` si no hay RFC capturado. */
  taxpayerType: SatTaxpayerType | null
  /** Indica si el perfil tiene todos los datos obligatorios para facturar (regla 8). */
  billingProfileComplete: boolean
  /** Campos faltantes para completitud; subconjunto de las cinco claves obligatorias. */
  missingFields: BillingProfileMissingField[]
  /** ISO-8601 de creación; `null` cuando `exists` es false (sin fila). */
  createdAt: string | null
  /** ISO-8601 de última actualización; `null` cuando `exists` es false. */
  updatedAt: string | null
}

/** Entrada del upsert de perfil de facturación. */
export interface TenantBillingProfileUpsertInput {
  /** Obligatoria en el body HTTP; opcional aquí para distinguir "no enviado" vs `null`. */
  legalName: string
  /**
   * Ausente en el input del servicio = conservar valor previo en actualización.
   * `null` explícito = limpiar RFC y huella.
   */
  rfc?: string | null
  /** Ausente = conservar; `null` = limpiar. */
  postalCode?: string | null
  /** Ausente = conservar; `null` = limpiar. */
  taxRegimeCode?: string | null
  /** Ausente = conservar; `null` = limpiar. */
  billingEmail?: string | null
  /** Ausente = conservar; `null` = limpiar. */
  cfdiUseCode?: string | null
  /** Domicilio fiscal (USRH1789097550393). Ausente = conservar; `null` = limpiar. */
  street?: string | null
  exteriorNumber?: string | null
  interiorNumber?: string | null
  neighborhood?: string | null
  municipality?: string | null
  state?: string | null
  /** Representante legal (USRH1789097550393). Ausente = conservar; `null` = limpiar. */
  legalRepresentativeName?: string | null
  legalRepresentativeRole?: string | null
}

/**
 * Identidad de la empresa para documentos formales (USRH1789097550393):
 * razón social, domicilio y representante. El RFC NO viaja por esta vía —
 * es dato sensible y `sensitiveSerialize` no corre dentro de la generación
 * de un PDF. Sin perfil, la razón social sale de `business_units` y el resto
 * queda en `null`.
 */
export interface TenantFiscalIdentity {
  legalName: string
  postalCode: string | null
  street: string | null
  exteriorNumber: string | null
  interiorNumber: string | null
  neighborhood: string | null
  municipality: string | null
  state: string | null
  legalRepresentativeName: string | null
  legalRepresentativeRole: string | null
}

/** Cuerpo JSON de error estable del módulo (`TNT.BILL.*`). */
export interface TenantBillingProfileErrorBody {
  title: string
  detail: string
  key: string
  code: string
}

/** Respuesta exitosa de GET/PUT `/api/billing/profile`. */
export interface TenantBillingProfileSuccessResponse {
  type: 'success'
  data: TenantBillingProfileView
}
