import type { OffboardingDocumentField } from '../../documents/document_fields.constants.js'

/**
 * Campo combinable tal como viaja al cliente (USRH1788579938623). CINCO
 * propiedades, ni una más: las claves i18n son detalle de implementación y
 * el origen del valor describe tablas del sistema — ninguno se serializa.
 * Enumerado campo por campo: un spread de la entrada arrastraría el origen.
 */
export interface OffboardingDocumentFieldDto {
  key: string
  label: string
  requiredInTemplate: boolean
  documentTypes: readonly string[]
  captureTabLabel: string | null
}

/** Resuelve las etiquetas con el traductor de la petición; `null` cuando lo provee el sistema. */
export function toDocumentFieldDto(
  field: OffboardingDocumentField,
  translate: (key: string) => string
): OffboardingDocumentFieldDto {
  return {
    key: field.key,
    label: translate(field.labelKey),
    requiredInTemplate: field.requiredInTemplate,
    documentTypes: [...field.documentTypes],
    captureTabLabel: field.captureTabLabelKey === null ? null : translate(field.captureTabLabelKey),
  }
}
