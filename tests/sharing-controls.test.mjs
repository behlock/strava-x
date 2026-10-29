import assert from 'node:assert/strict'
import test, { beforeEach, afterEach } from 'node:test'
import { loadTs } from './load-ts.mjs'

const previousDocument = globalThis.document
beforeEach(() => {
  globalThis.document = { addEventListener() {}, removeEventListener() {} }
})
afterEach(() => {
  if (previousDocument === undefined) delete globalThis.document
  else globalThis.document = previousDocument
})

function renderer() {
  const slots = []
  const effects = []
  let cursor = 0
  const react = {
    useId: () => 'sharing-test',
    useCallback: (fn) => fn,
    useRef(value) {
      const index = cursor++
      return (slots[index] ??= { current: value })
    },
    useState(value) {
      const index = cursor++
      slots[index] ??= { value }
      return [
        slots[index].value,
        (next) => {
          slots[index].value = next
        },
      ]
    },
    useEffect(fn, deps) {
      const index = cursor++
      const previous = slots[index]
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        effects.push(() => {
          previous?.cleanup?.()
          slots[index] = { deps, cleanup: fn() }
        })
      }
    },
  }
  return {
    react,
    render(Component, props) {
      cursor = 0
      const tree = Component(props)
      effects.splice(0).forEach((run) => run())
      return tree
    },
    unmount() {
      slots.forEach((slot) => slot.cleanup?.())
    },
  }
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return
  if (predicate(node)) return node
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = find(child, predicate)
    if (found) return found
  }
}
function component(react) {
  return loadTs('src/components/publish/sharing-controls.tsx', {
    react,
    '@/components/ui/tooltip': { Tooltip: ({ children }) => children },
    '@/components/ui/header-bar': { HeaderChip: () => null },
  }).SharingControls
}
const props = {
  open: true,
  onOpen() {},
  onClose() {},
  currentSlug: 'owner',
  isPublishing: false,
  isSyncing: false,
  estimatedSizeBytes: 0,
  checkSlug: async () => ({ available: true }),
  publish: async (slug) => ({ slug }),
  unpublish: async () => ({ ok: true }),
}
function controls(options = {}) {
  const runtime = renderer()
  return { runtime, Component: component(runtime.react), props: { ...props, ...options } }
}

test('disabling a focused control during a save does not dismiss sharing, while tabbing outside does', () => {
  let closes = 0
  const fixture = controls({ onClose: () => closes++ })
  const tree = fixture.runtime.render(fixture.Component, fixture.props)
  tree.props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: null })
  assert.equal(closes, 0)
  tree.props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: {} })
  assert.equal(closes, 1)
  fixture.runtime.unmount()
})

test('a late availability answer cannot enable saving a different link', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let answerFirst
  const fixture = controls({
    currentSlug: null,
    checkSlug: (slug) =>
      slug === 'first'
        ? new Promise((resolve) => {
            answerFirst = resolve
          })
        : Promise.resolve({ available: false, reason: 'slug_taken' }),
  })
  const render = () => fixture.runtime.render(fixture.Component, fixture.props)
  let tree = render()
  find(tree, (node) => node.type === 'input').props.onChange({ target: { value: 'first' } })
  tree = render()
  t.mock.timers.tick(300)
  find(tree, (node) => node.type === 'input').props.onChange({ target: { value: 'second' } })
  render()
  answerFirst({ available: true })
  await Promise.resolve()
  tree = render()
  assert.equal(find(tree, (node) => node.props?.label === 'Share map').props.disabled, true)
  t.mock.timers.tick(300)
  await Promise.resolve()
  await Promise.resolve()
  tree = render()
  assert.equal(find(tree, (node) => node.props?.label === 'Share map').props.disabled, true)
  assert.equal(find(tree, (node) => node.props?.role === 'alert').props.children, 'someone else already uses that link')
  fixture.runtime.unmount()
})

test('a stop operation finishing after sharing closes cannot close a newly opened toolbar', async () => {
  let finish,
    closes = 0
  const fixture = controls({
    onClose: () => closes++,
    unpublish: () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  })
  let tree = fixture.runtime.render(fixture.Component, fixture.props)
  find(tree, (node) => node.props?.label === 'Stop sharing').props.onClick()
  tree = fixture.runtime.render(fixture.Component, fixture.props)
  const stopped = find(tree, (node) => node.props?.label === 'Confirm stop sharing').props.onClick()
  fixture.runtime.render(fixture.Component, { ...fixture.props, open: false })
  fixture.runtime.render(fixture.Component, fixture.props)
  finish({ ok: true })
  await stopped
  assert.equal(closes, 0)
  fixture.runtime.unmount()
})

