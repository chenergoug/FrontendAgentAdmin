import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { ColumnsType } from 'antd/es/table'

export function createIndexColumn<T>(page = 1, pageSize = 10): ColumnsType<T>[number] {
  return {
    title: '\u5e8f\u53f7',
    key: '__index',
    width: 72,
    align: 'center',
    fixed: 'start',
    render: (_value, _record, index) => (page - 1) * pageSize + index + 1
  }
}

export function withIndexColumn<T>(columns: ColumnsType<T>, page = 1, pageSize = 10): ColumnsType<T> {
  return [createIndexColumn<T>(page, pageSize), ...columns]
}

export const tablePageSizeOptions = [10, 20, 50]

export const tablePageSizeSelectOptions = tablePageSizeOptions.map((value) => ({
  label: `${value} \u6761`,
  value
}))

export const tablePageStyle: CSSProperties = {
  height: '100%',
  minHeight: 0
}

export const tableCardStyle: CSSProperties = {
  width: '100%',
  minHeight: 0
}

export const tableCardInnerStyle: CSSProperties = {
  width: '100%'
}

export const tableCardBodyStyle: CSSProperties = {
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column'
}

type TableScrollOptions = {
  bottomOffset?: number
  minHeight?: number
}

export function useTableScrollY(deps: unknown[] = [], options: TableScrollOptions = {}) {
  const { bottomOffset = 150, minHeight = 260 } = options
  const tableWrapperRef = useRef<HTMLDivElement>(null)
  const [scrollY, setScrollY] = useState<number>()

  useEffect(() => {
    const measure = () => {
      window.requestAnimationFrame(() => {
        const wrapper = tableWrapperRef.current
        if (!wrapper) return

        const table = wrapper.querySelector('.ant-table')
        const top = (table ?? wrapper).getBoundingClientRect().top
        const availableHeight = Math.max(minHeight, Math.floor(window.innerHeight - top - bottomOffset))
        const tableBody = wrapper.querySelector('.ant-table-body')
        const bodyContent = tableBody?.querySelector('.ant-table-tbody') ?? wrapper.querySelector('.ant-table-tbody')
        const contentHeight = bodyContent?.scrollHeight ?? 0
        setScrollY(contentHeight > availableHeight ? availableHeight : undefined)
      })
    }

    measure()
    window.addEventListener('resize', measure)

    const observer = new ResizeObserver(measure)
    if (tableWrapperRef.current) {
      observer.observe(tableWrapperRef.current)
    }

    return () => {
      window.removeEventListener('resize', measure)
      observer.disconnect()
    }
  }, [bottomOffset, minHeight, ...deps])

  return { tableWrapperRef, scrollY }
}

export function createTableScroll(scrollY?: number) {
  return scrollY ? { x: 'max-content', y: scrollY } : { x: 'max-content' }
}
