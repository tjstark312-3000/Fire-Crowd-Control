import { CameraStatus } from '../types';
import { Badge } from './ui/badge';

const variantByStatus: Record<CameraStatus, 'success' | 'muted' | 'danger'> = {
  online: 'success',
  offline: 'muted',
  error: 'danger',
};

export function StatusBadge({ status }: { status: CameraStatus }): JSX.Element {
  return <Badge variant={variantByStatus[status]}>{status.toUpperCase()}</Badge>;
}
