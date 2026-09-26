import { test } from '@japa/runner'
import { ipMatchesCidrList } from '#modules/adms/channel/cidr'

test.group('ADMS cidr', () => {
  test('IPv4 dentro y fuera de la mascara', ({ assert }) => {
    assert.isTrue(ipMatchesCidrList('192.168.1.99', ['192.168.1.0/24']))
    assert.isTrue(ipMatchesCidrList('10.0.0.7', ['10.0.0.7/32']))
    assert.isTrue(ipMatchesCidrList('10.0.0.7', ['10.0.0.7']))
    assert.isFalse(ipMatchesCidrList('192.168.2.1', ['192.168.1.0/24']))
    assert.isTrue(ipMatchesCidrList('172.16.5.4', ['10.0.0.0/8', '172.16.0.0/12']))
  })

  test('IPv4 mapeada en IPv6 y entradas invalidas', ({ assert }) => {
    assert.isTrue(ipMatchesCidrList('::ffff:192.168.1.99', ['192.168.1.0/24']))
    assert.isFalse(ipMatchesCidrList('192.168.1.99', ['not-a-cidr']))
    assert.isFalse(ipMatchesCidrList('192.168.1.99', ['192.168.1.0/33']))
    // Mascara vacia: `Number('')` es 0 y autorizaria todo si no se rechaza.
    assert.isFalse(ipMatchesCidrList('8.8.8.8', ['10.0.0.7/']))
    assert.isFalse(ipMatchesCidrList('8.8.8.8', ['10.0.0.0/ 8']))
    assert.isFalse(ipMatchesCidrList('8.8.8.8', ['10.0.0.0/8x']))
    // Un `/0` explicito si autoriza todo: es una lista abierta a proposito.
    assert.isTrue(ipMatchesCidrList('8.8.8.8', ['10.0.0.0/0']))
    assert.isFalse(ipMatchesCidrList('', ['192.168.1.0/24']))
    assert.isFalse(ipMatchesCidrList('192.168.1.99', []))
  })

  test('IPv6 solo por igualdad exacta', ({ assert }) => {
    assert.isTrue(ipMatchesCidrList('2001:db8::1', ['2001:db8::1']))
    assert.isFalse(ipMatchesCidrList('2001:db8::2', ['2001:db8::1']))
  })
})
