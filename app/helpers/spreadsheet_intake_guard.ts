import FileIntakeService from '#services/file_intake_service'
import type { MultipartFile } from '@adonisjs/core/bodyparser'

/**
 * Verifica que un archivo destinado a un importador sea una hoja OOXML real
 * antes de que `exceljs` la abra.
 *
 * Un `.xlsx` es un ZIP, así que el nombre no dice nada: renombrar cualquier
 * archivo comprimido basta para llegar al parser. El perfil
 * `spreadsheet-import` detecta el formato por magic bytes y rechaza lo que no
 * sea una hoja, con el triplete del estándar.
 *
 * La hoja NO se persiste: los importadores siguen leyendo el temporal del
 * multipart. Esta guarda solo decide si ese temporal merece abrirse.
 *
 * @throws {FileIntakeError} si el archivo no es una hoja de cálculo válida.
 */
export async function assertSpreadsheetFile(file: MultipartFile | null | undefined): Promise<void> {
  await new FileIntakeService().accept(file, 'spreadsheet-import')
}
