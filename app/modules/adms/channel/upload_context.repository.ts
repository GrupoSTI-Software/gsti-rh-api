/**
 * Lo que el canal necesita saber del punto de acceso y de su empresa para
 * ingerir una subida: el nombre con que se etiqueta la checada y la zona
 * horaria de la sede.
 *
 * Es un puerto para que `AdmsChannelService` no toque Lucid: sus pruebas
 * unitarias corren sin contexto de empresa y una consulta directa al modelo
 * lanzaba `TenantContextMissingException` desde dentro del procesador, lo que
 * la prueba leia como un fallo de persistencia y no como lo que era.
 */
export interface UploadContextRepository {
  /** Nombre legible del punto de acceso; cadena vacia si no existe. */
  accessPointName(accessPointId: number): Promise<string>
  /** Zona IANA de la empresa; `null` si no la tiene o no existe. */
  businessUnitTimezone(businessUnitId: number): Promise<string | null>
}
