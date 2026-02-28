import NoticeFile from '#models/notice_file'

export default class NoticeFileService {
  async create(noticeFile: NoticeFile) {
    const newNoticeFile = new NoticeFile()
    newNoticeFile.noticeId = noticeFile.noticeId
    newNoticeFile.noticeFilePath = noticeFile.noticeFilePath
    await newNoticeFile.save()
    return newNoticeFile
  }

  async update(
    currentNoticeFile: NoticeFile,
    noticeFile: NoticeFile
  ) {
    currentNoticeFile.noticeId = noticeFile.noticeId
    currentNoticeFile.noticeFilePath = noticeFile.noticeFilePath
    await currentNoticeFile.save()
    return currentNoticeFile
  }

  async delete(currentNoticeFile: NoticeFile) {
    await currentNoticeFile.delete()
    return currentNoticeFile
  }

  async show(noticeFileId: number) {
    const noticeFile = await NoticeFile.query()
      .whereNull('notice_file_deleted_at')
      .where('notice_file_id', noticeFileId)
      .first()
    return noticeFile ? noticeFile : null
  }
}
