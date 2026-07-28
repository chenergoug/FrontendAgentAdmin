function pad(value: string | number) {
  return String(value).padStart(2, '0')
}

export function formatDateTimeToSecond(value?: string | null) {
  if (!value) return '-'

  const text = String(value).trim()
  const matched = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/)
  if (matched) {
    const [, year, month, day, hour, minute, second = '00'] = matched
    return `${year}/${pad(month)}/${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`
  }

  const date = new Date(text)
  if (Number.isNaN(date.getTime())) {
    return text
  }

  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
