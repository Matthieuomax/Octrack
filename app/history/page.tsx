'use client'

import { useState, useCallback } from 'react'
import { ArrowLeft, Pencil, Trash2, Check, X, Fuel, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/components/AppContext'
import { filterByPeriod, formatCurrency, formatDate, formatLiters, totalCost, totalLiters } from '@/lib/calculations'
import { FillUp, FuelType, FUEL_TYPE_LABELS, Period, PERIOD_LABELS } from '@/lib/types'

const PERIODS: Period[] = ['week', 'month', 'year', 'all']

interface EditState {
  date: string
  liters: string
  pricePerLiter: string
  totalCost: string
  km: string
  station: string
  notes: string
  fuelType: FuelType
}

function EditForm({
  fillUp,
  onSave,
  onCancel,
}: {
  fillUp: FillUp
  onSave: (data: Omit<FillUp, 'id'>) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<EditState>({
    date: fillUp.date,
    liters: fillUp.liters.toString(),
    pricePerLiter: fillUp.pricePerLiter.toString(),
    totalCost: fillUp.totalCost.toString(),
    km: fillUp.km?.toString() ?? '',
    station: fillUp.station ?? '',
    notes: fillUp.notes ?? '',
    fuelType: fillUp.fuelType ?? 'sp95',
  })
  const [autoTotal, setAutoTotal] = useState(false)

  const update = useCallback(
    (field: keyof EditState, value: string) => {
      setForm((prev) => {
        const next = { ...prev, [field]: value }
        if (autoTotal && (field === 'liters' || field === 'pricePerLiter')) {
          const l = parseFloat(next.liters)
          const p = parseFloat(next.pricePerLiter)
          if (!isNaN(l) && !isNaN(p)) next.totalCost = (l * p).toFixed(2)
        }
        if (field === 'totalCost') setAutoTotal(false)
        return next
      })
    },
    [autoTotal],
  )

  const handleSave = () => {
    const l = parseFloat(form.liters)
    const p = parseFloat(form.pricePerLiter)
    const t = parseFloat(form.totalCost)
    if (isNaN(l) || isNaN(p) || isNaN(t)) return

    onSave({
      date: form.date,
      liters: l,
      pricePerLiter: p,
      totalCost: t,
      km: form.km ? parseFloat(form.km) : undefined,
      station: form.station || undefined,
      notes: form.notes || undefined,
      fuelType: form.fuelType,
    })
  }

  return (
    <div
      className="p-4 rounded-xl space-y-3"
      style={{ backgroundColor: 'var(--color-surface-2)', border: '2px solid var(--color-accent)' }}
    >
      <p
        className="text-xs font-bold uppercase tracking-widest"
        style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-accent)' }}
      >
        Modifier ce plein
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--color-muted)' }}>
            Date
          </label>
          <input type="date" value={form.date} onChange={(e) => update('date', e.target.value)} className="input-field text-sm py-2.5" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--color-muted)' }}>
            Litres
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={form.liters}
            onChange={(e) => update('liters', e.target.value)}
            className="input-field text-sm py-2.5"
            placeholder="42.5"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--color-muted)' }}>
            Prix/L (€)
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={form.pricePerLiter}
            onChange={(e) => update('pricePerLiter', e.target.value)}
            className="input-field text-sm py-2.5"
            placeholder="1.799"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--color-muted)' }}>
            Total (€)
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={form.totalCost}
            onChange={(e) => update('totalCost', e.target.value)}
            className="input-field text-sm py-2.5"
            placeholder="76.22"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--color-muted)' }}>
            Km (opt.)
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={form.km}
            onChange={(e) => update('km', e.target.value)}
            className="input-field text-sm py-2.5"
            placeholder="87 340"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--color-muted)' }}>
            Carburant
          </label>
          <select
            value={form.fuelType}
            onChange={(e) => update('fuelType', e.target.value)}
            className="input-field text-sm py-2.5"
          >
            {Object.entries(FUEL_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wide block mb-1" style={{ color: 'var(--color-muted)' }}>
          Station (opt.)
        </label>
        <input
          type="text"
          value={form.station}
          onChange={(e) => update('station', e.target.value)}
          className="input-field text-sm py-2.5"
          placeholder="Total, BP, Shell…"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold"
          style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
        >
          <Check size={15} />
          Enregistrer
        </button>
        <button
          onClick={onCancel}
          className="w-12 flex items-center justify-center rounded-xl btn-ghost"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

function DeleteConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div
      className="p-4 rounded-xl"
      style={{ backgroundColor: 'rgba(255,53,53,0.08)', border: '1.5px solid var(--color-alert)' }}
    >
      <div className="flex items-start gap-3">
        <AlertCircle size={18} style={{ color: 'var(--color-alert)', flexShrink: 0, marginTop: 2 }} />
        <div className="flex-1">
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--color-content)' }}>
            Supprimer ce plein ?
          </p>
          <p className="text-xs mb-3" style={{ color: 'var(--color-muted)' }}>
            Cette action est irréversible.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold"
              style={{ backgroundColor: 'var(--color-alert)', color: 'white' }}
            >
              Supprimer
            </button>
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold btn-ghost"
            >
              Annuler
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HistoryPage() {
  const router = useRouter()
  const { fillUps, updateFillUp, deleteFillUp } = useApp()

  const [period, setPeriod] = useState<Period>('month')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const filtered = filterByPeriod(fillUps, period).sort((a, b) => b.date.localeCompare(a.date))

  const handleSave = (id: string, data: Omit<FillUp, 'id'>) => {
    updateFillUp(id, data)
    setEditingId(null)
  }

  const handleDelete = (id: string) => {
    deleteFillUp(id)
    setDeletingId(null)
  }

  const periodCost = totalCost(filtered)
  const periodLiters = totalLiters(filtered)

  return (
    <div className="px-4 pt-12 page-enter">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-surface)' }}
        >
          <ArrowLeft size={18} style={{ color: 'var(--color-content)' }} />
        </button>
        <div>
          <h1
            className="text-2xl font-bold uppercase tracking-wide leading-tight"
            style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-content)' }}
          >
            Historique
          </h1>
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            {fillUps.length} plein{fillUps.length !== 1 ? 's' : ''} enregistré{fillUps.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Period tabs */}
      <div
        className="flex rounded-xl p-1 mb-4 overflow-x-auto gap-1"
        style={{ backgroundColor: 'var(--color-surface)' }}
      >
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className="period-tab flex-1 text-center"
            style={{
              backgroundColor: period === p ? 'var(--color-accent)' : 'transparent',
              color: period === p ? 'white' : 'var(--color-muted)',
              fontWeight: period === p ? '700' : '500',
            }}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Summary band */}
      {filtered.length > 0 && (
        <div
          className="flex items-center justify-between px-4 py-3 rounded-xl mb-4"
          style={{ backgroundColor: 'var(--color-surface)', borderLeft: '3px solid var(--color-accent)' }}
        >
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
              {filtered.length} plein{filtered.length !== 1 ? 's' : ''}
            </p>
            <p
              className="text-xl font-bold"
              style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-accent)' }}
            >
              {formatCurrency(periodCost)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
              Volume
            </p>
            <p
              className="text-xl font-bold"
              style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-info)' }}
            >
              {formatLiters(periodLiters)}
            </p>
          </div>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <Fuel size={36} className="mx-auto mb-4" style={{ color: 'var(--color-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Aucun plein sur cette période
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((f) => {
            const isEditing = editingId === f.id
            const isDeleting = deletingId === f.id

            if (isEditing) {
              return (
                <EditForm
                  key={f.id}
                  fillUp={f}
                  onSave={(data) => handleSave(f.id, data)}
                  onCancel={() => setEditingId(null)}
                />
              )
            }

            if (isDeleting) {
              return (
                <DeleteConfirm
                  key={f.id}
                  onConfirm={() => handleDelete(f.id)}
                  onCancel={() => setDeletingId(null)}
                />
              )
            }

            const date = new Date(f.date + 'T00:00:00')
            const day = date.getDate()
            const monthStr = new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(date)

            return (
              <div
                key={f.id}
                className="card p-4 flex gap-3"
              >
                {/* Date badge */}
                <div
                  className="flex flex-col items-center justify-center w-12 h-12 rounded-xl flex-shrink-0"
                  style={{ backgroundColor: 'var(--color-surface-2)' }}
                >
                  <span
                    className="text-xl font-bold leading-none"
                    style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-accent)' }}
                  >
                    {day}
                  </span>
                  <span className="text-[9px] uppercase" style={{ color: 'var(--color-muted)' }}>
                    {monthStr}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-lg font-bold"
                      style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-content)' }}
                    >
                      {formatLiters(f.liters)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                      à {f.pricePerLiter.toFixed(3)} €/L
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-0.5">
                    {f.station && (
                      <span className="text-xs truncate" style={{ color: 'var(--color-muted)' }}>
                        {f.station}
                      </span>
                    )}
                    {f.fuelType && (
                      <span
                        className="badge text-[9px]"
                        style={{
                          backgroundColor: 'rgba(41,169,209,0.12)',
                          color: 'var(--color-info)',
                          border: '1px solid rgba(41,169,209,0.25)',
                        }}
                      >
                        {FUEL_TYPE_LABELS[f.fuelType]}
                      </span>
                    )}
                  </div>

                  {f.km && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                      {f.km.toLocaleString('fr-FR')} km
                    </p>
                  )}
                </div>

                {/* Right side */}
                <div className="flex flex-col items-end justify-between flex-shrink-0">
                  <p
                    className="text-xl font-bold"
                    style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-content)' }}
                  >
                    {formatCurrency(f.totalCost)}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => setEditingId(f.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: 'var(--color-surface-2)' }}
                    >
                      <Pencil size={13} style={{ color: 'var(--color-muted)' }} />
                    </button>
                    <button
                      onClick={() => setDeletingId(f.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(255,53,53,0.1)' }}
                    >
                      <Trash2 size={13} style={{ color: 'var(--color-alert)' }} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
