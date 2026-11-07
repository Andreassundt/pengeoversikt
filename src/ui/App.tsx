import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { DataProvider, useData, cn } from './data';
import { Overview } from './screens/Overview';
import { Transactions } from './screens/Transactions';
import { Statistics } from './screens/Statistics';
import { Recurring } from './screens/Recurring';
import { More } from './screens/More';
import { Accounts, AccountDetail } from './screens/Accounts';
import { Persons, PersonDetail } from './screens/Persons';
import { Categories } from './screens/Categories';
import { Rules } from './screens/Rules';
import { ImportHistory } from './screens/ImportHistory';
import { Settings } from './screens/Settings';
import { Backup } from './screens/Backup';
import { Wizard } from './screens/Wizard';
import { Review } from './screens/Review';
import { Spinner } from './components/basics';

const NAV = [
  { to: '/', label: 'Oversikt', icon: '🏠' },
  { to: '/transaksjoner', label: 'Transaksjoner', icon: '📋' },
  { to: '/statistikk', label: 'Statistikk', icon: '📊' },
  { to: '/faste', label: 'Faste', icon: '🔁' },
  { to: '/mer', label: 'Mer', icon: '⋯' },
];

const SHARED_CACHE = 'pengeoversikt-shared-files';

/** Reads files that the service worker stored from a Web Share Target request. */
async function readSharedFiles(): Promise<File[]> {
  if (typeof caches === 'undefined') return [];
  try {
    const cache = await caches.open(SHARED_CACHE);
    const keys = await cache.keys();
    const files: File[] = [];
    for (const key of keys) {
      const res = await cache.match(key);
      if (!res) continue;
      const name = decodeURIComponent(res.headers.get('X-File-Name') ?? 'delt.csv');
      files.push(new File([await res.blob()], name, { type: res.headers.get('Content-Type') ?? 'text/csv' }));
      await cache.delete(key);
    }
    return files;
  } catch {
    return [];
  }
}

function useTheme() {
  const { settings } = useData();
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);
  useEffect(() => {
    document.body.classList.toggle('hide-amounts', settings.hideAmounts);
  }, [settings.hideAmounts]);
}

function Shell() {
  useTheme();
  const { ready, busy } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  const [sharedFiles, setSharedFiles] = useState<File[] | null>(null);

  useEffect(() => {
    if (location.pathname !== '/import') return;
    readSharedFiles().then((files) => {
      setSharedFiles(files.length > 0 ? files : null);
      navigate('/', { replace: true });
    });
  }, [location.pathname, navigate]);

  if (!ready) return <Spinner label="Starter…" />;
  const hideNav = location.pathname.startsWith('/oppsett');

  return (
    <div className="mx-auto flex h-dvh max-w-lg flex-col">
      {busy && (
        <div role="status" aria-live="polite" className="fixed inset-x-0 top-0 z-40 h-1 animate-pulse bg-brand-600">
          <span className="sr-only">Arbeider…</span>
        </div>
      )}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Overview sharedFiles={sharedFiles} onSharedConsumed={() => setSharedFiles(null)} />} />
          <Route path="/import" element={<Spinner label="Henter delte filer…" />} />
          <Route path="/transaksjoner" element={<Transactions />} />
          <Route path="/statistikk" element={<Statistics />} />
          <Route path="/faste" element={<Recurring />} />
          <Route path="/mer" element={<More />} />
          <Route path="/mer/kontoer" element={<Accounts />} />
          <Route path="/mer/kontoer/:id" element={<AccountDetail />} />
          <Route path="/mer/personer" element={<Persons />} />
          <Route path="/mer/personer/:id" element={<PersonDetail />} />
          <Route path="/mer/kategorier" element={<Categories />} />
          <Route path="/mer/regler" element={<Rules />} />
          <Route path="/mer/import" element={<ImportHistory />} />
          <Route path="/mer/sikkerhetskopi" element={<Backup />} />
          <Route path="/mer/innstillinger" element={<Settings />} />
          <Route path="/oppsett" element={<Wizard />} />
          <Route path="/sjekk" element={<Review />} />
          <Route path="*" element={<Overview sharedFiles={null} onSharedConsumed={() => undefined} />} />
        </Routes>
      </main>
      {!hideNav && (
        <nav
          aria-label="Hovedmeny"
          className="grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-900"
        >
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                  isActive ? 'text-brand-700 dark:text-brand-500' : 'text-slate-500 dark:text-slate-400',
                )
              }
            >
              <span className="text-xl" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}

export function App() {
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  );
}
