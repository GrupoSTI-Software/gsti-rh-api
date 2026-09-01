/**
 * URL de un archivo utilizable por un consumidor que NO puede autenticarse:
 * una plantilla de correo, o un `<img src>` que el API entrega en un contrato.
 *
 * Desde que los archivos se guardan como objetos privados, la referencia que
 * hay en base de datos casi nunca es alcanzable sin credenciales. Componerla
 * con `APP_URL` solo producia una imagen rota en el correo y un contrato que
 * mentia sobre la disponibilidad del recurso.
 *
 * Devuelve la URL unicamente cuando de verdad es publica (una URL historica del
 * bucket, o un origen externo como el servidor de biometricos). Para una key
 * privada devuelve `null`, y quien la consume degrada sin pintar nada.
 *
 * Mostrar un archivo privado dentro de un correo exige otra via —adjuntarlo
 * como recurso embebido— y eso es decision de producto, no de esta capa.
 */
export function resolvePublicAssetUrl(storedPath: string | null | undefined): string | null {
  if (!storedPath) return null

  return /^https?:\/\//i.test(storedPath) ? storedPath : null
}
