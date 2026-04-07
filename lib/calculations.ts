import { FillUp, Period } from './types'

export function filterByPeriod(fillUps: FillUp[], period: Period): FillUp[] {
  if (period === 'all') return fillUps

  const now = new Date()
  let cutoff: Date

  switch (period) {
    case 'week': {
      cutoff = new Date(now)
      cutoff.setDate(now.getDate() - 7)
      break
    }
    case 'month': {
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    }
    case 'year': {
      cutoff = new Date(now.getFullYear(), 0, 1)
      break
    }
    default:
      return fillUps
  }

  return fillUps.filter((f) => new Date(f.date) >= cutoff)
}

export function totalCost(fillUps: FillUp[]): number {
  return fillUps.reduce((sum, f) => sum + f.totalCost, 0)
}

export function totalLiters(fillUps: FillUp[]): number {
  return fillUps.reduce((sum, f) => sum + f.liters, 0)
}

export function averagePricePerLiter(fillUps: FillUp[]): number {
  if (fillUps.length === 0) return 0
  const total = fillUps.reduce((sum, f) => sum + f.pricePerLiter, 0)
  return total / fillUps.length
}

export function averageFillUpCost(fillUps: FillUp[]): number {
  if (fillUps.length === 0) return 0
  return totalCost(fillUps) / fillUps.length
}

export function consumptionPer100km(fillUps: FillUp[]): number | null {
  const withKm = fillUps.filter((f) => f.km !== undefined).sort((a, b) => (a.km ?? 0) - (b.km ?? 0))
  if (withKm.length < 2) return null

  const totalKm = (withKm[withKm.length - 1].km ?? 0) - (withKm[0].km ?? 0)
  if (totalKm <= 0) return null

  const liters = withKm.slice(1).reduce((sum, f) => sum + f.liters, 0)
  return (liters / totalKm) * 100
}

export function groupByMonth(fillUps: FillUp[]): Record<string, FillUp[]> {
  return fillUps.reduce(
    (groups, f) => {
      const key = f.date.slice(0, 7)
      if (!groups[key]) groups[key] = []
      groups[key].push(f)
      return groups
    },
    {} as Record<string, FillUp[]>,
  )
}

export function getLast6Months(): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatLiters(liters: number): string {
  return `${liters.toFixed(2)} L`
}

export function formatPricePerLiter(price: number): string {
  return `${price.toFixed(3)} €/L`
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
  }).format(date)
}

export function formatMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(date)
}

export function priceEvolution(fillUps: FillUp[]): number | null {
  if (fillUps.length < 2) return null
  const sorted = [...fillUps].sort((a, b) => a.date.localeCompare(b.date))
  const oldest = sorted[0].pricePerLiter
  const newest = sorted[sorted.length - 1].pricePerLiter
  return ((newest - oldest) / oldest) * 100
}
