import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'
const { clusterActivities, filterActivityClusters, mergeClustersByLocation } = loadTs('src/lib/clusters.ts')

const activity = (id, latitude, longitude) => ({
  id: String(id),
  feature: { geometry: { coordinates: [[longitude, latitude]] } },
})
const canonical = (clusters) => clusters.map((cluster) => [...cluster.activityIds].sort().join(',')).sort()

// Independent all-pairs reference for the geographic connected components.
function reference(activities) {
  const unique = [...new Map(activities.map((item) => [item.id, item])).values()]
  const parents = unique.map((_, index) => index)
  const find = (index) => (parents[index] === index ? index : (parents[index] = find(parents[index])))
  for (let a = 0; a < unique.length; a++) {
    for (let b = a + 1; b < unique.length; b++) {
      const [lng1, lat1] = unique[a].feature.geometry.coordinates[0].map((value) => (value * Math.PI) / 180)
      const [lng2, lat2] = unique[b].feature.geometry.coordinates[0].map((value) => (value * Math.PI) / 180)
      const h = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2
      if (2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h))) <= 15) parents[find(b)] = find(a)
    }
  }
  const groups = new Map()
  unique.forEach((item, index) => {
    const root = find(index)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(item.id)
  })
  return [...groups.values()].map((activityIds) => ({ activityIds }))
}

test('spatial index matches geographic components for dense, scattered and chained routes', () => {
  let seed = 8128
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296
  for (const count of [1, 75, 500]) {
    const items = Array.from({ length: count }, (_, index) =>
      activity(
        index,
        index % 3 === 0 ? random() * 160 - 80 : 51.5 + random() * 0.6,
        index % 3 === 0 ? random() * 360 - 180 : -0.5 + random() * 0.8,
      ),
    )
    assert.deepEqual(canonical(clusterActivities(items)), canonical(reference(items)))
  }
  const chain = Array.from({ length: 150 }, (_, index) => activity(index, 0, index * 0.1))
  assert.equal(clusterActivities(chain).length, 1)
  assert.deepEqual(canonical(clusterActivities(chain)), canonical(reference(chain)))
})

test('handles date-line, polar, and distance-boundary neighbours', () => {
  const degree = ((15 / 6371) * 180) / Math.PI
  const cases = [
    [activity('a', 0, 179.99), activity('b', 0, -179.99)],
    [activity('a', 89.99, 10), activity('b', 89.99, -170)],
    [activity('a', 0, 0), activity('b', 0, degree * 0.99999)],
    [activity('a', 0, 0), activity('b', 0, degree * 1.00001)],
  ]
  for (const items of cases) assert.deepEqual(canonical(clusterActivities(items)), canonical(reference(items)))
})

test('keeps stable city identity and accurate counts/bounds when filtering', () => {
  const items = [activity('a', 51.5, -0.1), activity('b', 51.51, -0.09), activity('c', 33.9, 35.5)]
  const clusters = clusterActivities(items)
  const result = filterActivityClusters(clusters, [items[1]])
  assert.equal(result[0].id, clusters[0].id)
  assert.deepEqual(result[0].activityIds, ['b'])
  assert.equal(result[0].activityCount, 1)
  assert.equal(result[0].bounds.minLat, 51.51)
  assert.deepEqual(filterActivityClusters(clusters, []), [])
  assert.equal(clusterActivities(items), clusters)
})

test('ignores missing and invalid coordinates and counts duplicate IDs once', () => {
  const items = [
    activity('a', 51.5, -0.1),
    activity('a', 51.5, -0.1),
    activity('invalid', NaN, 0),
    { id: 'empty', feature: null },
  ]
  assert.deepEqual(clusterActivities(items)[0].activityIds, ['a'])
})

test('date-line routes have a local bounding box and centroid', () => {
  const [cluster] = clusterActivities([activity('east', 0, 179.99), activity('west', 0, -179.99)])
  assert(cluster.bounds.maxLng - cluster.bounds.minLng < 1)
  assert(Math.abs(cluster.centroid.longitude) > 179)
})
test('same-named distant cities remain separate', () => {
  const clusters = clusterActivities([activity('uk', 51.5, -0.1), activity('canada', 42.98, -81.25)]).map(
    (cluster) => ({ ...cluster, displayName: 'London' }),
  )
  assert.equal(mergeClustersByLocation(clusters).length, 2)
})

test('merged city clusters retain local date-line bounds', () => {
  const clusters = clusterActivities([activity('east', 0, 179.8), activity('west', 0, -179.8)]).map((cluster) => ({
    ...cluster,
    displayName: 'Date line city',
    id: 'ghsl:example:date-line-city',
  }))
  assert.equal(clusters.length, 2)
  const [merged] = mergeClustersByLocation(clusters)
  assert.equal(merged.activityCount, 2)
  assert(merged.bounds.maxLng - merged.bounds.minLng < 1)
  assert(Math.abs(merged.centroid.longitude) > 179)
})

test('nearby same-named settlements with distinct identities remain separate', () => {
  const clusters = clusterActivities([activity('a', 0, 0), activity('b', 0, 0.3)]).map((cluster) => ({
    ...cluster,
    displayName: 'Same name',
  }))
  assert.equal(mergeClustersByLocation(clusters).length, 2)
})
