import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAppShellContext } from '../hooks/useAppShellContext';
import { useAuth } from '../contexts/AuthContext';
import { TEST_CASE_TYPES } from '../types';

interface Greeting { text: string; emoji: string }

const GREETING_POOL: Record<'pagi' | 'siang' | 'sore' | 'malam', Greeting[]> = {
  pagi: [
    { text: 'Pagi', emoji: '☀️' },
    { text: 'Met pagi', emoji: '🌤️' },
    { text: 'Udah melek aja nih', emoji: '👀' },
    { text: 'Rajin amat pagi-pagi udah OL', emoji: '⚡' },
    { text: 'Semangat pagi', emoji: '💪' },
    { text: 'Pagi cerah, semoga hari ini zero bug', emoji: '🐛' },
  ],
  siang: [
    { text: 'Siang', emoji: '☀️' },
    { text: 'Met siang', emoji: '🍚' },
    { text: 'Udah makan siang belum nih', emoji: '🍜' },
    { text: 'Siang bolong masih strong', emoji: '🔥' },
    { text: 'Jangan ngantuk dulu ya', emoji: '😴' },
    { text: 'Semoga test case hari ini lancar jaya', emoji: '✅' },
  ],
  sore: [
    { text: 'Sore', emoji: '🌇' },
    { text: 'Met sore', emoji: '🍵' },
    { text: 'Udah mulai capek ya', emoji: '🥱' },
    { text: 'Sore-sore gini masih on fire', emoji: '🔥' },
    { text: 'Bentar lagi pulang, semangat!', emoji: '🚶' },
    { text: 'Semoga nggak ada bug numpuk sore-sore', emoji: '🐞' },
  ],
  malam: [
    { text: 'Malam', emoji: '🌙' },
    { text: 'Met malam', emoji: '🌃' },
    { text: 'Begadang lagi nih', emoji: '🦉' },
    { text: 'Kerja mulu, jangan lupa istirahat', emoji: '😌' },
    { text: 'Malam-malam masih semangat', emoji: '✨' },
    { text: 'Semoga besok gak ada bug urgent', emoji: '🐛' },
  ],
};

