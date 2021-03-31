/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Uint8ArraySerde from './Uint8ArraySerde'

describe('Uint8ArraySerde', () => {
  it('constructs a Uint8ArraySerde', () => {
    expect(new Uint8ArraySerde(32)).toMatchSnapshot()
  })
  it('compares two arrays as equal', () => {
    const nullifier1 = new Uint8Array(32)
    const nullifier2 = new Uint8Array(32)
    nullifier1[0] = 1
    nullifier2[0] = 1
    expect(new Uint8ArraySerde(32).equals(nullifier1, nullifier2)).toBe(true)
  })

  it('compares two different arrays as not equal', () => {
    const nullifier1 = new Uint8Array(32)
    const nullifier2 = new Uint8Array(32)
    nullifier2[0] = 1
    expect(new Uint8ArraySerde(32).equals(nullifier1, nullifier2)).toBe(false)
  })
  it('throws error when passed incorrectly sized array', () => {
    const nullifier1 = new Uint8Array(32)
    const nullifier2 = new Uint8Array(32)
    expect(() =>
      new Uint8ArraySerde(64).equals(nullifier1, nullifier2),
    ).toThrowErrorMatchingInlineSnapshot(`"Attempting to compare inappropriately sized array"`)
  })

  it('serializes and deserializes an equal array', () => {
    const serde = new Uint8ArraySerde(32)
    const nullifier = new Uint8Array(32)
    nullifier.set([8, 18, 24, 199, 255, 1, 0, 127])
    const serialized = serde.serialize(nullifier)
    expect(serialized).toMatchInlineSnapshot(
      `"081218C7FF01007F000000000000000000000000000000000000000000000000"`,
    )
    const deserialized = serde.deserialize(serialized)
    expect(deserialized).toMatchSnapshot()
    expect(serde.equals(nullifier, deserialized)).toBe(true)
    expect(serde.serialize(deserialized)).toEqual(serialized)
  })

  it('throws an error when trying to serialize an inappropriate array', () => {
    expect(() =>
      new Uint8ArraySerde(32).serialize(new Uint8Array(10)),
    ).toThrowErrorMatchingInlineSnapshot(
      `"Attempting to serialize array with 10 bytes, expected 32"`,
    )
  })

  it('throws an error when trying to deserialize an inappropriate value', () => {
    expect(() => new Uint8ArraySerde(32).deserialize('ABC')).toThrowErrorMatchingInlineSnapshot(
      `"\\"ABC\\" is not a 64-character hex string"`,
    )
    expect(() =>
      // @ts-expect-error Argument of type '{ bad: string; }' is not assignable to parameter of type 'string'.
      new Uint8ArraySerde(32).deserialize({ bad: 'object' }),
    ).toThrowErrorMatchingInlineSnapshot(
      `"{\\"bad\\":\\"object\\"} is not a 64-character hex string"`,
    )
    expect(() =>
      new Uint8ArraySerde(32).deserialize(
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaag',
      ),
    ).toThrowErrorMatchingInlineSnapshot(`"unexpected character"`)
  })
})
