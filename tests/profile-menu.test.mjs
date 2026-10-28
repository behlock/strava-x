import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

function find(node, match) {
  if (!node || typeof node !== 'object') return
  if (match(node)) return node
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = find(child, match)
    if (result) return result
  }
}

function fixture() {
  const slots = []
  let cursor = 0,
    disconnects = 0
  const Dialog = () => null
  const { ProfileMenu } = loadTs('src/components/ui/profile-menu.tsx', {
    react: {
      useState(initial) {
        const index = cursor++
        slots[index] ??= { value: initial }
        return [
          slots[index].value,
          (value) => {
            slots[index].value = typeof value === 'function' ? value(slots[index].value) : value
          },
        ]
      },
      useRef(value) {
        const index = cursor++
        return (slots[index] ??= { current: value })
      },
      useId: () => 'profile-test',
      useEffect() {},
      useCallback: (fn) => fn,
    },
    './logout-dialog': { LogoutDialog: Dialog },
    './map-style-toggle': { MapStyleToggle: () => null },
    './theme-switch': { ThemeSwitch: () => null },
    './tooltip': { Tooltip: () => null },
  })
  const render = () => {
    cursor = 0
    return ProfileMenu({ onDisconnect: () => disconnects++ })
  }
  return {
    render,
    Dialog,
    get disconnects() {
      return disconnects
    },
  }
}

test('opening logout confirmation and cancelling never disconnects', () => {
  const ui = fixture()
  let tree = ui.render()
  find(tree, (node) => node.props?.['aria-label'] === 'Log out').props.onClick()
  assert.equal(ui.disconnects, 0)
  tree = ui.render()
  const dialog = find(tree, (node) => node.type === ui.Dialog)
  assert.ok(dialog)
  dialog.props.onCancel()
  assert.equal(ui.disconnects, 0)
  assert.equal(
    find(ui.render(), (node) => node.type === ui.Dialog),
    undefined,
  )
})

test('only confirming logout invokes the disconnect action', () => {
  const ui = fixture()
  find(ui.render(), (node) => node.props?.['aria-label'] === 'Log out').props.onClick()
  find(ui.render(), (node) => node.type === ui.Dialog).props.onConfirm()
  assert.equal(ui.disconnects, 1)
  assert.equal(
    find(ui.render(), (node) => node.type === ui.Dialog),
    undefined,
  )
})