function pickGreeting(): Greeting {
  const hour = new Date().getHours();
  const period: keyof typeof GREETING_POOL =
    hour < 10 ? 'pagi' : hour < 15 ? 'siang' : hour < 18 ? 'sore' : 'malam';
  const pool = GREETING_POOL[period];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Types ─────────────────────────────────────────────────────────────────
type ProjectStats = Awaited<ReturnType<typeof api.getProjectStats>>;
type GlobalStats  = Awaited<ReturnType<typeof api.getDashboardStats>>;

// ─── Chart types ─────────────────────────────────────────────────────────────
interface DonutSlice { label: string; value: number; color: string }

// ─── Stacked bar (horizontal, part-to-whole) ────────────────────────────────
function StackedBar({ segments, total }: {
  segments: DonutSlice[];
  total: number;
}) {
  if (total === 0) {
    return <div className="h-3 w-full rounded-full bg-gray-100" />;
  }
  return (
    <div className="flex w-full h-3 rounded-full overflow-hidden bg-gray-100 gap-[2px]">
      {segments.filter(s => s.value > 0).map(s => (
        <div
          key={s.label}
          className="h-full transition-all duration-500"
          style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
        />
      ))}
    </div>
  );
}

// ─── Radial progress ────────────────────────────────────────────────────────
function RadialProgress({ pct, color, size = 96, label }: {
  pct: number; color: string; size?: number; label: string;
}) {
  const stroke = 10;
  const r  = (size - stroke) / 2;
  const cx = size / 2;
  const c  = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        <circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${c - dash}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        <text
          x={cx} y={cx + 5}
          textAnchor="middle"
          fontSize={16}
          fontWeight="700"
          fill="#1e293b"
          style={{ transform: 'rotate(90deg)', transformOrigin: `${cx}px ${cx}px` }}
        >
          {pct}%
        </text>
      </svg>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────
type CardColor = 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'slate';
const CARD_COLORS: Record<CardColor, string> = {
  blue:   'bg-blue-50 text-blue-600',
  green:  'bg-emerald-50 text-emerald-600',
  red:    'bg-red-50 text-red-600',
  yellow: 'bg-amber-50 text-amber-600',
  purple: 'bg-violet-50 text-violet-600',
  slate:  'bg-slate-100 text-slate-500',
};

function StatCard({
  label, value, sub, icon, color = 'blue',
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; color?: CardColor;
}) {
  return (
    <div className="card p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${CARD_COLORS[color]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Legend row ─────────────────────────────────────────────────────────────
function LegendRow({ color, label, value, total }: {
  color: string; label: string; value: number; total: number;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs text-gray-600 flex-1 truncate">{label}</span>
      <span className="text-xs font-semibold text-gray-800 tabular-nums">{value}</span>
      <span className="text-xs text-gray-400 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}

// ─── Color maps ─────────────────────────────────────────────────────────────
const RESULT_COLORS: Record<string, string> = {
  'Not Tested': '#94a3b8',
  Passed:       '#10b981',
  Failed:       '#ef4444',
  Blocked:      '#f59e0b',
};
const AUTO_COLORS: Record<string, string> = {
  'Not Automated': '#cbd5e1',
  Generated:       '#3b82f6',
  Automated:       '#10b981',
};

// Fixed categorical hue order — color follows the type identity, never its
// rank/count, so a label keeps the same color regardless of sort order.
const TYPE_COLOR_PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

function buildTypeColorMap(byType: Record<string, number>): Record<string, string> {
  const known = TEST_CASE_TYPES as readonly string[];
  const extra = Object.keys(byType).filter(k => !known.includes(k)).sort();
  const order = [...known, ...extra];
  const map: Record<string, string> = {};
  order.forEach((label, i) => { map[label] = TYPE_COLOR_PALETTE[i % TYPE_COLOR_PALETTE.length]; });
  return map;
}

const ATTENTION_BADGE: Record<string, string> = {
  Failed:  'bg-red-100 text-red-700',
  Blocked: 'bg-amber-100 text-amber-700',
};

// ─── Skeleton loading state (mirrors the real content layout 1:1) ──────────
function Skel({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-md ${className}`} />;
}

function SkeletonStatCard() {
  return (
    <div className="card p-4 flex items-start gap-3">
      <Skel className="w-9 h-9 rounded-lg flex-shrink-0" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skel className="h-2.5 w-16" />
        <Skel className="h-5 w-12" />
        <Skel className="h-2 w-20" />
      </div>
    </div>
  );
}

function SkeletonAttentionCard() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <Skel className="h-3 w-28" />
        <Skel className="h-4 w-16 rounded-full" />
      </div>
      <div className="divide-y divide-gray-50">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
            <Skel className="h-4 w-12 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skel className="h-2.5 w-3/4" />
              <Skel className="h-2.5 w-1/2" />
            </div>
            <Skel className="h-2.5 w-10 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonLegendRow() {
  return (
    <div className="flex items-center gap-2">
      <Skel className="w-2.5 h-2.5 rounded-full flex-shrink-0" />
      <Skel className="h-2.5 flex-1" />
      <Skel className="h-2.5 w-6" />
      <Skel className="h-2.5 w-8" />
    </div>
  );
}

function SkeletonBarCard({ legendRows }: { legendRows: number }) {
  return (
    <div className="card p-5">
      <Skel className="h-3 w-28 mb-4" />
      <Skel className="h-3 w-full rounded-full" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: legendRows }).map((_, i) => <SkeletonLegendRow key={i} />)}
      </div>
    </div>
  );
}

function SkeletonCoverageCard() {
  return (
    <div className="card p-5 flex flex-col justify-between">
      <Skel className="h-3 w-20 mb-4" />
      <div className="flex justify-around items-center flex-1">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="skeleton rounded-full w-24 h-24" />
            <Skel className="h-2.5 w-14 mt-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

const SKELETON_BAR_WIDTHS = ['85%', '62%', '48%', '30%', '20%'];

function SkeletonRankedBarCard({ rows }: { rows: number }) {
  return (
    <div className="card p-5">
      <Skel className="h-3 w-32 mb-4" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i}>
            <div className="flex items-center justify-between mb-1">
              <Skel className="h-2.5 w-24" />
              <Skel className="h-2.5 w-6" />
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="skeleton h-full rounded-full" style={{ width: SKELETON_BAR_WIDTHS[i % SKELETON_BAR_WIDTHS.length] }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonProjectListCard() {
  return (
    <div className="card p-5">
      <Skel className="h-3 w-28 mb-4" />
      <div className="divide-y divide-gray-50">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <Skel className="h-2.5 w-4 flex-shrink-0" />
            <Skel className="h-2.5 flex-1" />
            <Skel className="h-2.5 w-16 flex-shrink-0" />
            <Skel className="h-2.5 w-10 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonRecentSetsCard() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <Skel className="h-3 w-28" />
        <Skel className="h-2.5 w-16" />
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
            <Skel className="w-8 h-8 rounded-lg flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skel className="h-2.5 w-2/3" />
              <Skel className="h-2.5 w-1/3" />
            </div>
            <Skel className="h-2.5 w-10 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonQuickAction() {
  return (
    <div className="card p-4 border border-gray-100">
      <Skel className="w-4 h-4 mb-2" />
      <Skel className="h-2.5 w-24 mb-1.5" />
      <Skel className="h-2.5 w-32" />
    </div>
  );
}

function DashboardSkeleton({ isAll }: { isAll: boolean }) {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonStatCard key={i} />)}
      </div>

      <SkeletonAttentionCard />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SkeletonBarCard legendRows={4} />
        <SkeletonBarCard legendRows={3} />
        <SkeletonCoverageCard />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SkeletonRankedBarCard rows={4} />
        <SkeletonRankedBarCard rows={4} />
      </div>

      {isAll ? (
        <SkeletonProjectListCard />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkeletonRankedBarCard rows={4} />
          <SkeletonRecentSetsCard />
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => <SkeletonQuickAction key={i} />)}
      </div>
    </>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

// sentinel value untuk "semua project"
const ALL_PROJECTS = '__all__';

export function DashboardPage() {
  const { projects, activeProjectId } = useAppShellContext();
  const { session } = useAuth();
  const navigate = useNavigate();

  const displayName = (session?.user.user_metadata?.full_name as string | undefined) || session?.user.email?.split('@')[0];
  const [greeting] = useState<Greeting>(pickGreeting);

  // default: 'all' — semua project
  const [selectedView, setSelectedView] = useState<string>(ALL_PROJECTS);

  const [projectStats, setProjectStats] = useState<ProjectStats | null>(null);
  const [globalStats,  setGlobalStats]  = useState<GlobalStats  | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const isAll = selectedView === ALL_PROJECTS;

  const goTo = (p: 'generate' | 'test-cases' | 'automation') => {
    const id = !isAll ? selectedView : activeProjectId;
    const proj = projects.find(pr => pr.id === id);
    if (proj) navigate(`/projects/${proj.slug}/${p}`);
  };

  const loadProject = useCallback(async (id: string) => {
    setLoading(true); setError(''); setProjectStats(null);
    try { setProjectStats(await api.getProjectStats(id)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  const loadGlobal = useCallback(async () => {
    setLoading(true); setError(''); setGlobalStats(null);
    try { setGlobalStats(await api.getDashboardStats()); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  // Load saat selectedView berubah
  useEffect(() => {
    if (isAll) loadGlobal();
    else loadProject(selectedView);
  }, [selectedView, isAll, loadGlobal, loadProject]);

  const handleRefresh = () => {
    if (isAll) loadGlobal();
    else loadProject(selectedView);
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const byResult = isAll
    ? (globalStats?.byTestingResult  ?? {})
    : (projectStats?.byTestingResult ?? {});

  const byAuto = isAll
    ? (globalStats?.byAutomationStatus  ?? {})
    : (projectStats?.byAutomationStatus ?? {});

  const total = isAll
    ? (globalStats?.overview.totalTestCases ?? 0)
    : (projectStats?.stats.totalTestCases   ?? 0);

  const automationCoverage = isAll
    ? (globalStats?.overview.automationCoverage  ?? 0)
    : (projectStats?.stats.automationCoverage ?? 0);

  const passRate = isAll ? 0 : (projectStats?.stats.passRate ?? 0);

  const topFeatures = projectStats?.topFeatures ?? [];
  const recentSets  = projectStats?.recentSets  ?? [];
  const maxFeature  = Math.max(...topFeatures.map(f => f.count), 1);

  const globalProjectList = globalStats?.projects ?? [];

  const resultSlices: DonutSlice[] = [
    { label: 'Not Tested', value: byResult['Not Tested'] ?? 0, color: RESULT_COLORS['Not Tested'] },
    { label: 'Passed',     value: byResult['Passed']     ?? 0, color: RESULT_COLORS['Passed']     },
    { label: 'Failed',     value: byResult['Failed']     ?? 0, color: RESULT_COLORS['Failed']     },
    { label: 'Blocked',    value: byResult['Blocked']    ?? 0, color: RESULT_COLORS['Blocked']    },
  ];
  const autoSlices: DonutSlice[] = [
    { label: 'Not Automated', value: byAuto['Not Automated'] ?? 0, color: AUTO_COLORS['Not Automated'] },
    { label: 'Generated',     value: byAuto['Generated']     ?? 0, color: AUTO_COLORS['Generated']     },
    { label: 'Automated',     value: byAuto['Automated']     ?? 0, color: AUTO_COLORS['Automated']     },
  ];

  const byType = isAll ? (globalStats?.byType ?? {}) : (projectStats?.byType ?? {});
  const typeColorMap = buildTypeColorMap(byType);
  const typeBars: DonutSlice[] = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value, color: typeColorMap[label] }));
  const maxTypeCount = Math.max(...typeBars.map(t => t.value), 1);

  const byTester = isAll ? (globalStats?.byTester ?? []) : (projectStats?.byTester ?? []);
  const maxTesterCount = Math.max(...byTester.map(t => t.count), 1);

  const attention = isAll ? (globalStats?.attention ?? []) : (projectStats?.attention ?? []);

  const hasData = isAll ? !!globalStats : !!projectStats;

  // label yang tampil di header
  const viewLabel = isAll
    ? 'Semua Project'
    : (projects.find(p => p.id === selectedView)?.name ?? '—');

  return (
    <div className="space-y-5">

      {/* ── Greeting ── */}
      {displayName && (
        <p className="text-sm text-gray-500">
          {greeting.text}, <span className="font-semibold text-gray-700">{displayName}</span> {greeting.emoji}
        </p>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Dashboard</h2>
          <p className="text-xs text-gray-500 mt-0.5">{viewLabel}</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Dropdown view selector */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <select
              value={selectedView}
              onChange={e => setSelectedView(e.target.value)}
              className="pl-8 pr-8 py-1.5 text-xs font-medium border border-gray-200 rounded-lg bg-white text-gray-700
                         focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400
                         appearance-none cursor-pointer shadow-sm"
            >
              <option value={ALL_PROJECTS}>Semua Project</option>
              {projects.length > 0 && (
                <optgroup label="─── Per Project">
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
              <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 flex items-center gap-1.5 shadow-sm"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="card p-4 text-sm text-red-600 border border-red-200 bg-red-50">{error}</div>
      )}

      {/* ── Loading skeleton (mirrors the real content layout) ── */}
      {loading && <DashboardSkeleton isAll={isAll} />}

      {/* ── Content ── */}
      {!loading && hasData && (
        <>
          {/* ── Stat Cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Total Test Cases"
              value={total.toLocaleString()}
              sub={isAll
                ? `${globalStats?.overview.totalFeatures ?? 0} fitur`
                : `${projectStats?.stats.totalFeatures ?? 0} fitur`}
              color="blue"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
            />
            <StatCard
              label="Passed"
              value={byResult['Passed'] ?? 0}
              sub={total > 0 ? `${Math.round(((byResult['Passed'] ?? 0) / total) * 100)}% pass rate` : '–'}
              color="green"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              }
            />
            <StatCard
              label="Failed"
              value={byResult['Failed'] ?? 0}
              sub={(byResult['Blocked'] ?? 0) > 0 ? `+${byResult['Blocked']} blocked` : 'no blocked'}
              color="red"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              }
            />
            {isAll ? (
              <StatCard
                label="Total Projects"
                value={globalStats?.overview.totalProjects ?? 0}
                sub={`${globalStats?.overview.totalScripts ?? 0} scripts`}
                color="purple"
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                }
              />
            ) : (
              <StatCard
                label="Test Sets"
                value={projectStats?.stats.totalTestSets ?? 0}
                sub={`${projectStats?.stats.totalScripts ?? 0} scripts`}
                color="purple"
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                }
              />
            )}
          </div>

          {/* ── Perlu Perhatian: Failed/Blocked test cases ── */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Perlu Perhatian</h3>
              {attention.length > 0 && (
                <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">
                  {attention.length} issue{attention.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {attention.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">🎉 Tidak ada test case Failed/Blocked</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {attention.map(a => (
                  <div key={a.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${ATTENTION_BADGE[a.testingResult] || 'bg-gray-100 text-gray-600'}`}>
                      {a.testingResult}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">
                        <span className="font-mono text-blue-600">{a.testCaseId}</span> · {a.testScenario}
                        {isAll && a.projectName && <span className="text-gray-400"> · {a.projectName}</span>}
                      </p>
                      {a.bugNote && <p className="text-xs text-gray-400 truncate mt-0.5">🐛 {a.bugNote}</p>}
                    </div>
                    {a.testBy && (
                      <span className="text-xs text-gray-400 flex-shrink-0">{a.testBy}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Charts row ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Testing Result stacked bar */}
            <div className="card p-5">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Testing Result</h3>
              <StackedBar segments={resultSlices} total={total} />
              <div className="mt-4 space-y-2">
                {resultSlices.map(s => (
                  <LegendRow key={s.label} color={s.color} label={s.label} value={s.value} total={total} />
                ))}
              </div>
            </div>

            {/* Automation status stacked bar */}
            <div className="card p-5">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Automation Status</h3>
              <StackedBar segments={autoSlices} total={total} />
              <div className="mt-4 space-y-2">
                {autoSlices.map(s => (
                  <LegendRow key={s.label} color={s.color} label={s.label} value={s.value} total={total} />
                ))}
              </div>
            </div>

            {/* Coverage radials */}
            <div className="card p-5 flex flex-col justify-between">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Coverage</h3>
              <div className="flex justify-around items-center flex-1">
                <RadialProgress pct={automationCoverage} color="#3b82f6" size={96} label="Automation" />
                {!isAll && (
                  <RadialProgress pct={passRate} color="#10b981" size={96} label="Pass Rate" />
                )}
              </div>
              {total === 0 && (
                <p className="text-xs text-gray-400 text-center mt-3">Belum ada test case</p>
              )}
            </div>
          </div>

          {/* ── By Type + Tester Workload ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* By Type ranked bar list */}
            <div className="card p-5">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Test Case by Type</h3>
              {typeBars.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">Belum ada data</p>
              ) : (
                <div className="space-y-3">
                  {typeBars.map(t => (
                    <div key={t.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                          <span className="text-xs text-gray-600 truncate">{t.label}</span>
                        </span>
                        <span className="text-xs font-semibold text-gray-800 tabular-nums flex-shrink-0">{t.value}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${(t.value / maxTypeCount) * 100}%`, backgroundColor: t.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tester workload */}
            <div className="card p-5">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Tester Workload</h3>
              {byTester.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">Belum ada test case yang di-test</p>
              ) : (
                <div className="space-y-3">
                  {byTester.map(t => (
                    <div key={t.tester}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-600 truncate max-w-[70%]">{t.tester}</span>
                        <span className="text-xs font-semibold text-gray-800 tabular-nums">{t.count}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-500"
                          style={{ width: `${(t.count / maxTesterCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Semua Project: tabel daftar project ── */}
          {isAll && (
            <div className="card p-5">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Semua Project</h3>
              {globalProjectList.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">Belum ada project</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {globalProjectList.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="text-xs text-gray-300 tabular-nums w-5 text-right flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{p.name}</p>
                      </div>
                      <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">
                        {p.testSets} test set{p.testSets !== 1 ? 's' : ''}
                      </span>
                      <button
                        onClick={() => setSelectedView(p.id)}
                        className="text-xs text-blue-500 hover:text-blue-700 flex-shrink-0"
                      >
                        Lihat →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Per Project: features + recent sets ── */}
          {!isAll && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Top features */}
              <div className="card p-5">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Test Cases per Fitur</h3>
                {topFeatures.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6">Belum ada data fitur</p>
                ) : (
                  <div className="space-y-3">
                    {topFeatures.map(f => (
                      <div key={f.feature}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-600 truncate max-w-[70%]">{f.feature}</span>
                          <span className="text-xs font-semibold text-gray-800 tabular-nums">{f.count}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-500"
                            style={{ width: `${(f.count / maxFeature) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent test sets */}
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent Test Sets</h3>
                  <button onClick={() => goTo('generate')} className="text-xs text-blue-600 hover:text-blue-800">
                    + Generate
                  </button>
                </div>
                {recentSets.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-xs text-gray-400">Belum ada test case yang digenerate</p>
                    <button
                      onClick={() => goTo('generate')}
                      className="mt-3 text-xs text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50"
                    >
                      Generate sekarang
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {recentSets.map(s => (
                      <div key={s.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate">{s.feature}</p>
                          <p className="text-xs text-gray-400">
                            {s.count} test case{s.count !== 1 ? 's' : ''}
                            {s.testedBy ? ` · ${s.testedBy}` : ''}
                          </p>
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {new Date(s.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Quick actions ── */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: 'Generate Test Cases',
                sub: 'Buat test case baru dengan AI',
                color: 'text-blue-600 border-blue-200 hover:bg-blue-50',
                icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
                action: () => goTo('generate'),
              },
              {
                label: 'Lihat Test Cases',
                sub: 'Review & update hasil testing',
                color: 'text-gray-600 border-gray-200 hover:bg-gray-50',
                icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
                action: () => goTo('test-cases'),
              },
              {
                label: 'Automation Scripts',
                sub: 'Generate & kelola scripts',
                color: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50',
                icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>,
                action: () => goTo('automation'),
              },
            ].map(item => (
              <button
                key={item.label}
                onClick={item.action}
                className={`card p-4 text-left border transition-colors ${item.color}`}
              >
                <div className="mb-2">{item.icon}</div>
                <p className="text-xs font-semibold">{item.label}</p>
                <p className="text-xs opacity-70 mt-0.5">{item.sub}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
