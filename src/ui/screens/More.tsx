import { Link } from 'react-router-dom';
import { useData } from '../data';
import { Card, daysAgoText } from '../components/basics';

const ITEMS: Array<{ to: string; icon: string; title: string; text: string }> = [
  { to: '/mer/kontoer', icon: '🏦', title: 'Kontoer', text: 'Saldo, graf, rolle og navn' },
  { to: '/mer/personer', icon: '👥', title: 'Personer', text: 'Inn, ut og netto per person' },
  { to: '/mer/kategorier', icon: '🏷️', title: 'Kategorier', text: 'Navn, farger, ikoner og sammenslåing' },
  { to: '/mer/regler', icon: '⚙️', title: 'Regler', text: 'Egne regler med prioritet og test' },
  { to: '/mer/import', icon: '📜', title: 'Import-historikk', text: 'Alle importer, med angre' },
  { to: '/mer/sikkerhetskopi', icon: '💾', title: 'Sikkerhetskopi', text: 'Eksporter og gjenopprett' },
  { to: '/mer/innstillinger', icon: '🛠️', title: 'Innstillinger', text: 'Engangsterskel, personvern og tema' },
  { to: '/oppsett', icon: '🧭', title: 'Oppsett-veiviser', text: 'Kontoer, personer, engangsposter, butikker' },
  { to: '/sjekk', icon: '✅', title: 'Sjekk disse', text: 'Alt som trenger avklaring' },
];

export function More() {
  const { settings } = useData();
  const backupDays = settings.lastBackupAt ? Math.floor((Date.now() - new Date(settings.lastBackupAt).getTime()) / 86_400_000) : null;
  return (
    <div className="space-y-3 p-4">
      {(backupDays == null || backupDays >= 30) && (
        <Link to="/mer/sikkerhetskopi" className="block rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
          💾 Sikkerhetskopi tatt {daysAgoText(settings.lastBackupAt)}. Ta en ny kopi, så dataene ikke går tapt om nettleseren rydder lagring.
        </Link>
      )}
      <ul className="space-y-2">
        {ITEMS.map((item) => (
          <li key={item.to}>
            <Link to={item.to} className="block">
              <Card className="flex items-center gap-3 p-3">
                <span className="text-2xl" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="flex-1">
                  <span className="block font-medium">{item.title}</span>
                  <span className="block text-sm text-slate-500">{item.text}</span>
                </span>
                <span className="text-slate-400">›</span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      <p className="pt-4 text-center text-xs text-slate-400">Pengeoversikt · alle data ligger kun på denne enheten</p>
    </div>
  );
}
