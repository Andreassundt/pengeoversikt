import { useNavigate } from 'react-router-dom';
import { Card, PageHeader } from '../components/basics';

export function Backup() {
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader title="Sikkerhetskopi" back={() => navigate('/mer')} />
      <div className="p-4">
        <Card>
          <p className="text-slate-500">Sikkerhetskopi kommer i neste milepæl.</p>
        </Card>
      </div>
    </div>
  );
}
