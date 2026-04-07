'use client'

import { useState } from 'react'
import type { LucideProps } from 'lucide-react'
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Droplets, Euro, Gauge } from 'lucide-react'
import type { FC } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/components/AppContext'
import {
  filterByPeriod,
  totalCost,
  totalLiters,
  averagePricePerLiter,
  averageFillUpCost,
  consumptionPer100km,
  getLast6Months,
  groupByMonth,
  formatCurrency,
  formatLiters,
  formatMonthLabel,
  priceEvolution,
} from '@/lib/calculations'
import { Period, PERIOD_LABELS } from '@/lib/types'

const PERIODS: Period[] = ['week', 'month', 'year', 'all']

function BarChart({ data }: { data: { label: string; value: number; highlight?: boolean }[] }) {
  const max = Math.max(...data.map((d) => d.value), 0.01)
  const barHeight = 28
  const gap = 10
  const labelHeight = 18
  const totalHeight = data.length * (barHeight + gap) + labelHeight
  const W = 100 // percentage

  return (
    <div className="space-y-2 pt-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span
            className="text-xs w-8 text-right flex-shrink-0"
            style={{ color: 'var(--color-muted)', fontFamily: 'var(--font-condensed)' }}
          >
            {d.label}
          </span>
          <div className="flex-1 relative h-7 flex items-center">
            <div
              className="absolute inset-y-0 left-0 right-0 rounded"
              style={{ backgroundColor: 'var(--color-surface-2)' }}
            />
            <div
              className="absolute inset-y-1 left-0 rounded chart-bar"
              style={{
                width: `${(d.value / max) * 100}%`,
                backgroundColor: d.highlight ? 'var(--color-accent)' : 'rgba(255,85,0,0.45)',
                animationDelay: `${i * 0.07}s`,
                filter: d.highlight ? 'drop-shadow(0 0 6px rgba(255,85,0,0.4))' : 'none',
              }}
            />
          </div>
          <span
            className="text-sm font-bold flex-shrink-0 w-16 text-right"
            style={{
              fontFamily: 'var(--font-condensed)',
              color: d.highlight ? 'var(--color-accent)' : 'var(--color-content)',
            }}
          >
            {d.value > 0 ? formatCurrency(d.value) : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

function LineChart({ points }: { points: { label: string; value: number }[] }) {
  if (points.length < 2) return null

  const W = 280
  const H = 80
  const pad = 8
  const vals = points.map((p) => p.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 0.01

  const coords = points.map((p, i) => ({
    x: pad + (i / (points.length - 1)) * (W - pad * 2),
    y: H - pad - ((p.value - min) / range) * (H - pad * 2),
  }))

  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')
  const areaD = `${pathD} L ${coords[coords.length - 1].x} ${H} L ${coords[0].x} ${H} Z`

  return (
    <div className="overflow-x-auto -mx-1">
      <div style={{ minWidth: 260 }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H + 24}`} className="overflow-visible">
          {/* Grid lines */}
          {[0, 0.5, 1].map((t) => (
            <line
              key={t}
              x1={pad}
              y1={H - pad - t * (H - pad * 2)}
              x2={W - pad}
              y2={H - pad - t * (H - pad * 2)}
              stroke="var(--color-surface-2)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          ))}

          {/* Area fill */}
          <path d={areaD} fill="url(#lineGradient)" />
          <defs>
            <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Line */}
          <path
            d={pathD}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Dots */}
          {coords.map((c, i) => (
            <g key={i}>
              <circle cx={c.x} cy={c.y} r="4" fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth="2" />
              {/* Labels */}
              <text
                x={c.x}
                y={H + 16}
                textAnchor="middle"
                fontSize="9"
                fill="var(--color-muted)"
                fontFamily="var(--font-condensed)"
              >
                {points[i].label}
              </text>
            </g>
          ))}

          {/* Y labels */}
          <text x={pad - 2} y={pad + 4} textAnchor="end" fontSize="8" fill="var(--color-muted)" fontFamily="var(--font-condensed)">
            {max.toFixed(3)}
          </text>
          <text x={pad - 2} y={H - pad + 4} textAnchor="end" fontSize="8" fill="var(--color-muted)" fontFamily="var(--font-condensed)">
            {min.toFixed(3)}
          </text>
        </svg>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
}: {
  label: string
  value: string
  sub?: string
  color: string
  icon: FC<LucideProps>
}) {
  return (
    <div className="card p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--color-muted)' }}>
          {label}
        </span>
        <Icon size={14} style={{ color }} />
      </div>
      <p className="text-2xl font-bold leading-tight" style={{ fontFamily: 'var(--font-condensed)', color }}>
        {value}
      </p>
      {sub && (
        <p className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
          {sub}
        </p>
      )}
    </div>
  )
}

export default function StatsPage() {
  const router = useRouter()
  const { fillUps } = useApp()
  const [period, setPeriod] = useState<Period>('year')

  const filtered = filterByPeriod(fillUps, period)
  const cost = totalCost(filtered)
  const liters = totalLiters(filtered)
  const avgPrice = averagePricePerLiter(filtered)
  const avgFillCost = averageFillUpCost(filtered)
  const conso = consumptionPer100km(fillUps)
  const evolution = priceEvolution(filtered)

  const last6 = getLast6Months()
  const grouped = groupByMonth(fillUps)
  const currentMonth = new Date().toISOString().slice(0, 7)

  const barData = last6.map((m) => ({
    label: formatMonthLabel(m),
    value: totalCost(grouped[m] || []),
    highlight: m === currentMonth,
  }))

  const pricePoints = last6
    .map((m) => ({
      label: formatMonthLabel(m),
      value: averagePricePerLiter(grouped[m] || []),
    }))
    .filter((p) => p.value > 0)

  const EvoIcon = evolution === null ? Minus : evolution > 0 ? TrendingUp : TrendingDown
  const evoColor = evolution === null ? 'var(--color-muted)' : evolution > 0 ? 'var(--color-alert)' : 'var(--color-positive)'

  return (
    <div className="px-4 pt-12 pb-4 page-enter">
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
            className="text-2xl font-bold uppercase tracking-wide"
            style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-content)' }}
          >
            Statistiques
          </h1>
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            {filtered.length} plein{filtered.length !== 1 ? 's' : ''} analysé{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Period tabs */}
      <div
        className="flex rounded-xl p-1 mb-5"
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

      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <p style={{ color: 'var(--color-muted)' }}>Aucune donnée pour cette période</p>
        </div>
      ) : (
        <>
          {/* Hero total */}
          <div
            className="card card-accent p-5 mb-4"
            style={{
              background: `linear-gradient(135deg, var(--color-surface) 50%, rgba(255,85,0,0.07) 100%)`,
            }}
          >
            <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>
              Total dépensé
            </p>
            <p
              className="text-6xl font-bold leading-none"
              style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-accent)' }}
            >
              {formatCurrency(cost)}
            </p>
            <div className="flex items-center gap-4 mt-3">
              <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
                {formatLiters(liters)} au total
              </span>
              {evolution !== null && (
                <div className="flex items-center gap-1">
                  <EvoIcon size={14} style={{ color: evoColor }} />
                  <span className="text-xs font-semibold" style={{ color: evoColor }}>
                    {evolution > 0 ? '+' : ''}{evolution.toFixed(1)}% prix/L
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Grid métriques */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <StatCard
              label="Moy. plein"
              value={formatCurrency(avgFillCost)}
              sub={`${filtered.length} pleins`}
              color="var(--color-content)"
              icon={Euro}
            />
            <StatCard
              label="Prix moyen/L"
              value={`${avgPrice.toFixed(3)} €`}
              color="var(--color-info)"
              icon={Droplets}
            />
            <StatCard
              label="Volume total"
              value={liters.toFixed(0) + ' L'}
              sub={formatLiters(liters / Math.max(filtered.length, 1)) + '/plein'}
              color="var(--color-positive)"
              icon={Gauge}
            />
            {conso !== null ? (
              <StatCard
                label="Consommation"
                value={`${conso.toFixed(1)} L`}
                sub="aux 100 km"
                color="var(--color-accent)"
                icon={TrendingUp}
              />
            ) : (
              <div className="card p-4 flex items-center justify-center">
                <p className="text-xs text-center" style={{ color: 'var(--color-muted)' }}>
                  Ajoutez le km pour voir la conso
                </p>
              </div>
            )}
          </div>

          {/* Chart : dépenses mensuelles */}
          <div className="card p-5 mb-4">
            <p
              className="text-sm font-bold uppercase tracking-widest mb-4"
              style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-content)' }}
            >
              Dépenses — 6 mois
            </p>
            <BarChart data={barData} />
          </div>

          {/* Chart : évolution prix/L */}
          {pricePoints.length >= 2 && (
            <div className="card p-5 mb-4">
              <div className="flex items-center justify-between mb-4">
                <p
                  className="text-sm font-bold uppercase tracking-widest"
                  style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-content)' }}
                >
                  Prix / Litre
                </p>
                <span
                  className="text-xs px-2 py-1 rounded-lg"
                  style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-muted)' }}
                >
                  €/L
                </span>
              </div>
              <LineChart points={pricePoints} />
            </div>
          )}

          {/* Détail par plein */}
          <div className="card p-5">
            <p
              className="text-sm font-bold uppercase tracking-widest mb-4"
              style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-content)' }}
            >
              Détail
            </p>
            <div className="space-y-3">
              {[
                { label: 'Coût total', value: formatCurrency(cost), color: 'var(--color-accent)' },
                { label: 'Volume total', value: formatLiters(liters), color: 'var(--color-positive)' },
                { label: 'Prix moyen', value: `${avgPrice.toFixed(3)} €/L`, color: 'var(--color-info)' },
                { label: 'Coût moy. plein', value: formatCurrency(avgFillCost), color: 'var(--color-content)' },
                { label: 'Volume moy. plein', value: formatLiters(liters / Math.max(filtered.length, 1)), color: 'var(--color-content)' },
                ...(conso !== null ? [{ label: 'Conso. moyenne', value: `${conso.toFixed(1)} L/100km`, color: 'var(--color-accent)' }] : []),
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
                    {row.label}
                  </span>
                  <span
                    className="text-sm font-bold"
                    style={{ fontFamily: 'var(--font-condensed)', color: row.color }}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
