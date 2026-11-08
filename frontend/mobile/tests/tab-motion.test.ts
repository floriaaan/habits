import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cardStartGeometry,
  cardResizePhase,
  pendingCardSize,
  matchingCardSource,
  visibleCardRect,
  cardMotionKey,
  scrolledVisibleCardRect,
} from '../src/presentation/shared/motion/tab-motion-model'

test('the pre-focus frame already has the starting size, never the final size', () => {
  const transition = { id: 7, expiresAt: 800 }
  const source = { x: 6, y: 0, width: 188, height: 400 }
  const target = { width: 390, height: 220 }
  const pending = pendingCardSize(transition, null, source, target, 0)
  const tweenStart = cardStartGeometry(source, {
    targetOriginX: 0,
    targetOriginY: 0,
    targetGlobalOriginX: 6,
    targetGlobalOriginY: 70,
    targetWidth: target.width,
    targetHeight: target.height,
  })
  assert.deepEqual(pending, tweenStart)
  assert.notEqual(pending?.width, target.width)
  assert.notEqual(pending?.height, target.height)
  // Layout/attachment notifications before focus keep the same prepared size.
  assert.deepEqual(
    pendingCardSize(transition, null, source, target, 20),
    pending,
  )
  // Once started, only the ongoing tween owns the displayed size.
  assert.equal(
    pendingCardSize(transition, { id: 7, animated: true }, source, target, 30),
    null,
  )
  assert.equal(
    pendingCardSize(transition, { id: 7, animated: true }, source, target, 900),
    null,
  )
})

test('new morphs wait for layout; unmatched, reduced and skipped cards never rewind', () => {
  const transition = { id: 7, expiresAt: 800 }
  const source = { x: 6, y: 0, width: 390, height: 400 }
  const unmeasured = { width: 0, height: 0 }
  // A non-null pending size gates first paint until layout, instead of painting
  // a 100% destination surface while waiting for JS onLayout / native focus.
  assert.ok(pendingCardSize(transition, null, source, unmeasured, 0))
  assert.equal(pendingCardSize(transition, null, null, unmeasured, 0), null)
  assert.equal(pendingCardSize(null, null, source, unmeasured, 0), null)
  assert.equal(pendingCardSize(transition, null, source, unmeasured, 900), null)
  assert.equal(
    pendingCardSize(
      transition,
      { id: 7, animated: false },
      source,
      unmeasured,
      0,
    ),
    null,
  )
})

test('a morph is consumed once; late layout and expiry never restart or truncate it', () => {
  const transition = { id: 7, expiresAt: 800 }
  assert.equal(cardResizePhase(transition, null, 0), 'start')

  const accepted = { id: 7, animated: true }
  // A layout change near the last frame must retarget from the displayed size.
  assert.equal(cardResizePhase(transition, accepted, 330), 'retarget')
  // A later render after expiry must keep those same dimensions / tween.
  assert.equal(cardResizePhase(transition, accepted, 850), 'retarget')
  assert.equal(cardResizePhase(transition, null, 850), 'idle')
  assert.equal(
    cardResizePhase(transition, { id: 7, animated: false }, 100),
    'idle',
  )
  assert.equal(
    cardResizePhase({ id: 8, expiresAt: 1600 }, accepted, 900),
    'start',
  )
})

test('tab cards resize locally with bounded dimensions, without crossing the screen', () => {
  const source = { x: 208, y: 420, width: 188, height: 180 }
  const target = {
    targetOriginX: 6,
    targetOriginY: 280,
    targetGlobalOriginX: 6,
    targetGlobalOriginY: 220,
    targetWidth: 390,
    targetHeight: 360,
  }
  const initial = cardStartGeometry(source, target)
  assert.deepEqual(initial, {
    originX: 6,
    originY: 280,
    width: 195,
    height: 360 * 0.72,
  })
  assert.equal(initial.width, target.targetWidth * 0.5)
  assert.notEqual(initial.height, target.targetHeight)
})
test('tab motion measures only visible surfaces and clips scroll offsets', () => {
  assert.deepEqual(
    visibleCardRect({ x: 6, y: -100, width: 390, height: 400 }, 402, 874),
    { x: 6, y: 0, width: 390, height: 300 },
  )
  assert.equal(
    visibleCardRect({ x: 6, y: 900, width: 390, height: 100 }, 402, 874),
    null,
  )
  assert.equal(
    visibleCardRect({ x: 6, y: 0, width: 0, height: 100 }, 402, 874),
    null,
  )
  assert.equal(
    visibleCardRect({ x: NaN, y: 0, width: 390, height: 100 }, 402, 874),
    null,
  )
})

test('tab cards bound both dimensions even for oversized source cards', () => {
  const target = {
    targetOriginX: 6,
    targetOriginY: 6,
    targetGlobalOriginX: 6,
    targetGlobalOriginY: 6,
    targetWidth: 300,
    targetHeight: 200,
  }
  assert.deepEqual(
    cardStartGeometry({ x: 900, y: -300, width: 310, height: 210 }, target),
    { originX: 6, originY: 6, width: 310, height: 210 },
  )
  assert.deepEqual(
    cardStartGeometry({ x: 0, y: 0, width: 1000, height: 1000 }, target),
    { originX: 6, originY: 6, width: 600, height: 200 * 1.28 },
  )
})

