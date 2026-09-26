import AdmsRawMessage from '#models/adms_raw_message'
import { ADMS_RAW_STATUS } from '#modules/adms/adms.constants'
import type {
  RawMessageFinish,
  RawMessageInsert,
  RawMessageRepository,
} from './raw_message.repository.js'

/** Adaptador Lucid del crudo. Unico punto del slice que toca el modelo. */
export default class RawMessageRepositoryMysql implements RawMessageRepository {
  async insertReceived(input: RawMessageInsert): Promise<number> {
    const message = new AdmsRawMessage()
    message.accessPointId = input.accessPointId
    message.businessUnitId = input.businessUnitId
    message.admsRawMessageSerial = input.serial
    message.admsRawMessageRemoteIp = input.remoteIp
    message.admsRawMessageMethod = input.method
    message.admsRawMessagePath = input.path
    message.admsRawMessageQuery = input.query
    message.admsRawMessageTable = input.table
    message.admsRawMessageStamp = input.stamp
    message.admsRawMessageContentType = input.contentType
    message.admsRawMessageBody = input.body
    message.admsRawMessageBodyBytes = input.bytes
    message.admsRawMessageLineCount = input.lineCount
    message.admsRawMessageStatus = ADMS_RAW_STATUS.RECEIVED
    message.admsRawMessageReceivedAt = input.receivedAt
    await message.save()
    return message.admsRawMessageId
  }

  async finish(rawMessageId: number, patch: RawMessageFinish): Promise<void> {
    await AdmsRawMessage.query().where('adms_raw_message_id', rawMessageId).update({
      adms_raw_message_status: patch.status,
      adms_raw_message_ack: patch.ack,
      adms_raw_message_error: patch.error,
      adms_raw_message_processed_at: patch.processedAt.toFormat('yyyy-MM-dd HH:mm:ss'),
    })
  }
}
