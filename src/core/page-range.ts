/**
 * 页码范围解析（纯函数，Worker 与 UI 共用）。
 *
 * 提取自 minopdf.com（app/shared/utils/page-range.ts），作为本库自包含核心。
 * 支持 "1-3,5"、"all"、留空；越界与非法片段被忽略。
 */

/** 解析为升序去重的页码（从 1 开始）。total 为文档总页数。 */
export function parsePageRange(range: string | undefined, total: number): number[] {
  if (!range || range.trim() === '' || range.trim().toLowerCase() === 'all') {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const pages = new Set<number>()
  for (const part of range.split(',')) {
    const seg = part.trim()
    if (!seg) continue
    if (seg.includes('-')) {
      const [a, b] = seg.split('-').map((s) => parseInt(s, 10))
      const lo = Math.max(1, a || 1)
      const hi = Math.min(total, b || total)
      for (let i = lo; i <= hi; i++) pages.add(i)
    } else {
      const n = parseInt(seg, 10)
      if (n >= 1 && n <= total) pages.add(n)
    }
  }
  return [...pages].sort((x, y) => x - y)
}

/**
 * 页码数组 → 范围写法（如 1-3,5,7-9）：升序去重后把连续段压缩。
 * 空数组返回 ''（等价于"全部页"）。供预览点选回写输入用，与 parsePageRange 互逆。
 */
export function formatPageRange(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((x, y) => x - y)
  if (sorted.length === 0) return ''
  const parts: string[] = []
  let start = sorted[0]!
  let prev = sorted[0]!
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i]!
    if (n === prev + 1) {
      prev = n
      continue
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`)
    start = n
    prev = n
  }
  parts.push(start === prev ? `${start}` : `${start}-${prev}`)
  return parts.join(',')
}

/**
 * 解析「页面选择」：保留用户书写的顺序与重复项（如 3,1,2 或 2,2,5）。
 * 与 parsePageRange 的区别：parsePageRange 去重并升序，适合「渲染哪些页」；
 * 页面提取需要按用户给出的顺序重建文档，因此必须保留顺序与重复。
 */
export function parsePageSelection(range: string | undefined, total: number): number[] {
  if (!range || range.trim() === '' || range.trim().toLowerCase() === 'all') {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const pages: number[] = []
  for (const part of range.split(',')) {
    const seg = part.trim()
    if (!seg) continue
    if (seg.includes('-')) {
      const [a, b] = seg.split('-').map((s) => parseInt(s, 10))
      const lo = Math.max(1, a || 1)
      const hi = Math.min(total, b || total)
      for (let i = lo; i <= hi; i++) pages.push(i)
    } else {
      const n = parseInt(seg, 10)
      if (n >= 1 && n <= total) pages.push(n)
    }
  }
  return pages
}

/**
 * 判断范围写法是否合法（不依赖总页数）。
 * 留空 / all 视为合法；单页 `5`、区间 `2-8`、开放区间 `2-` 与 `-5` 均合法，
 * 倒序区间（`8-2`）与无法识别的片段（`abc`）为非法。
 */
export function isValidPageRange(range: string): boolean {
  const raw = range.trim()
  if (raw === '' || raw.toLowerCase() === 'all') return true
  return raw.split(',').every((part) => {
    const seg = part.trim()
    if (!seg) return true
    if (/^\d+$/.test(seg)) return true
    const m = /^(\d*)-(\d*)$/.exec(seg)
    if (!m) return false
    const lo = m[1] === '' ? undefined : Number(m[1])
    const hi = m[2] === '' ? undefined : Number(m[2])
    return !(lo !== undefined && hi !== undefined && lo > hi)
  })
}