test('a failed stop keeps its controls available and replaces the question with the error', async () => {
  const fixture = controls({ unpublish: async () => ({ ok: false, error: 'network' }) })
  const render = () => fixture.runtime.render(fixture.Component, fixture.props)
  let tree = render()
  find(tree, (node) => node.props?.label === 'Stop sharing').props.onClick()
  tree = render()
  assert.ok(find(tree, (node) => node.props?.children === 'stop sharing?'))
  const confirm = find(tree, (node) => node.props?.label === 'Confirm stop sharing')
  assert.equal(confirm.props.type, 'button')
  await confirm.props.onClick()
  tree = render()
  assert.equal(find(tree, (node) => node.props?.role === 'alert').props.children, 'network error, try again')
  assert.equal(
    find(tree, (node) => node.props?.children === 'stop sharing?'),
    undefined,
  )
  find(tree, (node) => node.props?.label === 'Cancel stop sharing').props.onClick()
  tree = render()
  assert.ok(find(tree, (node) => node.props?.label === 'Stop sharing'))
  fixture.runtime.unmount()
})

test('closed sharing controls do not check availability or allow submission', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let checks = 0
  const fixture = controls({
    currentSlug: null,
    suggestedAddress: 'owner',
    checkSlug: async () => {
      checks++
      return { available: true }
    },
  })
  const closed = { ...fixture.props, open: false }
  fixture.runtime.render(fixture.Component, closed)
  t.mock.timers.tick(300)
  await Promise.resolve()
  assert.equal(checks, 0)
  fixture.runtime.render(fixture.Component, fixture.props)
  t.mock.timers.tick(300)
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(checks, 1)
  const tree = fixture.runtime.render(fixture.Component, closed)
  assert.equal(find(tree, (node) => node.props?.label === 'Share map').props.disabled, true)
  fixture.runtime.unmount()
})

test('published maps expose a link and unpublish action, without name editing', () => {
  const fixture = controls()
  const tree = fixture.runtime.render(fixture.Component, fixture.props)
  const trigger = find(tree, (node) => node.props?.['aria-label'] === 'Sharing options')
  assert.ok(find(trigger, (node) => node.type === 'span' && [node.props.children].flat().join('') === '/owner'))
  assert.equal(
    find(trigger, (node) => node.type === 'span' && node.props.children === 'share map'),
    undefined,
  )
  assert.equal(
    find(tree, (node) => node.type === 'input'),
    undefined,
  )
  assert.equal(find(tree, (node) => node.type === 'a').props.href, '/owner')
  assert.ok(find(tree, (node) => node.props?.label === 'Share link'))
  assert.ok(find(tree, (node) => node.props?.label === 'Stop sharing'))
  fixture.runtime.unmount()
})

test('unpublished maps use a labelled trigger and cannot submit while closed', () => {
  const fixture = controls({ currentSlug: null, open: false })
  const tree = fixture.runtime.render(fixture.Component, fixture.props)
  const trigger = find(tree, (node) => node.props?.['aria-label'] === 'Share map')
  assert.equal(trigger.props.variant, 'text')
  assert.ok(find(trigger, (node) => node.type === 'span' && node.props.children === 'share map'))
  assert.equal(
    find(tree, (node) => node.type === 'input'),
    undefined,
  )
  fixture.runtime.unmount()
})

test('sharing copies the full map URL and announces success', async (t) => {
  let copied
  const previousWindow = globalThis.window
  globalThis.window = {
    location: { origin: 'https://maps.example' },
    matchMedia: () => ({ matches: false }),
  }
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  })
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  t.after(() => Object.defineProperty(globalThis, 'navigator', navigatorDescriptor))
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (url) => {
          copied = url
        },
      },
    },
  })
  const fixture = controls()
  let tree = fixture.runtime.render(fixture.Component, fixture.props)
  await find(tree, (node) => node.props?.label === 'Share link').props.onClick()
  tree = fixture.runtime.render(fixture.Component, fixture.props)
  assert.equal(copied, 'https://maps.example/owner')
  assert.ok(find(tree, (node) => node.props?.label === 'Link copied'))
  fixture.runtime.unmount()
})
