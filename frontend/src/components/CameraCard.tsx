import { Link } from 'react-router-dom';

import { Camera } from '../types';
import { StatusBadge } from './StatusBadge';

function metric(label: string, value: string): JSX.Element {
  return (
    <div className="kpi">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

export function CameraCard({ camera }: { camera: Camera }): JSX.Element {
  return (
    <Link to={`/camera/${camera.id}`} className="panel p-4 transition hover:-translate-y-0.5 hover:ring-brand-300">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{camera.name}</h3>
          <p className="text-xs text-slate-500">{camera.stream_url}</p>
        </div>
        <StatusBadge status={camera.status} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {metric('Crowd Count', (camera.last_crowd_count ?? 0).toFixed(1))}
        {metric('Latency', `${(camera.last_latency_ms ?? 0).toFixed(1)} ms`)}
        {metric('Processed FPS', (camera.last_processed_fps ?? 0).toFixed(2))}
        {metric('Last Update', camera.last_update_ts ? new Date(camera.last_update_ts).toLocaleTimeString() : 'N/A')}
      </div>
    </Link>
  );
}
