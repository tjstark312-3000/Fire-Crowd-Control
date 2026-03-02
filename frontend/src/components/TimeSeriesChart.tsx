import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { CountPoint } from '../types';

export function TimeSeriesChart({ points }: { points: CountPoint[] }): JSX.Element {
  const data = points.map((point) => ({
    ts: new Date(point.ts).toLocaleTimeString(),
    value: Number(point.crowd_count.toFixed(2)),
  }));

  if (data.length < 2) {
    return (
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">15-Min Crowd Trend</h3>
        <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">Waiting for analytics data points...</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">15-Min Crowd Trend</h3>
      <div className="h-64 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--panel-2))] p-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
            <defs>
              <linearGradient id="crowdGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.35} />
                <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" />
            <XAxis dataKey="ts" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} minTickGap={22} />
            <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} width={46} />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--panel))',
                border: '1px solid hsl(var(--border))',
                color: 'hsl(var(--foreground))',
              }}
            />
            <Area type="monotone" dataKey="value" stroke="hsl(var(--accent))" strokeWidth={2.2} fill="url(#crowdGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
