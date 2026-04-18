import { SessionRegistry } from './sessions'

const mockSocket = {} as any

test('add and get session', () => {
  const r = new SessionRegistry()
  r.add('s1', mockSocket)
  expect(r.get('s1')).toMatchObject({ sessionId: 's1', tabId: null, pending: [] })
})

test('setTabId updates session and returns it', () => {
  const r = new SessionRegistry()
  r.add('s1', mockSocket)
  const s = r.setTabId('s1', 42)
  expect(s?.tabId).toBe(42)
  expect(r.get('s1')?.tabId).toBe(42)
})

test('setTabId on unknown session returns undefined', () => {
  const r = new SessionRegistry()
  expect(r.setTabId('nope', 1)).toBeUndefined()
})

test('remove returns session and deletes it', () => {
  const r = new SessionRegistry()
  r.add('s1', mockSocket)
  const removed = r.remove('s1')
  expect(removed?.sessionId).toBe('s1')
  expect(r.get('s1')).toBeUndefined()
})

test('getByTabId finds session by tab', () => {
  const r = new SessionRegistry()
  r.add('s1', mockSocket)
  r.setTabId('s1', 99)
  expect(r.getByTabId(99)?.sessionId).toBe('s1')
  expect(r.getByTabId(0)).toBeUndefined()
})

test('all returns all sessions', () => {
  const r = new SessionRegistry()
  r.add('s1', mockSocket)
  r.add('s2', mockSocket)
  expect(r.all()).toHaveLength(2)
})
