// 命令行求解器：调用从 zhuan.zoro.build 提取的官方 solver.worker.js
//
// 用法一（直接给矩阵）：
//   node solve.mjs 4x4 "1,2,2,3,4,3,1,4,3,4,1,2,2,3,4,1"
//
// 用法二（从 JSON 文件读，便于脚本批量）：
//   node solve.mjs board.json
//   board.json: { "rows": 8, "cols": 8, "cells": [1,2,...], "flags": [0,...] }
//
// 约定：cells 用 0 表示空格，1..N 表示颜色；flags 一般全 0
//       （1 或 4 = 锁定块，2 = 可变块，8 = 不计入剩余）。
// 输出：JSON，包含 solved / steps / nodes / elapsedMs。

import { Worker } from 'node:worker_threads'
import fs from 'node:fs'

export function solveBoard(rows, cols, cells, flags, budgetMs = 8000) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./engine/bridge.mjs', import.meta.url), { type: 'module' })
    const timer = setTimeout(() => {
      worker.terminate()
      reject(new Error('求解器超时（worker 未返回）'))
    }, budgetMs + 10000)

    worker.on('message', (msg) => {
      if (msg.type === 'result') {
        clearTimeout(timer)
        worker.terminate()
        resolve(msg.result)
      } else if (msg.type === 'error') {
        clearTimeout(timer)
        worker.terminate()
        reject(new Error(msg.message))
      }
    })
    worker.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })

    worker.postMessage({
      type: 'solve',
      rows,
      cols,
      cells: Uint8Array.from(cells),
      flags: Uint8Array.from(flags && flags.length ? flags : new Array(rows * cols).fill(0)),
      budgetMs,
    })
  })
}

// 把 0 基下标转成“第 r 行第 c 列”，方便照着点
export function describeStep(step, cols) {
  const pos = (i) => `第${Math.floor(i / cols) + 1}行第${(i % cols) + 1}列`
  if (step.kind === 'elim') return `点击消除 ${pos(step.a)} ↔ ${pos(step.b)}`
  const dir = { U: '上', D: '下', L: '左', R: '右' }[step.dir] ?? step.dir
  return `把 ${pos(step.from)} 向${dir}滑 ${step.dist} 格 → ${pos(step.to)}`
}

const isMain = process.argv[1] && /solve\.mjs$/.test(process.argv[1])
if (isMain) {
  const [a, b] = process.argv.slice(2)
  let rows, cols, cells, flags

  if (a && a.includes('x')) {
    ;[rows, cols] = a.split('x').map(Number)
    cells = String(b || '').split(/[\s,]+/).filter(Boolean).map(Number)
  } else if (a) {
    const data = JSON.parse(fs.readFileSync(a, 'utf8'))
    ;({ rows, cols, cells, flags } = data)
  } else {
    // 无参数时跑站内演示盘（4×4）
    rows = 4
    cols = 4
    cells = [1, 2, 2, 3, 4, 3, 1, 4, 3, 4, 1, 2, 2, 3, 4, 1]
  }

  if (cells.length !== rows * cols) {
    console.error(`格子数不对：${rows}×${cols} 需要 ${rows * cols} 个，实际 ${cells.length}`)
    process.exit(1)
  }

  const started = Date.now()
  const res = await solveBoard(rows, cols, cells, flags, 8000)
  const out = {
    solved: res.solved,
    exhausted: res.exhausted,
    steps: res.steps.map((s, i) => ({ n: i + 1, ...s, text: describeStep(s, cols) })),
    bestRemaining: res.bestRemaining,
    nodes: res.nodes,
    elapsedMs: res.elapsedMs ?? Date.now() - started,
    reason: res.reason ?? null,
  }
  console.log(JSON.stringify(out, null, 2))
}
