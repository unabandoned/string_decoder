# @unabandoned/string_decoder

***Node-core `string_decoder` for userland — a maintained fork***

```bash
npm install --save @unabandoned/string_decoder
```

This package is a mirror of the `string_decoder` implementation in Node core. It
turns a series of buffers into a series of strings without breaking apart
multi-byte characters, which is what stream consumers need when a character's
bytes straddle two chunks.

Full documentation may be found on the
[Node.js website](https://nodejs.org/api/string_decoder.html).

## Why this fork exists

Upstream [`nodejs/string_decoder`](https://github.com/nodejs/string_decoder) has
been frozen at 1.3.0 since 2019, and it still shipped the abandoned
[`safe-buffer`](https://github.com/feross/safe-buffer) runtime dependency. That
left nothing keeping the tree current for the bundlers that pull it in
transitively — most visibly [browserify](https://github.com/unabandoned/browserify),
which injects this package as the browser shim for `require('string_decoder')`.

This fork is maintained under the [`unabandoned`](https://github.com/unabandoned)
program, where Renovate keeps the dependency tree current and releases are cut
on a regular cadence. See the
[package dashboard](https://unabandoned.github.io/.github/) for live status.

## No runtime dependencies

Node core reads `Buffer` straight off the `buffer` module. Upstream's build
script rewrote that line to pull `Buffer` from the `safe-buffer` shim instead, so
the package could run on Node < 4.5, where `Buffer.from` and
`Buffer.allocUnsafe` did not exist yet.

This fork requires Node >= 22.12, so that shim was dead weight — the line is
restored to the core original and `safe-buffer` is gone. The package now has
**no runtime dependencies**. Bundlers map `buffer` to their browser `Buffer`
implementation, which supplies the same `allocUnsafe` and `isEncoding`, so
browser builds are unaffected.

## Usage

```js
const { StringDecoder } = require('@unabandoned/string_decoder');

const decoder = new StringDecoder('utf8');
decoder.write(Buffer.from([0xe2, 0x82])); // '' — incomplete character held back
decoder.write(Buffer.from([0xac])); // '€' — completed
decoder.end(); // ''
```

## Requirements

- Node.js >= 22.12

## Testing

The suite runs on Node's built-in test runner, with no third-party test
dependencies:

```bash
npm test
```

## License

MIT. See [LICENSE](LICENSE).
