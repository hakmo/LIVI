import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})

if (typeof globalThis.structuredClone === 'undefined') {
  ;(globalThis as typeof globalThis & { structuredClone: <T>(value: T) => T }).structuredClone = <
    T
  >(
    value: T
  ): T => JSON.parse(JSON.stringify(value)) as T
}
