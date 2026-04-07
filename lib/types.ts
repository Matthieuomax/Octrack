export type FuelType = 'sp95' | 'sp98' | 'e10' | 'diesel' | 'e85' | 'gpl'

export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  sp95: 'SP95',
  sp98: 'SP98',
  e10: 'E10',
  diesel: 'Diesel',
  e85: 'E85',
  gpl: 'GPL',
}

export interface FillUp {
  id: string
  date: string // ISO date string YYYY-MM-DD
  liters: number
  pricePerLiter: number
  totalCost: number
  km?: number
  station?: string
  notes?: string
  fuelType?: FuelType
  // Sync metadata (transparent pour l'UI)
  _synced?: boolean
  _deletedAt?: string  // ISO timestamp — soft delete
}

export interface Settings {
  carBrand: string
  carModel: string
  carYear: string
  tankCapacity: number
  fuelType: FuelType
  theme: 'dark' | 'light' | 'system'
}

export type Period = 'week' | 'month' | 'year' | 'all'

export const PERIOD_LABELS: Record<Period, string> = {
  week: 'Semaine',
  month: 'Mois',
  year: 'Année',
  all: 'Tout',
}
