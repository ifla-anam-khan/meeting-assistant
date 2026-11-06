import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  HomeIcon,
  PlusCircleIcon,
  CheckSquareIcon,
  MessageCircleIcon,
  SettingsIcon,
  FolderIcon,
  FolderOpenIcon,
  SearchIcon,
  RssIcon,
} from 'lucide-react'
import { useAppStore } from '@/store'
import { useRecentErrors } from '@/lib/hooks'
import { cn } from '@/lib/utils'

const workNav = [
  { to: '/', icon: HomeIcon, label: 'Today', end: true },
  { to: '/capture', icon: PlusCircleIcon, label: 'Capture', end: false },
  { to: '/todo', icon: CheckSquareIcon, label: 'Tasks', end: false },
  { to: '/captures', icon: FolderIcon, label: 'Meetings', end: false },
  { to: '/feed', icon: RssIcon, label: 'AI News', end: false },
  { to: '/ask', icon: MessageCircleIcon, label: 'Ask', end: false },
]

const personalNav = [
  { to: '/', icon: HomeIcon, label: 'Today', end: true },
  { to: '/capture', icon: PlusCircleIcon, label: 'Dump', end: false },
  { to: '/todo', icon: CheckSquareIcon, label: 'Tasks', end: false },
  { to: '/projects', icon: FolderOpenIcon, label: 'Projects', end: false },
  { to: '/feed', icon: RssIcon, label: 'AI News', end: false },
  { to: '/ask', icon: MessageCircleIcon, label: 'Ask', end: false },
]

export default function Layout() {
  const { space, setSpace } = useAppStore()
  const isWork = space === 'work'
  const nav = isWork ? workNav : personalNav
  const navigate = useNavigate()
  const { data: recentErrors } = useRecentErrors()
  const hasErrors = (recentErrors?.length ?? 0) > 0

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* ── Topbar ── */}
      <header className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0 bg-background">
        <span
          className={cn(
            'font-semibold text-base tracking-tight',
            isWork ? 'text-indigo-600' : 'text-emerald-600',
          )}
        >
          {isWork ? 'Work' : 'Personal'}
        </span>

        {/* Work / Personal toggle */}
        <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
          <button
            onClick={() => setSpace('work')}
            className={cn(
              'px-3 py-1 text-sm rounded-md font-medium transition-all',
              space === 'work'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Work
          </button>
          <button
            onClick={() => setSpace('personal')}
            className={cn(
              'px-3 py-1 text-sm rounded-md font-medium transition-all',
              space === 'personal'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Personal
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate('/search')}
            className="p-1 text-muted-foreground"
            aria-label="Search"
          >
            <SearchIcon size={20} />
          </button>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn('relative p-1', isActive ? (isWork ? 'text-indigo-600' : 'text-emerald-600') : 'text-muted-foreground')
            }
          >
            <SettingsIcon size={20} />
            {hasErrors && (
              <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-destructive ring-1 ring-background" />
            )}
          </NavLink>
        </div>
      </header>

      {/* ── Scrollable content ── */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* ── Bottom nav ── */}
      <nav className="flex border-t border-border bg-background shrink-0 pb-safe">
        {nav.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={`${to}-${label}`}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center flex-1 py-2 gap-0.5 text-xs transition-colors',
                isActive
                  ? isWork
                    ? 'text-indigo-600'
                    : 'text-emerald-600'
                  : 'text-muted-foreground',
              )
            }
          >
            <Icon size={18} />
            <span className="text-[10px]">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
