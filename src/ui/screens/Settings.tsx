import { useNavigate } from 'react-router-dom';
import { useData, type Theme } from '../data';
import { formatOre, parseAmountNo } from '../../core/money';
import { Button, Card, Field, PageHeader, Toggle, inputClass } from '../components/basics';

export function Settings() {
  const { settings, updateSetting, db, engine, bump } = useData();
  const navigate = useNavigate();

  const wipe = async () => {
    if (!window.confirm('Slette ALLE data i appen på denne enheten? Dette kan ikke angres. Ta sikkerhetskopi først.')) return;
    await db.delete();
    await db.open();
    await engine.invalidate();
    bump();
    navigate('/');
  };

  return (
    <div>
      <PageHeader title="Innstillinger" back={() => navigate('/mer')} />
      <div className="space-y-3 p-4">
        <Card>
          <Field label="Terskel for engangsposter (kr)" hint="Transaksjoner over terskelen flagges automatisk som engangs og holdes utenfor normalt forbruk.">
            <input
              inputMode="numeric"
              defaultValue={formatOre(settings.oneOffThresholdOre, { decimals: 0, unit: false })}
              onBlur={(e) => {
                const v = parseAmountNo(e.target.value);
                if (v != null && v > 0 && v !== settings.oneOffThresholdOre) void updateSetting('oneOffThresholdOre', v);
              }}
              className={inputClass}
            />
          </Field>
          <Field label="Eiernavn (slik det står i banken)" hint="Brukes til å kjenne igjen overføringer til og fra egne kontoer i andre banker.">
            <input
              defaultValue={settings.ownerName}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== settings.ownerName) void updateSetting('ownerName', v);
              }}
              className={inputClass}
            />
          </Field>
        </Card>
        <Card>
          <Toggle checked={settings.hideAmounts} onChange={(v) => updateSetting('hideAmounts', v)} label="Skjul beløp (personvernmodus)" />
          <Toggle checked={settings.hideInternal} onChange={(v) => updateSetting('hideInternal', v)} label="Skjul interne overføringer som standard" />
          <Field label="Tema">
            <select value={settings.theme} onChange={(e) => updateSetting('theme', e.target.value as Theme)} className={inputClass}>
              <option value="system">Som systemet</option>
              <option value="light">Lyst</option>
              <option value="dark">Mørkt</option>
            </select>
          </Field>
        </Card>
        <Card>
          <h2 className="font-medium">Personvern</h2>
          <p className="text-sm text-slate-500">
            Appen gjør ingen nettverkskall utover å laste seg selv. Alle data ligger i nettleserens lagring på denne enheten. Ingen sporing, ingen sky.
          </p>
        </Card>
        <Button variant="danger" full onClick={wipe}>
          Slett alle data
        </Button>
      </div>
    </div>
  );
}
