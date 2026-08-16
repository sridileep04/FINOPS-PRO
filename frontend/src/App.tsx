/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Copilot from './pages/Copilot';
import Integrations from './pages/Integrations';
import ResourceExplorer from './pages/ResourceExplorer';
import OrphanedResources from './pages/OrphanedResources';
import IaCDrift from './pages/IaCDrift';
import FeaturesControl from './pages/FeaturesControl';
import Optimizations from './pages/Optimizations';
import Settings from './pages/Settings';
import Docs from './pages/Docs';

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/dashboard/integrations" element={<Integrations />} />
                  <Route path="/dashboard/resources" element={<ResourceExplorer />} />
                  <Route path="/dashboard/orphaned" element={<OrphanedResources />} />
                  <Route path="/dashboard/iac-drift" element={<IaCDrift />} />
                  <Route path="/dashboard/features" element={<FeaturesControl />} />
                  <Route path="/dashboard/optimizations" element={<Optimizations />} />
                  <Route path="/dashboard/copilot" element={<Copilot />} />
                  <Route path="/dashboard/settings" element={<Settings />} />
                  <Route path="/dashboard/docs" element={<Docs />} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
