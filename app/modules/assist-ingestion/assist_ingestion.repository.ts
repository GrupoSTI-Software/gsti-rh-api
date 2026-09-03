import type {
  AssistIngestionPersisted,
  AssistIngestionRecord,
} from './dto/assist_ingestion.dto.js'

/** Puerto de escritura del motor de ingesta de checadas. */
export interface AssistIngestionRepository {
  /**
   * Persiste los registros y devuelve el desenlace de cada uno.
   *
   * Idempotente por llave natural (índice `assists_natural_key_unique`): si la
   * identidad ya está tomada devuelve `preexisting` con la fila que ya existía,
   * sin crear un segundo registro, sin re-fecharla y sin tocar ninguno de sus
   * campos — incluida una fila borrada lógicamente, que sigue ocupando su llave.
   *
   * El árbitro de la unicidad es el índice, no la clasificación previa: una
   * colisión concurrente se reclasifica como `preexisting` y nunca se propaga
   * como error inesperado.
   *
   * De lote desde el día uno; el endpoint unitario lo invoca con un arreglo de uno.
   */
  ingestMany(records: AssistIngestionRecord[]): Promise<AssistIngestionPersisted[]>
}
