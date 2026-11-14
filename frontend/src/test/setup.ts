/** 每个用例用一份干净的 localStorage，避免相互影响。 */
import { beforeEach } from 'vitest'

import { resetLifecycleMemory } from '@/data/lifecycle-store'
import { invalidateLocalStore } from '@/data/local-store'

beforeEach(() => {
  window.localStorage.clear()
  resetLifecycleMemory()
  invalidateLocalStore()
})
