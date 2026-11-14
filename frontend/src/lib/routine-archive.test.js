// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { _setLangState } from './i18n-core.js'
import { stampDeletions } from './sync-merge.js'
import { folderList } from './routine-folders.js'
import {
  scheduledDays, archiveRoutines, restoreRoutines, archiveFolder, restoreFolder,
  deleteFolderWithRoutines, deleteArchived, undoSnapshot, migrateArchiveFolder,
} from './routine-archive.js'

const r = (id, folder, extra) => ({ id, name: id, ex: [], ...(folder ? { folder } : {}), ...extra })
const state = () => ({
  routines: [r('a', 'Block'), r('b', 'Block'), r('c')],
  routineFolders: [{ name: 'Block', current: true }, { name: 'Other' }],
  week: { 1: ['a', 'b'], 3: ['a'] },
  dayPlan: { '2026-11-16': 'a', '2026-11-17': 'c' },
  rotation: { sequence: ['b', 'a', 'rest', 'a'] },
  queue: { ids: ['a', 'b'] },
})

describe('routine archive', () => {
  afterEach(() => _setLangState('en', {}, null, null))

  it('says where a routine is scheduled', () => {
    expect(scheduledDays(state(), 'a')).toEqual({ week: [1, 3], dayPlan: ['2026-11-16'], loop: true })
    expect(scheduledDays(state(), 'c')).toEqual({ week: [], dayPlan: ['2026-11-17'], loop: false })
  })

  it('archives off the week, reschedules and loop, keeps the queue id, and undo puts it all back', () => {
    const s = state()
    const before = structuredClone(s)
    const snap = archiveRoutines(s, ['a'])
    expect(s.routines[0].archived).toBe(true)
    expect(s.routines[0].folder).toBe('Block')
    expect(s.week).toEqual({ 1: ['b'] })
    expect(s.dayPlan).toEqual({ '2026-11-17': 'c' })
    expect(s.rotation.sequence).toEqual(['b', 'rest'])
    expect(s.queue.ids).toEqual(['a', 'b'])
    expect(undoSnapshot(s, snap)).toBe(true)
    expect(s).toEqual(before)
    expect(undoSnapshot(s, snap)).toBe(false)
  })

  it('archives only live routines and snapshots nothing for the rest', () => {
    const s = state()
    s.routines[2].archived = true
    expect(undoSnapshot(s, archiveRoutines(s, ['c']))).toBe(false)
  })

  it('restores routines and re-adds a missing folder entry at the end', () => {
    const s = state()
    s.routines[0].archived = true
    s.routineFolders = [{ name: 'Other' }]
    restoreRoutines(s, ['a'])
    expect('archived' in s.routines[0]).toBe(false)
    expect(s.routineFolders).toEqual([{ name: 'Other' }, { name: 'Block' }])
  })

  it('archives a folder: entry and current mark go, routines are archived; restore brings it back last', () => {
    const s = state()
    const snap = archiveFolder(s, 'block')
    expect(s.routines.map(x => !!x.archived)).toEqual([true, true, false])
    expect(s.routineFolders).toEqual([{ name: 'Other' }])
    expect(s.rotation.sequence).toEqual(['rest'])
    restoreFolder(s, 'Block')
    expect(s.routines.some(x => x.archived)).toBe(false)
    expect(s.routineFolders).toEqual([{ name: 'Other' }, { name: 'Block' }])
    archiveFolder(s, 'Block')
    expect(undoSnapshot(s, snap)).toBe(true)
    expect(s.routineFolders[0]).toEqual({ name: 'Block', current: true })
    expect(s.routines.some(x => x.archived)).toBe(false)
  })

  it('deletes only the archived routines among the ids, and undo puts them back archived', () => {
    const s = state()
    archiveRoutines(s, ['a'])
    const prev = structuredClone(s)
    const snap = deleteArchived(s, ['a', 'b'])
    expect(s.routines.map(x => x.id)).toEqual(['b', 'c'])
    expect(undoSnapshot(s, snap)).toBe(true)
    expect(s.routines).toEqual(prev.routines)
  })

  it('deleting a folder leaves its archived routines alone', () => {
    const s = state()
    s.routines.push(r('z', 'Block', { archived: true }))
    deleteFolderWithRoutines(s, 'Block')
    expect(s.routines.map(x => x.id)).toEqual(['c', 'z'])
    expect(s.routines[1].folder).toBe('Block')
  })

  it('deletes a folder with its routines, writes tombstones, and undo restores them', () => {
    const s = state()
    const prev = structuredClone(s)
    const snap = deleteFolderWithRoutines(s, 'Block')
    expect(s.routines.map(x => x.id)).toEqual(['c'])
    expect(s.week).toEqual({})
    expect(folderList(s).map(f => f.name)).toEqual(['Other'])
    stampDeletions(prev, s)
    expect(Object.keys(s.deleted.routines).sort()).toEqual(['a', 'b'])
    expect(undoSnapshot(s, snap)).toBe(true)
    expect(s.routines.map(x => x.id)).toEqual(['a', 'b', 'c'])
    expect(s.routineFolders).toEqual(prev.routineFolders)
    expect(s.week).toEqual(prev.week)
  })

  describe('the old Archive folder moves once', () => {
    it('archives English "Archive" and the device language name, not a foreign one', () => {
      _setLangState('de', { Archive: 'Archiv' }, null, null)
      const s = { routines: [r('a', 'Archive'), r('b', 'Archiv'), r('c', 'Push')] }
      expect(migrateArchiveFolder(s)).toBe(true)
      expect(s.routines.map(x => [!!x.archived, x.folder])).toEqual([[true, undefined], [true, undefined], [false, 'Push']])
      expect(s.archiveMoved).toBe(true)
    })
    it('leaves "Archiv" alone under en', () => {
      const s = { routines: [r('a', 'Archiv')] }
      migrateArchiveFolder(s)
      expect(s.routines[0]).toEqual(r('a', 'Archiv'))
    })
    it('changes nothing the second time, even for a folder an old app later called Archive', () => {
      const s = { routines: [r('a', 'Archive')] }
      migrateArchiveFolder(s)
      s.routines.push(r('b', 'Archive'))
      const copy = structuredClone(s)
      expect(migrateArchiveFolder(s)).toBe(false)
      expect(s).toEqual(copy)
    })
  })
})
