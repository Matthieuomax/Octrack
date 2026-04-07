'use client'

import Link from 'next/link'
import { Settings, Plus, TrendingUp, TrendingDown, Fuel, Calendar } from 'lucide-react'
import { useApp } from '@/components/AppContext'
import {
  filterByPeriod,
  totalCost,
  totalLiters,
  averagePricePerLiter,
  formatCurrency,
  formatDateShort,
  formatLiters,
  formatPricePerLiter,
  getLast6Months,
  groupByMonth,
  formatMonthLabel,
} from '@/lib/calculations'
import { FUEL_TYPE_LABELS } from '@/lib/types'

function ArcGauge({ percent }: { percent: number }) {
  const R = 52
  const cx = 70
  const cy =55
  const startAngle = -120
  const endAngle = 120
  const totalArc = endAngle - startAngle

  function polarToCartesian(angle: number) {
    const rad = ((angle - 90) * Math.PI) / 180
    return {
      x: cx + R * Math.cos(rad),
      y: cy + R * Math.sin(rad),
    }
  }

  function arcPath(from: number, to: number) {
    const s = polarToCartesian(from)
    const e = polarToCartesian(to)
    const large = to - from > 180 ? 1 : 0
    return `M ${s.x} ${s.y} A ${R} ${R} 0 ${large} 1 ${e.x} ${e.y}`
  }

  const fillAngle = startAngle + totalArc * Math.min(percent, 1)

  const color =
    percent < 0.2
      ? 'var(--color-alert)'
      : percent < 0.5
        ? 'var(--color-info)'
        : 'var(--color-accent)'

  return (
    <svg width="140" height="90" viewBox="0 0 140 90" className="overflow-visible">
      {/* Track */}
      <path
        d={arcPath(startAngle, endAngle)}
        fill="none"
        stroke="var(--color-surface-2)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {/* Fill */}
      <path
        d={arcPath(startAngle, fillAngle)}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        style={{
          filter: `drop-shadow(0 0 6px ${color})`,
        }}
      />
      {/* Ticks */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const a = startAngle + totalArc * t
        const inner = polarToCartesian(a)
        const outer = {
          x: cx + (R + 10) * Math.cos(((a - 90) * Math.PI) / 180),
          y: cy + (R + 10) * Math.sin(((a - 90) * Math.PI) / 180),
        }
        return (
          <line
            key={t}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            stroke="var(--color-muted)"
            strokeWidth="1.5"
            opacity="0.4"
          />
        )
      })}
      {/* Center label */}
      <text
        x={cx}
        y={cy - 2}
        textAnchor="middle"
        fontSize="20"
        fontWeight="700"
        fontFamily="var(--font-condensed)"
        fill="var(--color-content)"
      >
        {Math.round(percent * 100)}%
      </text>
      <text
        x={cx}
        y={cy + 14}
        textAnchor="middle"
        fontSize="10"
        fontFamily="var(--font-sans)"
        fill="var(--color-muted)"
      >
        RÉSERVOIR
      </text>
      {/* Labels */}
      <text x="35" y="95" fontSize="9" fill="var(--color-muted)" fontFamily="var(--font-sans)">0</text>
      <text x="105" y="95" fontSize="9" fill="var(--color-muted)" fontFamily="var(--font-sans)" textAnchor="end">FULL</text>
    </svg>
  )
}

function MiniSparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const W = 80
  const H = 28
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W
    const y = H - ((v - min) / range) * H
    return `${x},${y}`
  })
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={parseFloat(points[points.length - 1].split(',')[0])}
        cy={parseFloat(points[points.length - 1].split(',')[1])}
        r="3"
        fill="var(--color-accent)"
      />
    </svg>
  )
}

