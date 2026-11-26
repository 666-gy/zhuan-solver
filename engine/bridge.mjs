// 把浏览器 Web Worker 的全局（self / postMessage / onmessage）适配到 Node worker_threads。
// solver.worker.js 原样加载，不改一行。
import { parentPort } from 'node:worker_threads'

globalThis.self = globalThis
globalThis.postMessage = (msg) => parentPort.postMessage(msg)

await import('./solver.worker.js')

parentPort.on('message', (data) => globalThis.self.onmessage({ data }))
