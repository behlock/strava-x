import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

function find(node, predicate) {
  if (!node || typeof node !== 'object') return
  if (predicate(node)) return node
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = find(child, predicate)
    if (result) return result
  }
}

function fixture() {
  const { ActivityList } = loadTs('src/components/ui/activity-list.tsx', {
    react: {
      useRef: (current) => ({ current }),
      useState: (value) => [value, () => {}],
      useCallback: (fn) => fn,
      useMemo: (fn) => fn(),
      useEffect() {},
      useId: () => 'activity-test',
    },
    '@tanstack/react-virtual': {
      useVirtualizer: () => ({
        getTotalSize: () => 112,
        getVirtualItems: () => [
          { index: 0, start: 0, size: 56 },
          { index: 1, start: 56, size: 56 },
        ],
      }),
    },
    './panel': { Panel: () => null, PanelSkeleton: () => null },
  })
  const hovered = [],
    navigated = [],
    clicked = []
  const activities = [2, 1].map((id) => ({
    id: String(id),
    type: 'running',
    date: new Date(`2026-01-0${id}`),
    distance: 5,
    elevationGain: 0,
  }))
  const tree = ActivityList({
    activities,
    highlightedActivityId: null,
    onActivityHover: (id) => hovered.push(id),
    onActivityNavigate: (activity) => navigated.push(activity.id),
    onActivityClick: (activity) => clicked.push(activity.id),
  })
  return { tree, hovered, navigated, clicked }
}

test('keyboard selections use immediate navigation without scheduling hover motion', () => {
  const ui = fixture()
  const list = find(ui.tree, (node) => node.props?.role === 'listbox')
  for (const key of ['ArrowDown', 'ArrowDown', 'Enter']) list.props.onKeyDown({ key, preventDefault() {} })
  assert.deepEqual(ui.navigated, ['2', '1', '1'])
  assert.deepEqual(ui.hovered, [])
  assert.deepEqual(ui.clicked, [])
})

test('touch entry does not start mouse-hover navigation', () => {
  const ui = fixture()
  const row = find(ui.tree, (node) => node.props?.role === 'option')
  row.props.onPointerEnter({ pointerType: 'touch', clientX: 0, clientY: 0 })
  assert.deepEqual(ui.hovered, [])
  row.props.onPointerEnter({ pointerType: 'mouse', clientX: 0, clientY: 0 })
  assert.deepEqual(ui.hovered, ['2'])
})