export default function DashboardPage() {
  const { fillUps, settings } = useApp()

  const thisMonth = filterByPeriod(fillUps, 'month')
  const thisYear = filterByPeriod(fillUps, 'year')
  const lastFillUp = fillUps[0]

  const monthCost = totalCost(thisMonth)
  const yearCost = totalCost(thisYear)
  const yearLiters = totalLiters(thisYear)
  const avgPrice = averagePricePerLiter(thisYear)

  const tankPercent = lastFillUp ? Math.min(lastFillUp.liters / settings.tankCapacity, 1) : 0

  const last6 = getLast6Months()
  const grouped = groupByMonth(fillUps)
  const monthlyData = last6.map((m) => ({
    label: formatMonthLabel(m),
    cost: totalCost(grouped[m] || []),
  }))
  const sparkValues = monthlyData.map((d) => d.cost)

  const today = new Date()
  const dateLabel = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(today)

  const carLabel =
    settings.carBrand && settings.carModel
      ? `${settings.carBrand} ${settings.carModel}`
      : 'Mon véhicule'

  return (
    <div className="px-4 pt-12 page-enter">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 animate-slide-up delay-1">
        <div>
          <h1
            className="text-4xl font-bold tracking-widest uppercase"
            style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-accent)' }}
          >
            OCTRACK
          </h1>
          <p className="text-xs mt-0.5 capitalize" style={{ color: 'var(--color-muted)' }}>
            {dateLabel}
          </p>
        </div>
        <Link
          href="/settings"
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-surface)' }}
        >
          <Settings size={18} style={{ color: 'var(--color-muted)' }} />
        </Link>
      </div>

      {/* Hero — dépenses du mois */}
      <div
        className="card card-accent p-5 mb-4 animate-slide-up delay-2"
        style={{
          background: `linear-gradient(135deg, var(--color-surface) 60%, rgba(255,85,0,0.06) 100%)`,
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>
              Ce mois
            </p>
            <p
              className="text-5xl font-bold leading-none"
              style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-accent)' }}
            >
              {formatCurrency(monthCost)}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
              {thisMonth.length} plein{thisMonth.length !== 1 ? 's' : ''} — {formatLiters(totalLiters(thisMonth))}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <MiniSparkline values={sparkValues} />
            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
              6 mois
            </span>
          </div>
        </div>

        {/* Barre de progression mensuelle */}
        {monthCost > 0 && yearCost > 0 && (
          <div className="mt-4">
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--color-surface-2)' }}
            >
              <div
                className="h-full rounded-full chart-bar"
                style={{
                  width: `${Math.min((monthCost / (yearCost / 12)) * 100, 100)}%`,
                  backgroundColor: 'var(--color-accent)',
                }}
              />
            </div>
            <p className="text-xs mt-1.5" style={{ color: 'var(--color-muted)' }}>
              vs moy. mensuelle {formatCurrency(yearCost / 12)}
            </p>
          </div>
        )}
      </div>

      {/* Grille stats */}
      <div className="grid grid-cols-3 gap-3 mb-4 animate-slide-up delay-3">
        <div className="card p-3 text-center">
          <p
            className="text-xl font-bold"
            style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-info)' }}
          >
            {formatCurrency(yearCost)}
          </p>
          <p className="text-[10px] uppercase tracking-wide mt-0.5" style={{ color: 'var(--color-muted)' }}>
            Cette année
          </p>
        </div>
        <div className="card p-3 text-center">
          <p
            className="text-xl font-bold"
            style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-positive)' }}
          >
            {yearLiters.toFixed(0)} L
          </p>
          <p className="text-[10px] uppercase tracking-wide mt-0.5" style={{ color: 'var(--color-muted)' }}>
            Total litres
          </p>
        </div>
        <div className="card p-3 text-center">
          <p
            className="text-xl font-bold"
            style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-content)' }}
          >
            {avgPrice.toFixed(3)}€
          </p>
          <p className="text-[10px] uppercase tracking-wide mt-0.5" style={{ color: 'var(--color-muted)' }}>
            Moy /L
          </p>
        </div>
      </div>

      {/* Gauge + véhicule */}
      <div className="card p-4 mb-4 flex items-center gap-4 animate-slide-up delay-4">
        <ArcGauge percent={tankPercent} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Fuel size={14} style={{ color: 'var(--color-accent)' }} />
            <span className="text-xs font-medium truncate" style={{ color: 'var(--color-muted)' }}>
              {carLabel}
            </span>
          </div>
          {lastFillUp ? (
            <>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-content)' }}>
                Dernier plein
              </p>
              <p
                className="text-2xl font-bold leading-tight"
                style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-content)' }}
              >
                {formatLiters(lastFillUp.liters)}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                {formatPricePerLiter(lastFillUp.pricePerLiter)} — {formatDateShort(lastFillUp.date)}
              </p>
              {lastFillUp.station && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                  {lastFillUp.station}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              Aucun plein enregistré
            </p>
          )}
        </div>
      </div>

      {/* Historique récent */}
      <div className="animate-slide-up delay-5">
        <div className="flex items-center justify-between mb-3">
          <h2
            className="text-lg font-bold uppercase tracking-wide"
            style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-content)' }}
          >
            Récents
          </h2>
          <Link
            href="/history"
            className="text-xs font-medium"
            style={{ color: 'var(--color-accent)' }}
          >
            Voir tout
          </Link>
        </div>

        {fillUps.length === 0 ? (
          <div className="card p-8 text-center">
            <Fuel size={32} className="mx-auto mb-3" style={{ color: 'var(--color-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              Aucun plein enregistré
            </p>
            <Link href="/add" className="btn-primary mt-4 block text-center" style={{ display: 'block' }}>
              Premier plein
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {fillUps.slice(0, 4).map((f, i) => (
              <div
                key={f.id}
                className="card p-4 flex items-center gap-3"
                style={{
                  animationDelay: `${0.28 + i * 0.06}s`,
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'var(--color-surface-2)' }}
                >
                  <Calendar size={16} style={{ color: 'var(--color-accent)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-base font-bold leading-tight truncate"
                    style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-content)' }}
                  >
                    {formatLiters(f.liters)}
                    <span className="font-normal text-sm ml-1" style={{ color: 'var(--color-muted)' }}>
                      à {f.pricePerLiter.toFixed(3)} €/L
                    </span>
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                    {formatDateShort(f.date)}{f.station ? ` · ${f.station}` : ''}
                  </p>
                </div>
                <p
                  className="text-lg font-bold flex-shrink-0"
                  style={{ fontFamily: 'var(--font-condensed)', color: 'var(--color-content)' }}
                >
                  {formatCurrency(f.totalCost)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FAB si vide */}
      {fillUps.length === 0 && (
        <Link
          href="/add"
          className="fixed bottom-24 right-5 w-14 h-14 rounded-full flex items-center justify-center glow-accent animate-pulse-accent"
          style={{ backgroundColor: 'var(--color-accent)', zIndex: 40 }}
        >
          <Plus size={26} color="white" />
        </Link>
      )}
    </div>
  )
}
