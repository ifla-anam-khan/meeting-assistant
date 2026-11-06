import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import NewCapture from './pages/NewCapture'
import Todo from './pages/Todo'
import Remember from './pages/Remember'
import CapturesList from './pages/CapturesList'
import CaptureDetail from './pages/CaptureDetail'
import Ask from './pages/Ask'
import Search from './pages/Search'
import Settings from './pages/Settings'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Logs from './pages/Logs'
import Feed from './pages/Feed'
import Login from './pages/Login'
import { getToken } from './lib/api'

function AuthGuard({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <AuthGuard>
              <Layout />
            </AuthGuard>
          }
        >
          <Route index element={<Home />} />
          <Route path="capture" element={<NewCapture />} />
          <Route path="todo" element={<Todo />} />
          <Route path="remember" element={<Remember />} />
          <Route path="captures" element={<CapturesList />} />
          <Route path="captures/:id" element={<CaptureDetail />} />
          <Route path="ask" element={<Ask />} />
          <Route path="search" element={<Search />} />
          <Route path="settings" element={<Settings />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDetail />} />
          <Route path="logs" element={<Logs />} />
          <Route path="feed" element={<Feed />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
