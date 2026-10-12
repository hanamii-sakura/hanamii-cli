import { createRequire } from 'node:module'

// src/version.ts と dist/cli.js はどちらもリポジトリ直下の 1 階層下にあるので、
// バンドル前後どちらでも ../package.json が同じファイルを指す
const require = createRequire(import.meta.url)
const pkg = require('../package.json') as { name: string; version: string }

export const PACKAGE_NAME = pkg.name
export const VERSION = pkg.version
