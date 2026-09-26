import { test } from '@japa/runner'
import AdmsHandshakeService from '#modules/adms/channel/adms_handshake.service'

test.group('ADMS handshake', () => {
  test('bloque extendido con stamps del dispositivo y TransFlag', ({ assert }) => {
    const service = new AdmsHandshakeService('extended')
    const block = service.buildHandshake({ ATTLOG: '9999', OPERLOG: '9999' })
    const lines = block.split('\n')
    assert.equal(lines[0], 'ServerVer=2.4.1 2024-01-01')
    assert.equal(lines[1], 'GET OPTION FROM=attlog,userinfo')
    assert.include(lines, 'ATTLOGStamp=9999')
    assert.include(lines, 'OPERLOGStamp=9999')
    assert.include(lines, 'USERINFOStamp=0')
    assert.include(lines, 'ATTPHOTOStamp=0')
    assert.include(lines, 'BIODATAStamp=0')
    assert.include(lines, 'ErrorDelay=30')
    assert.include(lines, 'Delay=5')
    assert.include(lines, 'TransTimes=00:00;23:59')
    assert.include(lines, 'TransInterval=1')
    assert.include(lines, 'Realtime=1')
    assert.include(lines, 'Encrypt=0')
    assert.include(lines, 'Stamp=9999')
    assert.include(lines, 'OpStamp=9999')
    assert.isTrue(lines.some((line) => line.startsWith('TransFlag=TransData AttLog')))
    assert.notInclude(block, '\r')
  })

  test('un stamp fuera del patron no vuelve al equipo: se degrada a cero', ({ assert }) => {
    const service = new AdmsHandshakeService('extended')
    const block = service.buildHandshake({
      ATTLOG: '9999',
      USERINFO: '0\nEncrypt=1',
      ATTPHOTO: 'x'.repeat(40),
    })
    assert.notInclude(block, 'Encrypt=1\n')
    assert.include(block.split('\n'), 'USERINFOStamp=0')
    assert.include(block.split('\n'), 'ATTPHOTOStamp=0')
    assert.include(block.split('\n'), 'ATTLOGStamp=9999')
  })

  test('bloque minimo es exactamente el de la sonda', ({ assert }) => {
    const service = new AdmsHandshakeService('minimal')
    const block = service.buildHandshake({})
    assert.equal(
      block,
      [
        'ServerVer=2.4.1 2024-01-01',
        'GET OPTION FROM=attlog,userinfo',
        'ATTLOGStamp=0',
        'OPERLOGStamp=0',
        'USERINFOStamp=0',
        'ATTPHOTOStamp=0',
        'ErrorDelay=30',
        'Delay=5',
        'TransTimes=00:00;23:59',
        'TransInterval=1',
        'Realtime=1',
        'Encrypt=0',
      ].join('\n')
    )
  })

  test('bloque CA con zona de la sede y codigo de registro estable', ({ assert }) => {
    const service = new AdmsHandshakeService('extended')
    const block = service.buildCaPushOptions(-6, '12')
    assert.include(block.split('\n'), 'TimeZone=-6')
    assert.include(block.split('\n'), 'SessionID=12')
    assert.include(block.split('\n'), 'ServerName=ADMS')
    assert.equal(service.registryCodeFor(12), 'RC12')
  })
})
