import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ensureDefaults, getDb, type PengeDb } from '../db/schema';
import { createEngine, Engine } from '../workers/client';
import { DEFAULT_ONE_OFF_THRESHOLD_ORE, getSetting, setSetting, SETTING_KEYS } from '../db/repo';
import type { ReclassifyResponse } from '../workers/protocol';

export type Theme = 'system' | 'light' | 'dark';

export interface AppSettings {
  hideAmounts: boolean;
  theme: Theme;
  oneOffThresholdOre: number;
  hideInternal: boolean;
  wizardDone: boolean;
  lastBackupAt: string | null;
  ownerName: string;
  hiddenRecurringKeys: string[];
}

const DEFAULTS: AppSettings = {
  hideAmounts: false,
  theme: 'system',
  oneOffThresholdOre: DEFAULT_ONE_OFF_THRESHOLD_ORE,
  hideInternal: true,
  wizardDone: false,
  lastBackupAt: null,
  ownerName: '',
  hiddenRecurringKeys: [],
};

const KEYS: Record<keyof AppSettings, string> = {
  hideAmounts: SETTING_KEYS.hideAmounts,
  theme: SETTING_KEYS.theme,
  oneOffThresholdOre: SETTING_KEYS.oneOffThresholdOre,
  hideInternal: SETTING_KEYS.hideInternalByDefault,
  wizardDone: SETTING_KEYS.wizardDone,
  lastBackupAt: SETTING_KEYS.lastBackupAt,
  ownerName: SETTING_KEYS.ownerName,
  hiddenRecurringKeys: 'hiddenRecurringKeys',
};

async function loadSettings(db: PengeDb): Promise<AppSettings> {
  const out = { ...DEFAULTS };
  for (const key of Object.keys(KEYS) as Array<keyof AppSettings>) {
    (out as Record<string, unknown>)[key] = await getSetting(db, KEYS[key], DEFAULTS[key]);
  }
  return out;
}

export interface MutateOptions {
  /** Run reclassification afterwards (default true). */
  reclassify?: boolean;
}

interface DataContextValue {
  db: PengeDb;
  engine: Engine;
  version: number;
  ready: boolean;
  busy: boolean;
  settings: AppSettings;
  bump: () => void;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
  mutate: (fn: () => Promise<void>, opts?: MutateOptions) => Promise<ReclassifyResponse | null>;
  reloadSettings: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const db = useMemo(() => getDb(), []);
  const engine = useMemo(() => createEngine(), []);
  const [version, setVersion] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const reloadSettings = useCallback(async () => {
    setSettings(await loadSettings(db));
  }, [db]);

  useEffect(() => {
    let alive = true;
    ensureDefaults(db)
      .then(() => loadSettings(db))
      .then((s) => {
        if (!alive) return;
        setSettings(s);
        setReady(true);
      })
      .catch(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [db]);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  // Development aid only: lets the dev tools and tests reach the database and engine.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __penge?: unknown }).__penge = { db, engine };
  }, [db, engine]);

  const mutate = useCallback(
    async (fn: () => Promise<void>, opts: MutateOptions = {}) => {
      setBusy(true);
      try {
        await fn();
        let result: ReclassifyResponse | null = null;
        if (opts.reclassify !== false) result = await engine.reclassify();
        else await engine.invalidate();
        bump();
        return result;
      } finally {
        setBusy(false);
      }
    },
    [engine, bump],
  );

  const updateSetting = useCallback(
    async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      await setSetting(db, KEYS[key], value);
      setSettings((s) => ({ ...s, [key]: value }));
      if (key === 'oneOffThresholdOre' || key === 'ownerName') {
        await mutate(async () => undefined);
      } else {
        await engine.invalidate();
        bump();
      }
    },
    [db, engine, bump, mutate],
  );

  const value = useMemo<DataContextValue>(
    () => ({ db, engine, version, ready, busy, settings, bump, updateSetting, mutate, reloadSettings }),
    [db, engine, version, ready, busy, settings, bump, updateSetting, mutate, reloadSettings],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** Runs an async loader and re-runs it whenever the data version or the deps change. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const { version, ready } = useData();
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fn()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((e: unknown) => alive && setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version, ready]);
  return state;
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
