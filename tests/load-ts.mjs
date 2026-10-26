import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import ts from 'typescript'

// Small test loader: transpile the actual source, with explicit I/O fakes.
// Production imports/resolution are still checked by tsc and next build.
export function loadTs(entry, mocks = {}) {
  const cache = new Map()
  function load(file) {
    file = resolve(file)
    if (cache.has(file)) return cache.get(file).exports
    const mod = { exports: {} }
    cache.set(file, mod)
    const require = createRequire(file)
    const localRequire = (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name]
      if (name.startsWith('@/')) return load(resolve('src', name.slice(2)) + '.ts')
      if (name.startsWith('.')) return load(resolve(dirname(file), name) + (name.endsWith('.ts') ? '' : '.ts'))
      return require(name)
    }
    const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    })
    new Function('require', 'module', 'exports', outputText)(localRequire, mod, mod.exports)
    return mod.exports
  }
  return load(entry)
}
