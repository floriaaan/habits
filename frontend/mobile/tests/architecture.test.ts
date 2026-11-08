import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url))
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory()
      ? files(path)
      : /\.tsx?$/.test(path)
        ? [path]
        : []
  })
}
const sources = files(sourceRoot)
const sourceSet = new Set(sources)
const name = (file: string) => relative(sourceRoot, file).replaceAll('\\', '/')
const imports = new Map(
  sources.map((file) => {
    const ast = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    )
    const dependencies = ast.statements.flatMap((statement) => {
      if (
        (!ts.isImportDeclaration(statement) &&
          !ts.isExportDeclaration(statement)) ||
        !statement.moduleSpecifier ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      )
        return []
      const specifier = statement.moduleSpecifier.text
      if (!specifier.startsWith('.')) return []
      const base = resolve(dirname(file), specifier)
      const target = [
        base,
        base + '.ts',
        base + '.tsx',
        join(base, 'index.ts'),
        join(base, 'index.tsx'),
      ].find((path) => sourceSet.has(path))
      assert.ok(target, `${name(file)}: unresolved ${specifier}`)
      return [target]
    })
    return [file, dependencies] as const
  }),
)

test('frontend dependencies respect ownership and clean architecture boundaries', () => {
  for (const [file, dependencies] of imports) {
    const from = name(file),
      layer = from.split('/')[0]
    for (const dependency of dependencies) {
      const to = name(dependency),
        targetLayer = to.split('/')[0]
      if (layer === 'domain')
        assert.equal(targetLayer, 'domain', `${from} -> ${to}`)
      if (layer === 'application')
        assert.ok(
          ['application', 'domain'].includes(targetLayer!),
          `${from} -> ${to}`,
        )
      if (layer === 'infrastructure') {
        assert.ok(
          ['infrastructure', 'domain'].includes(targetLayer!) ||
            to === 'application/ports.ts',
          `${from} -> ${to}`,
        )
      }
      if (layer === 'presentation')
        assert.ok(
          !['infrastructure', 'bootstrap', 'app'].includes(targetLayer!),
          `${from} -> ${to}`,
        )
      if (from.startsWith('presentation/shared/'))
        assert.ok(!to.startsWith('presentation/features/'), `${from} -> ${to}`)
      if (
        from.startsWith('presentation/features/') &&
        to.startsWith('presentation/features/')
      ) {
        assert.equal(
          from.split('/')[2],
          to.split('/')[2],
          `Cross-feature dependency: ${from} -> ${to}`,
        )
      }
      if (
        from.startsWith('presentation/features/') &&
        /(?:View|Card|Actions)\.tsx$/.test(from)
      ) {
        assert.ok(
          ![
            'application/providers.tsx',
            'application/queries.ts',
            'application/habit-queries.ts',
          ].includes(to),
          `Display component must receive data and callbacks: ${from} -> ${to}`,
        )
      }
      if (
        from.startsWith('presentation/features/') &&
        /\/use\w+\.ts$/.test(from)
      ) {
        assert.ok(
          !to.startsWith('presentation/shared/ui/'),
          `Controller must not render UI: ${from} -> ${to}`,
        )
      }
    }
  }
})

test('local frontend modules have no circular import or re-export dependency', () => {
  const complete = new Set<string>(),
    active: string[] = []
  function visit(file: string) {
    if (complete.has(file)) return
    assert.ok(
      !active.includes(file),
      `Circular dependency: ${[...active, file].map(name).join(' -> ')}`,
    )
    active.push(file)
    for (const dependency of imports.get(file) ?? []) visit(dependency)
    active.pop()
    complete.add(file)
  }
  for (const file of sources) visit(file)
})

test('Expo page routes contain no data fetching or business commands', () => {
  for (const file of sources.filter((file) => name(file).startsWith('app/'))) {
    const source = readFileSync(file, 'utf8')
    assert.doesNotMatch(
      source,
      /\b(?:useDomainQuery|useOperation|useDashboardQuery|useApp|createRuntime)\b/,
      name(file),
    )
    assert.doesNotMatch(source, /\.connector\b/, name(file))
  }
})
