import { test } from '@japa/runner'
import {
  parseOptionsBody,
  resolveVersions,
  splitOptions,
} from '#modules/adms/parsers/options.parser'
import { attlogLayoutFor } from '#modules/adms/parsers/parser.types'

/** Cuerpo real del SpeedFace V5L (capture/2026-08-04T16-29-50-594Z-0003-cdata.txt). */
const V5L =
  '~DeviceName=SpeedFace-V5L,MAC=00:17:61:13:20:21,TransactionCount=0,~MaxAttLogCount=20,UserCount=1,~MaxUserCount=100,PhotoFunOn=1,~MaxUserPhotoCount=2500,FingerFunOn=1,FPVersion=10,~MaxFingerCount=60,FPCount=1,FaceFunOn=1,FaceVersion=39,~MaxFaceCount=6000,FaceCount=0,FvFunOn=0,FvVersion=3,~MaxFvCount=10,FvCount=0,PvFunOn=1,PvVersion=12,~MaxPvCount=3000,PvCount=0,Language=101,IPAddress=192.168.1.59,~Platform=ZAM180_TFT,~OEMVendor=ZKTECO CO., LTD.,FWVersion=ZAM180-NF50VA-Ver3.4.9,PushVersion=Ver 2.0.33S-20220623,RegDeviceType=,VisilightFun=1,IRTempDetectionFunOn=0,MaskDetectionFunOn=1,UserPicURLFunOn=1,VisualIntercomFunOn=,VideoTID=,QRCodeDecryptFunList=010,VideoProtocol=,IsSupportQRcode=1,QRCodeEnable=1,SubcontractingUpgradeFunOn=1,RoomStatus=0'

/** Cuerpo real del SenseFace 2A (capture/2026-08-13T17-41-00-387Z-0002-cdata.txt). */
const SENSEFACE =
  '~DeviceName=SenseFace 2A,MAC=00:17:61:11:20:cc,TransactionCount=4,~MaxAttLogCount=15,UserCount=2,~MaxUserCount=30,PhotoFunOn=1,~MaxUserPhotoCount=3000,FingerFunOn=1,FPVersion=13,~MaxFingerCount=30,FPCount=1,FaceFunOn=1,FaceVersion=40,~MaxFaceCount=1500,FaceCount=1,FvFunOn=0,FvVersion=3,~MaxFvCount=10,FvCount=0,PvFunOn=0,PvVersion=12,~MaxPvCount=,PvCount=0,Language=101,IPAddress=192.168.1.99,~Platform=ZAM70_TFT,~OEMVendor=ZKTECO CO., LTD.,FWVersion=ZAM70-NF24HA-Ver3.3.12,PushVersion=Ver 3.1.2S-20250616,RegDeviceType=,VisilightFun=1,MultiBioDataSupport=0:1:0:0:0:0:0:0:0:1,MultiBioPhotoSupport=0:0:0:0:0:0:0:0:0:1,IRTempDetectionFunOn=,MaskDetectionFunOn=,UserPicURLFunOn=1,VisualIntercomFunOn=1,VideoTID=,QRCodeDecryptFunList=,VideoProtocol=8,IsSupportQRcode=0,QRCodeEnable=,SubcontractingUpgradeFunOn=1,wgRuleVer=,LivePvFunOn=,SipDeviceType=0,SipEnableUnit=1'

