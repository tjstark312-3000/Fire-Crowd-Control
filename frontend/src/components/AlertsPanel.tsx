import { AlertItem } from '../types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

const severityVariant: Record<AlertItem['severity'], 'warning' | 'danger'> = {
  warning: 'warning',
  critical: 'danger',
};

export function AlertsPanel({
  alerts,
  onDismiss,
  onClear,
  title = 'Alerts',
  limit = 12,
}: {
  alerts: AlertItem[];
  onDismiss: (id: string) => void;
  onClear?: () => void;
  title?: string;
  limit?: number;
}): JSX.Element {
  return (
    <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex items-center gap-2">
          <Badge variant="muted">{alerts.length}</Badge>
          {onClear && alerts.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {alerts.length === 0 && (
          <div className="rounded border border-dashed border-[hsl(var(--border))] px-3 py-5 text-center text-xs text-[hsl(var(--muted-foreground))]">
            No active alerts
          </div>
        )}

        {alerts.slice(0, limit).map((alert) => (
          <article key={alert.id} className="rounded border border-[hsl(var(--border))] p-2">
            <div className="mb-1 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{alert.camera_name}</p>
                <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{alert.message}</p>
              </div>
              <Badge variant={severityVariant[alert.severity]}>{alert.severity}</Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">{new Date(alert.ts).toLocaleString()}</p>
              <Button variant="ghost" size="sm" onClick={() => onDismiss(alert.id)}>
                Dismiss
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
