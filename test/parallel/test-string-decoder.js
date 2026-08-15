// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { inspect } = require('node:util');
const { Buffer } = require('node:buffer');

const { StringDecoder } = require('../../');

// Expected strings are written as \u escapes throughout: most of them are
// replacement characters, combining marks and lone surrogates, which are
// invisible or misleading when pasted as literals.

// decodes verifies that StringDecoder correctly decodes the given input buffer
// with the given encoding to the expected output. It attempts every possible
// way to split the input across successive write() calls, see writeSequences().
function decodes(encoding, input, expected) {
  const hexNumberRE = /.{2}/g;
  for (const sequence of writeSequences(input.length)) {
    const decoder = new StringDecoder(encoding);
    let output = '';
    for (const [start, end] of sequence) {
      output += decoder.write(input.subarray(start, end));
    }
    output += decoder.end();

    assert.strictEqual(
      output,
      expected,
      `Expected "${unicodeEscape(expected)}", but got "${unicodeEscape(output)}"\n` +
        `input: ${input.toString('hex').match(hexNumberRE)}\n` +
        `Write sequence: ${JSON.stringify(sequence)}\n` +
        `Full Decoder State: ${inspect(decoder)}`
    );
  }
}

// unicodeEscape prints the str contents as unicode escape codes.
function unicodeEscape(str) {
  let r = '';
  for (let i = 0; i < str.length; i++) {
    r += '\\u' + str.charCodeAt(i).toString(16);
  }
  return r;
}

// writeSequences returns an array of arrays describing all the ways a buffer of
// the given length could be split up and passed to sequential write calls.
//
// e.g. writeSequences(3) returns: [
//   [ [ 0, 3 ] ],
//   [ [ 0, 2 ], [ 2, 3 ] ],
//   [ [ 0, 1 ], [ 1, 3 ] ],
//   [ [ 0, 1 ], [ 1, 2 ], [ 2, 3 ] ]
// ]
function writeSequences(length, start, sequence) {
  if (start === undefined) {
    start = 0;
    sequence = [];
  } else if (start === length) {
    return [sequence];
  }
  let sequences = [];
  for (let end = length; end > start; end--) {
    const subSequence = sequence.concat([[start, end]]);
    sequences = sequences.concat(writeSequences(length, end, subSequence));
  }
  return sequences;
}

test('defaults to utf8', () => {
  assert.strictEqual(new StringDecoder().encoding, 'utf8');
});

test('decodes utf-8 multi-byte characters', () => {
  decodes('utf-8', Buffer.from('$', 'utf-8'), '$');
  decodes('utf-8', Buffer.from('¢', 'utf-8'), '¢');
  decodes('utf-8', Buffer.from('€', 'utf-8'), '€');
  decodes('utf-8', Buffer.from('𤭢', 'utf-8'), '𤭢');
});

test('decodes a mixed ascii and non-ascii string', () => {
  // Test stolen from deps/v8/test/cctest/test-strings.cc
  // U+02E4 -> CB A4
  // U+0064 -> 64
  // U+12E4 -> E1 8B A4
  // U+0030 -> 30
  // U+3045 -> E3 81 85
  decodes(
    'utf-8',
    Buffer.from([0xcb, 0xa4, 0x64, 0xe1, 0x8b, 0xa4, 0x30, 0xe3, 0x81, 0x85]),
    'ˤdዤ0ぅ'
  );
});

test('decodes invalid utf-8 input known to have caused chunking trouble', () => {
  // https://github.com/nodejs/node/pull/7310#issuecomment-226445923
  // 00: |00000000 ASCII
  // 41: |01000001 ASCII
  // B8: 10|111000 continuation
  // CC: 110|01100 two-byte head
  // E2: 1110|0010 three-byte head
  // F0: 11110|000 four-byte head
  // F1: 11110|001 another four-byte head
  // FB: 111110|11 "five-byte head", not UTF-8
  decodes('utf-8', Buffer.from('C9B5A941', 'hex'), 'ɵ�A');
  decodes('utf-8', Buffer.from('E2', 'hex'), '�');
  decodes('utf-8', Buffer.from('E241', 'hex'), '�A');
  decodes('utf-8', Buffer.from('CCCCB8', 'hex'), '�̸');
  decodes('utf-8', Buffer.from('F1CCB8', 'hex'), '�̸');
  decodes('utf-8', Buffer.from('F0FB00', 'hex'), '��\0');
  decodes('utf-8', Buffer.from('E2FBCC01', 'hex'), '���');
  decodes('utf-8', Buffer.from('CCB8CDB9', 'hex'), '̸͹');
});

test('decodes ucs2', () => {
  decodes('ucs2', Buffer.from('ababc', 'ucs2'), 'ababc');
});

test('decodes a utf16le surrogate pair', () => {
  decodes('utf16le', Buffer.from('3DD84DDC', 'hex'), '👍'); // thumbs up
});

test('emits a replacement character for truncated utf8 input', () => {
  let decoder = new StringDecoder('utf8');
  assert.strictEqual(decoder.write(Buffer.from('E1', 'hex')), '');
  assert.strictEqual(decoder.end(), '�');

  decoder = new StringDecoder('utf8');
  assert.strictEqual(decoder.write(Buffer.from('E18B', 'hex')), '');
  assert.strictEqual(decoder.end(), '�');

  decoder = new StringDecoder('utf8');
  assert.strictEqual(decoder.write(Buffer.from('EFBFBDE2', 'hex')), '�');
  assert.strictEqual(decoder.end(), '�');

  decoder = new StringDecoder('utf8');
  assert.strictEqual(decoder.write(Buffer.from('F1', 'hex')), '');
  assert.strictEqual(decoder.write(Buffer.from('41F2', 'hex')), '�A');
  assert.strictEqual(decoder.end(), '�');
});

test('passes through literal replacement characters', () => {
  let decoder = new StringDecoder('utf8');
  assert.strictEqual(decoder.write(Buffer.from('�')), '�');
  assert.strictEqual(decoder.end(), '');

  decoder = new StringDecoder('utf8');
  assert.strictEqual(
    decoder.write(Buffer.from('���')),
    '���'
  );
  assert.strictEqual(decoder.end(), '');
});

test('utf8Text returns empty when the offset is past the end', () => {
  const decoder = new StringDecoder('utf8');
  assert.strictEqual(decoder.text(Buffer.from([0x41]), 2), '');
});

test('buffers a utf16le surrogate pair split across writes', () => {
  const decoder = new StringDecoder('utf16le');
  assert.strictEqual(decoder.write(Buffer.from('3DD8', 'hex')), '');
  assert.strictEqual(decoder.write(Buffer.from('4D', 'hex')), '');
  assert.strictEqual(decoder.write(Buffer.from('DC', 'hex')), '👍');
  assert.strictEqual(decoder.end(), '');
});

test('flushes a dangling utf16le high surrogate on end', () => {
  let decoder = new StringDecoder('utf16le');
  assert.strictEqual(decoder.write(Buffer.from('3DD8', 'hex')), '');
  assert.strictEqual(decoder.end(), '\ud83d');

  decoder = new StringDecoder('utf16le');
  assert.strictEqual(decoder.write(Buffer.from('3DD8', 'hex')), '');
  assert.strictEqual(decoder.write(Buffer.from('4D', 'hex')), '');
  assert.strictEqual(decoder.end(), '\ud83d');
});

test('throws on an unknown encoding', () => {
  assert.throws(() => new StringDecoder(1), /^Error: Unknown encoding: 1$/);
  assert.throws(() => new StringDecoder('test'), /^Error: Unknown encoding: test$/);
});