test.group('ADMS options parser', () => {
  test('separa por coma y pega la coma interna del fabricante al valor anterior', ({ assert }) => {
    const raw = splitOptions(V5L)
    assert.equal(raw.OEMVendor, 'ZKTECO CO., LTD.')
    assert.equal(raw.Platform, 'ZAM180_TFT')
    assert.equal(raw.DeviceName, 'SpeedFace-V5L')
    assert.equal(raw.VideoProtocol, '')
    assert.notProperty(raw, '~Platform')
  })

  test('perfil del V5L: versiones planas, capacidades y banderas', ({ assert }) => {
    const parsed = parseOptionsBody(V5L)
    assert.equal(parsed.platform, 'ZAM180_TFT')
    assert.equal(parsed.fwVersion, 'ZAM180-NF50VA-Ver3.4.9')
    assert.equal(parsed.pushVersion, 'Ver 2.0.33S-20220623')
    assert.equal(parsed.oemVendor, 'ZKTECO CO., LTD.')
    assert.equal(parsed.mac, '00:17:61:13:20:21')
    assert.equal(parsed.ipAddress, '192.168.1.59')
    assert.equal(parsed.fpVersion, '10')
    assert.equal(parsed.faceVersion, '39')
    assert.equal(parsed.maxFaceCount, 6000)
    assert.equal(parsed.maxUserPhotoCount, 2500)
    assert.equal(parsed.maxUserCount, 100)
    assert.equal(parsed.maxFingerCount, 60)
    assert.equal(parsed.maxAttLogCount, 20)
    assert.equal(parsed.userCount, 1)
    assert.equal(parsed.fpCount, 1)
    assert.equal(parsed.faceCount, 0)
    assert.equal(parsed.fingerFunOn, 1)
    assert.equal(parsed.faceFunOn, 1)
    assert.isNull(parsed.visualIntercomFunOn)
    assert.isNull(parsed.videoProtocol)
    assert.isNull(parsed.multiBioDataSupport)
    assert.isNull(parsed.sipEnableUnit)
  })

  test('perfil del SenseFace: MultiBio, videoportero y vacios como null', ({ assert }) => {
    const parsed = parseOptionsBody(SENSEFACE)
    assert.equal(parsed.platform, 'ZAM70_TFT')
    assert.equal(parsed.multiBioDataSupport, '0:1:0:0:0:0:0:0:0:1')
    assert.equal(parsed.multiBioPhotoSupport, '0:0:0:0:0:0:0:0:0:1')
    assert.equal(parsed.visualIntercomFunOn, 1)
    assert.equal(parsed.sipEnableUnit, 1)
    assert.equal(parsed.videoProtocol, '8')
    assert.equal(parsed.transactionCount, 4)
    assert.equal(parsed.faceCount, 1)
    assert.isNull(parsed.multiBioVersion)
  })

  test('versiones: planas cuando no hay MultiBioVersion; MultiBioVersion manda y deja constancia del choque', ({
    assert,
  }) => {
    const flat = resolveVersions(parseOptionsBody(SENSEFACE))
    assert.equal(flat.fpVersion, '13')
    assert.equal(flat.faceVersion, '40')
    assert.equal(flat.fvVersion, '3')
    assert.equal(flat.pvVersion, '12')
    assert.deepEqual(flat.source, { fp: 'flat', face: 'flat', fv: 'flat', pv: 'flat' })
    assert.lengthOf(flat.mismatches, 0)

    const multi = resolveVersions(
      parseOptionsBody(`${SENSEFACE},MultiBioVersion=0:12:0:0:0:0:0:0:0:40`)
    )
    assert.equal(multi.fpVersion, '12')
    assert.equal(multi.faceVersion, '40')
    assert.equal(multi.fvVersion, '3')
    assert.equal(multi.source.fp, 'multibio')
    assert.equal(multi.source.face, 'multibio')
    assert.equal(multi.source.fv, 'flat')
    assert.deepEqual(multi.mismatches, [{ modality: 'fp', flat: '13', multi: '12' }])
  })

  test('cuerpo vacio o basura no lanza y deja todo en null', ({ assert }) => {
    const parsed = parseOptionsBody('')
    assert.isNull(parsed.platform)
    assert.isNull(parsed.userCount)
    const junk = parseOptionsBody('sin igual,,=valor,Clave=')
    assert.isNull(junk.platform)
    assert.deepEqual(Object.keys(splitOptions('sin igual,,=valor,Clave=')), ['Clave'])
  })

  test('mapa de plataformas validadas', ({ assert }) => {
    assert.equal(attlogLayoutFor('ZAM180_TFT'), 'zam180')
    assert.equal(attlogLayoutFor('ZAM70_TFT'), 'zam70')
    assert.isNull(attlogLayoutFor('ZMM220_TFT'))
    assert.isNull(attlogLayoutFor(null))
    // Nada que venga del equipo puede alcanzar el prototipo del objeto.
    assert.isNull(attlogLayoutFor('constructor'))
    assert.isNull(attlogLayoutFor('__proto__'))
  })
})
