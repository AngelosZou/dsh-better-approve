/**
 * Package manifest and release-metadata checks. Run: node test/manifest.test.mjs
 *
 * Guards the open-source metadata every other surface points at: the manifest
 * must describe the same project as the README, the shipped files, and the
 * release workflow. It runs with the standard library only.
 */

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { access, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const readme = await readFile(join(root, 'README.md'), 'utf8')

const REPO = 'https://github.com/AngelosZou/dsh-better-approve'

// ---------------------------------------------------------------- identity
assert.equal(pkg.name, 'dsh-better-approve', 'the published package name is fixed')
assert.match(pkg.version, /^\d+\.\d+\.\d+$/, 'the version is plain SemVer')
assert.equal(pkg.license, 'MIT', 'the project is MIT licensed')
assert.equal(pkg.author.name, 'Yutong Zou', 'the author is recorded in the manifest')
assert.equal(pkg.author.url, 'https://github.com/AngelosZou')

// ------------------------------------------------------------- repository
assert.equal(pkg.repository.type, 'git')
assert.equal(
  pkg.repository.url,
  'git+https://github.com/AngelosZou/dsh-better-approve.git',
  'the repository URL is the canonical one',
)
assert.equal(pkg.homepage, `${REPO}#readme`)
assert.equal(pkg.bugs.url, `${REPO}/issues`)

// ------------------------------------------------------------- runtime
assert.equal(pkg.engines.node, '^22.19.0 || >=24.0.0', 'the Node floor matches DSH')
assert.equal(pkg.engines.dsh, '>=0.2.1-rc.2 <0.3.0', 'the DSH compatibility range is declared')
assert.equal(pkg.main, 'lib/index.js')
assert.deepEqual(pkg.exports['.'], { default: './lib/index.js' })
assert.deepEqual(pkg.exports['./client'], { default: './lib/client.js' })
assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
assert.equal(pkg.dsh.client.platform, 'web')

// -------------------------------------------------------------- shipped files
for (const required of [
  'lib',
  'locale',
  'icon.svg',
  'cordis.patch.yml',
  'docs',
  'README.md',
  'README.zh.md',
  'CONTRIBUTING.md',
  'THIRD_PARTY_NOTICES.md',
  'LICENSE',
]) {
  assert.ok(pkg.files.includes(required), `package.json "files" must include ${required}`)
}

for (const target of [
  pkg.main,
  pkg.dsh.bundle.patch,
  'icon.svg',
  'README.md',
  'README.zh.md',
  'LICENSE',
  'CONTRIBUTING.md',
  'THIRD_PARTY_NOTICES.md',
  'docs/design.md',
]) {
  await access(join(root, target)) // throws when a referenced file is missing
}

// ------------------------------------------------------- docs stay in step
assert.ok(readme.includes('AngelosZou/dsh-better-approve'), 'README.md links the public repository')
assert.ok(readme.includes('README.zh.md'), 'README.md links the Chinese translation')
assert.ok(readme.includes('MIT'), 'README.md states the license')
assert.ok(readme.includes('CONTRIBUTING.md'), 'README.md points at the contribution guide')

// Every relative documentation link resolves, so a rename cannot leave a dead
// link in a release tarball.
const DOCS = [
  'README.md',
  'README.zh.md',
  'CONTRIBUTING.md',
  'THIRD_PARTY_NOTICES.md',
  'docs/design.md',
]
const linkPattern = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
for (const doc of DOCS) {
  const source = (await readFile(join(root, doc), 'utf8')).replace(/```[\s\S]*?```/g, '')
  for (const [, target] of source.matchAll(linkPattern)) {
    if (/^(https?:|mailto:|tel:|data:)/i.test(target) || target.startsWith('#')) continue
    const [pathPart] = target.split('#')
    if (pathPart === '') continue
    assert.ok(
      existsSync(join(root, dirname(doc), decodeURIComponent(pathPart))),
      `${doc} links a missing file: ${target}`,
    )
  }
}

console.log('manifest.test.mjs: ok')
