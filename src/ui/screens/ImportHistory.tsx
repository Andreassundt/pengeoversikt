import { useNavigate } from 'react-router-dom';
import { useAsync, useData } from '../data';
import { lastBatch, undoImports } from '../../db/importer';
import { formatDateNo } from '../../core/dates';
import { Button, Card, PageHeader, Spinner } from '../components/basics';

export function ImportHistory() {
  const { db, mutate } = useData();
  const navigate = useNavigate();
  const { data } = useAsync(async () => {
    const all = await db.imports.orderBy('importedAt').reverse().toArray();
    const latest = await lastBatch(db);
    return { all, latestBatchId: latest[0]?.batchId ?? null };
  }, [db]);

  if (!data) return <Spinner />;
  const batches = new Map<string, typeof data.all>();
  for (const r of data.all) {
    const list = batches.get(r.batchId) ?? [];
    list.push(r);
    batches.set(r.batchId, list);
  }

  const undo = async () => {
    if (!window.confirm('Angre siste import? Radene fjernes og erstattede reservasjoner legges tilbake.')) return;
    const batch = await lastBatch(db);
    await mutate(() => undoImports(db, batch));
  };

  return (
    <div>
      <PageHeader title="Import-historikk" back={() => navigate('/mer')} />
      <div className="space-y-3 p-4">
        {data.all.length === 0 && <p className="text-slate-500">Ingen importer ennå.</p>}
        {[...batches.entries()].map(([batchId, records]) => (
          <Card key={batchId} className="p-3">
            <div className="mb-1 flex items-center justify-between text-sm text-slate-500">
              <span>{new Date(records[0]!.importedAt).toLocaleString('nb-NO')}</span>
              {batchId === data.latestBatchId && !records[0]!.undone && (
                <Button size="sm" variant="danger" onClick={undo}>
                  Angre siste import
                </Button>
              )}
            </div>
            <ul className="space-y-1 text-sm">
              {records.map((r) => (
                <li key={r.id} className={r.undone ? 'text-slate-400 line-through' : ''}>
                  <div className="font-medium">
                    {r.fileName}
                    {r.undone && ' (angret)'}
                  </div>
                  <div className="text-slate-500">
                    {r.periodStart && r.periodEnd && `${formatDateNo(r.periodStart)}–${formatDateNo(r.periodEnd)} · `}
                    {r.rowCount} rader, {r.newBooked + r.reservedAdded} nye, {r.duplicates} duplikater, {r.reservedRemoved} reserverte erstattet
                    {r.reservedSkipped > 0 && `, ${r.reservedSkipped} reserverte hoppet over`}
                  </div>
                  {r.warnings.length > 0 && <div className="text-amber-700">⚠️ {r.warnings.join(' ')}</div>}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
