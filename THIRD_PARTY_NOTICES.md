# Third-party notices

`dsh-better-approve` is an independent project. It is not affiliated with or
endorsed by DeepSeek. It interoperates with, and contains code derived from, the
following MIT-licensed software.

## DeepSeek Harness

- Component: DeepSeek Harness (`@deepseek-ai/dsh*`), including the shipped
  experimental Auto review integration
  `@deepseek-ai/dsh-experimental-auto-review`.
- Source: <https://github.com/deepseek-ai/deepseek-harness>
- License: MIT
- Copyright: Copyright (c) 2026 DeepSeek

The fixed review policy, the risk/decision protocol, and the Session-history
reconstruction in `lib/review.js`, together with the pre-execute gate shape in
`lib/index.js`, are derived from the shipped Auto review integration and were
then modified for this project. The configurable reviewer route, the request
fix, the per-Session policy, the settings store, and the client UI are original
to this project. See [`docs/design.md`](docs/design.md) for the mapping.

### MIT License text

```text
MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Trademarks

DeepSeek and DeepSeek Harness are trademarks of their respective owners. This
project uses the names only to describe compatibility and provenance.
