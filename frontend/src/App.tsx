import { useEffect, useRef } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { Layout } from './components/Layout';
import { AppToaster } from './components/ui/toaster';
import { useAppContext } from './context/AppContext';
import { useToastState } from './hooks/use-toast';
import { AlertsPage } from './pages/AlertsPage';
import { CameraDetailPage } from './pages/CameraDetailPage';
import { CamerasPage } from './pages/CamerasPage';
import { DashboardPage } from './pages/DashboardPage';
import { ModelIntegrationPage } from './pages/ModelIntegrationPage';
import { SettingsPage } from './pages/SettingsPage';

function App(): JSX.Element {
  const { refreshCameras, connectionMode, cameras, alerts } = useAppContext();
  const seenAlertIdsRef = useRef<Set<string>>(new Set());
  const { toasts, toast, dismiss } = useToastState();

  useEffect(() => {
    void refreshCameras();
  }, [refreshCameras]);

  useEffect(() => {
    alerts.slice(0, 12).forEach((alert) => {
      if (seenAlertIdsRef.current.has(alert.id)) {
        return;
      }
      seenAlertIdsRef.current.add(alert.id);
      toast({
        title: `${alert.camera_name} • ${alert.type.toUpperCase()}`,
        description: alert.message,
        variant: alert.severity === 'critical' ? 'danger' : 'warning',
      });
    });
  }, [alerts, toast]);

  return (
    <>
      <Layout connectionMode={connectionMode} cameras={cameras}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/cameras" element={<CamerasPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/camera/:cameraId" element={<CameraDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/model-integration" element={<ModelIntegrationPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <AppToaster toasts={toasts} onDismiss={dismiss} />
    </>
  );
}

export default App;