test('morph excludes cards hidden by the dock or showing only a thin edge', () => {
  const contentHeight = 790
  assert.equal(
    visibleCardRect(
      { x: 6, y: 800, width: 390, height: 150 },
      402,
      contentHeight,
    ),
    null,
  )
  assert.equal(
    visibleCardRect(
      { x: 6, y: 775, width: 390, height: 150 },
      402,
      contentHeight,
    ),
    null,
  )
  assert.equal(
    visibleCardRect(
      { x: 6, y: -140, width: 390, height: 150 },
      402,
      contentHeight,
    ),
    null,
  )
  assert.ok(
    visibleCardRect(
      { x: 6, y: 700, width: 390, height: 150 },
      402,
      contentHeight,
    ),
  )
})

test('width morph preserves equal widths and ignores subpixel measurement noise', () => {
  const target = {
    targetOriginX: 6,
    targetOriginY: 6,
    targetGlobalOriginX: 6,
    targetGlobalOriginY: 6,
    targetWidth: 390,
    targetHeight: 200,
  }
  for (const width of [389.5, 390.5, 390]) {
    assert.equal(
      cardStartGeometry({ x: 6, y: 6, width, height: 180 }, target).width,
      390,
    )
  }
  assert.equal(
    cardStartGeometry({ x: 6, y: 6, width: 188, height: 180 }, target).width,
    195,
  )
})

test('colored cards match by palette instead of unrelated ordinal roles', () => {
  const green = ['#eefadc', '#e0f2c9'],
    pink = ['#ffe7ed', '#f9c4d6']
  assert.equal(
    cardMotionKey('secondary', green),
    cardMotionKey('tertiary', green),
  )
  assert.notEqual(
    cardMotionKey('secondary', green),
    cardMotionKey('secondary', pink),
  )
  assert.notEqual(cardMotionKey('primary'), cardMotionKey('daily-detail'))
})
test('native tap snapshots account for current scrolling and exclude hidden source cards', () => {
  const card = { x: 6, y: 500, width: 390, height: 200 }
  assert.deepEqual(scrolledVisibleCardRect(card, 300, 402, 790), {
    x: 6,
    y: 200,
    width: 390,
    height: 200,
  })
  assert.equal(scrolledVisibleCardRect(card, 750, 402, 790), null)
  assert.equal(scrolledVisibleCardRect(card, -350, 402, 790), null)
})

test('absent colors stay still; neutral cards pair in visible vertical order', () => {
  const upper = { x: 6, y: 0, width: 390, height: 180 }
  const lower = { x: 6, y: 300, width: 390, height: 260 }
  const sources = { secondary: upper, primary: lower, 'color:green': lower }
  assert.equal(matchingCardSource('color:pink', sources, {}, 0), undefined)
  assert.equal(matchingCardSource('color:green', sources, {}, 0), lower)
  const targets = { categories: upper, header: lower }
  assert.equal(matchingCardSource('categories', sources, targets, 2), upper)
  assert.equal(matchingCardSource('header', sources, targets, 0), lower)
  assert.equal(matchingCardSource('header', sources, {}, 0), upper)
  assert.equal(matchingCardSource('third', sources, {}, 2), undefined)
  // A source header scrolled out of view isn't in the snapshot: the next visible
  // neutral card supplies the first destination, irrespective of its old role.
  assert.equal(matchingCardSource('header', { journal: lower }, {}, 0), lower)
})

test('tabs and habit screens match visible neutral cards in all twenty directed pairs', () => {
  const upper = { x: 6, y: 6, width: 390, height: 210 }
  const lower = { x: 6, y: 300, width: 390, height: 180 }
  const screens: Record<string, typeof upper>[] = [
    { primary: upper },
    { primary: upper, secondary: lower },
    { primary: upper, 'daily-detail': lower },
    { primary: upper, tertiary: lower },
    { primary: upper, goal: lower },
  ]
  for (const [fromIndex, from] of screens.entries()) {
    for (const [toIndex, to] of screens.entries()) {
      if (fromIndex === toIndex) continue
      assert.equal(matchingCardSource('primary', from, to, 0), upper)
      for (const key of Object.keys(to).filter((key) => key !== 'primary'))
        assert.equal(
          matchingCardSource(key, from, to, 1),
          Object.values(from)[1],
        )
    }
  }
})

test('habit charts and regularity reuse only visible matching colors in both directions', () => {
  const card = { x: 6, y: 260, width: 390, height: 220 }
  const pink = cardMotionKey('chart', ['pink', 'pink-end'])
  const green = cardMotionKey('regularity', ['green', 'green-end'])
  const blue = cardMotionKey('water', ['blue', 'blue-end'])
  const overview = { primary: card, [pink]: card, [green]: card, [blue]: card }
  const habit = { header: card, [pink]: card, [green]: card }
  for (const key of [pink, green]) {
    assert.equal(matchingCardSource(key, overview, habit, 0), card)
    assert.equal(matchingCardSource(key, habit, overview, 0), card)
  }
  assert.equal(matchingCardSource(blue, habit, overview, 0), undefined)
})

test('welcome, login and home pair neutral cards without borrowing absent colors', () => {
  const upper = { x: 6, y: 6, width: 390, height: 580 }
  const lower = { x: 6, y: 600, width: 390, height: 160 }
  const green = cardMotionKey('auth-footer', ['green', 'green-end'])
  const welcome = { primary: upper, 'welcome-footer': lower }
  const login = { primary: upper, [green]: lower }
  const home = { primary: upper, [green]: lower }
  assert.equal(matchingCardSource('primary', welcome, login, 0), upper)
  assert.equal(matchingCardSource(green, welcome, login, 0), undefined)
  assert.equal(matchingCardSource('primary', login, welcome, 0), upper)
  assert.equal(matchingCardSource('welcome-footer', login, welcome, 1), undefined)
  assert.equal(matchingCardSource(green, login, home, 0), lower)
  assert.equal(matchingCardSource('primary', login, login, 0), upper)
})
