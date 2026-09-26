import { register } from 'node:module'
register('ts-node/esm', import.meta.url)
await import('./verify_csprng_randomness.ts')
