import { useState } from 'react';

import { CamerasDataTable } from '../components/CamerasDataTable';
import { Button } from '../components/ui/button';
import { useAppContext } from '../context/AppContext';

export function CamerasPage(): JSX.Element {
  const { cameras, patchCamera, refreshCameras } = useAppContext();
  const [pending, setPending] = useState(false);

  const pauseMany = async (cameraIds: string[]) => {
    if (!cameraIds.length) {
      return;
    }

    setPending(true);
    try {
      await Promise.all(
        cameraIds.map((cameraId) =>
          patchCamera(cameraId, {
            enabled: false,
          }),
        ),
      );
      await refreshCameras();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Cameras Table</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Enterprise grid with pinning, resizing, filters, and bulk operations.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void refreshCameras()} disabled={pending}>
          Refresh
        </Button>
      </div>
      <CamerasDataTable cameras={cameras} onPauseMany={(ids) => void pauseMany(ids)} />
    </div>
  );
}
