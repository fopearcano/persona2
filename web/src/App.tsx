import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';

// Caricamento differito delle pagine: il primo avvio scarica solo ciò che serve.
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })));
const CharactersPage = lazy(() => import('./pages/CharactersPage').then((m) => ({ default: m.CharactersPage })));
const CharacterEditorPage = lazy(() => import('./pages/CharacterEditorPage').then((m) => ({ default: m.CharacterEditorPage })));
const DialoguePage = lazy(() => import('./pages/DialoguePage').then((m) => ({ default: m.DialoguePage })));
const MemoryPage = lazy(() => import('./pages/MemoryPage').then((m) => ({ default: m.MemoryPage })));
const ScenarioEditorPage = lazy(() => import('./pages/ScenarioEditorPage').then((m) => ({ default: m.ScenarioEditorPage })));
const ScenarioSessionPage = lazy(() => import('./pages/ScenarioEditorPage').then((m) => ({ default: m.ScenarioSessionPage })));
const ScenariosPage = lazy(() => import('./pages/ScenariosPage').then((m) => ({ default: m.ScenariosPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const SimulationsPage = lazy(() => import('./pages/SimulationsPage').then((m) => ({ default: m.SimulationsPage })));
const SimulationPage = lazy(() => import('./pages/SimulationsPage').then((m) => ({ default: m.SimulationPage })));

export function App() {
  return (
    <Layout>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<Navigate to="/characters" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/characters" element={<CharactersPage />} />
          <Route path="/characters/new" element={<CharacterEditorPage key="new" />} />
          <Route path="/characters/:id" element={<CharacterEditorPage />} />
          <Route path="/dialogue" element={<DialoguePage />} />
          <Route path="/dialogue/:characterId" element={<DialoguePage />} />
          <Route path="/dialogue/:characterId/:conversationId" element={<DialoguePage />} />
          <Route path="/scenarios" element={<ScenariosPage />} />
          <Route path="/scenarios/:id" element={<ScenarioEditorPage />} />
          <Route path="/scenarios/:id/sessions/:conversationId" element={<ScenarioSessionPage />} />
          <Route path="/simulations" element={<SimulationsPage />} />
          <Route path="/simulations/:conversationId" element={<SimulationPage />} />
          <Route path="/memory" element={<MemoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/characters" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
