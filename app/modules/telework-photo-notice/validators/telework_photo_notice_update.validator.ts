import vine from '@vinejs/vine'

/**
 * Editar el borrador del aviso.
 *
 * El tope de 100 000 caracteres para `content` es el del spec §11 y lo
 * comprueba CA-14: el aviso es UN solo documento (a diferencia de la política,
 * que van 12 componentes por request), así que un tope alto no acerca el
 * payload al límite global `json.limit` de `config/bodyparser.ts` y deja
 * holgura para el texto legal completo.
 *
 * Vine valida la **forma** (tipo, recorte, longitudes); las reglas de negocio
 * del texto —marcadores reconocidos, contenido no vacío tras resolver— las
 * decide el servicio al guardar/publicar (Tarea 3), que es quien conoce la
 * lista cerrada de marcadores.
 */
export const teleworkPhotoNoticeUpdateValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(3).maxLength(150),
    content: vine.string().trim().minLength(1).maxLength(100_000),
  })
)

export type TeleworkPhotoNoticeUpdateInput = Awaited<
  ReturnType<typeof teleworkPhotoNoticeUpdateValidator.validate>
>
