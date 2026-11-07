import type {
  EngineMessage,
  EngineReply,
  EngineRequest,
  OverviewResponse,
  PersonStatsResponse,
  ReclassifyResponse,
  RecurringResponse,
  ReviewResponse,
  StatisticsResponse,
  WizardResponse,
} from './protocol';
import type { BalancePoint } from '../core/aggregate';
import { todayIso } from '../core/dates';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

/** Promise-based client for the engine worker, with an in-thread fallback when workers are unavailable. */
export class Engine {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private fallback: ((req: EngineRequest) => Promise<unknown>) | null = null;

  constructor(worker: Worker | null) {
    this.worker = worker;
    if (worker) {
      worker.onmessage = (event: MessageEvent<EngineReply>) => {
        const reply = event.data;
        const p = this.pending.get(reply.id);
        if (!p) return;
        this.pending.delete(reply.id);
        if (reply.ok) p.resolve(reply.result);
        else p.reject(new Error(reply.error ?? 'Ukjent feil'));
      };
      worker.onerror = (event) => {
        for (const p of this.pending.values()) p.reject(new Error(event.message || 'Worker-feil'));
        this.pending.clear();
      };
    }
  }

  async call<T>(req: EngineRequest): Promise<T> {
    if (!this.worker) {
      if (!this.fallback) {
        const mod = await import('./engine');
        this.fallback = mod.handleRequest;
      }
      return (await this.fallback(req)) as T;
    }
    const id = this.nextId++;
    const message: EngineMessage = { id, req };
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker!.postMessage(message);
    });
  }

  reclassify(today: string = todayIso()): Promise<ReclassifyResponse> {
    return this.call({ type: 'reclassify', today });
  }

  invalidate(): Promise<null> {
    return this.call({ type: 'invalidate' });
  }

  overview(month: string, today: string = todayIso()): Promise<OverviewResponse> {
    return this.call({ type: 'overview', month, today });
  }

  statistics(from: string, to: string, months: string[]): Promise<StatisticsResponse> {
    return this.call({ type: 'statistics', from, to, months });
  }

  recurring(today: string = todayIso()): Promise<RecurringResponse> {
    return this.call({ type: 'recurring', today });
  }

  balanceHistory(accountId: number | null, from: string, to: string): Promise<BalancePoint[]> {
    return this.call({ type: 'balanceHistory', accountId, from, to });
  }

  review(): Promise<ReviewResponse> {
    return this.call({ type: 'review' });
  }

  personStats(personId: number, months: string[]): Promise<PersonStatsResponse> {
    return this.call({ type: 'personStats', personId, months });
  }

  wizard(): Promise<WizardResponse> {
    return this.call({ type: 'wizard' });
  }
}

export function createEngine(): Engine {
  if (typeof Worker === 'undefined') return new Engine(null);
  try {
    const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    return new Engine(worker);
  } catch {
    return new Engine(null);
  }
}
