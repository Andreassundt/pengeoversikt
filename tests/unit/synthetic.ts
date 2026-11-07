/** Deterministic synthetic bank exports for performance tests (no real data). */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MERCHANTS = [
  ['REMA 1000 BRYN', 'debet'],
  ['KIWI 123 STORO', 'debet'],
  ['MENY BRYN', 'debet'],
  ['CIRCLE K GOL 539', 'ubetjent'],
  ['ST1 BRYN', 'ubetjent'],
  ['APOTEK 1 STORGATA', 'debet'],
  ['VINMONOPOLET OSLO', 'debet'],
  ['ELKJØP ALNA', 'debet'],
  ['IKEA FURUSET', 'debet'],
  ['MCD 072 STORO', 'debet'],
  ['Vipps*ISS Facility Servic', 'debet'],
  ['UKJENT BUTIKK 17', 'debet'],
  ['SYNTETISK HANDEL AS', 'debet'],
  ['Prime Video', 'utland'],
  ['GOOGLE*YOUTUBEPREMIUM', 'utland'],
  ['OPENAI *CHATGPT SUBSCR', 'utland'],
  ['NETFLIX.COM', 'utland'],
  ['SPOTIFY', 'utland'],
] as const;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function dateNo(d: Date): string {
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

function dot(ore: number): string {
  const abs = Math.abs(ore);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const f = frac === 0 ? '' : frac % 10 === 0 ? `.${frac / 10}` : `.${pad(frac)}`;
  return `${ore < 0 ? '-' : ''}${whole}${f}`;
}

function noFormat(ore: number): string {
  const abs = Math.abs(ore);
  const whole = Math.floor(abs / 100).toString();
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${ore < 0 ? '-' : ''}${grouped},${pad(abs % 100)} NOK`;
}

export interface SyntheticOptions {
  accountNumber: string;
  accountName: string;
  rows: number;
  seed: number;
  /** Start date (UTC) for the period. */
  start: Date;
  days: number;
  otherOwnAccount: string;
  owner: string;
}

/** Builds a CSV in the bank format with `rows` transaction rows, newest first, plus a footer. */
export function generateBankCsv(o: SyntheticOptions): string {
  const rnd = mulberry32(o.seed);
  const lines: string[] = [];
  let sumIn = 0;
  let sumOut = 0;
  const rows: string[][] = [];
  for (let i = 0; i < o.rows; i++) {
    const dayOffset = Math.floor(rnd() * o.days);
    const d = new Date(o.start.getTime() + dayOffset * 86_400_000);
    const ds = dateNo(d);
    const r = rnd();
    let fields: string[];
    if (r < 0.05) {
      // Own transfer in.
      const amount = 100000 + Math.floor(rnd() * 50) * 100000;
      fields = [ds, ds, ds, 'Overføring fra Annen', 'Overføring', 'Overføring til egen konto', o.otherOwnAccount, 'Annen', o.accountNumber, o.accountName, dot(amount), '', 'NOK', 'Bokført', ''];
      sumIn += amount;
    } else if (r < 0.08) {
      const amount = -(50000 + Math.floor(rnd() * 20) * 10000);
      fields = [ds, ds, ds, 'Til konto: 1111 22 39999', 'Betaling innland', 'Betaling med KID innland', o.accountNumber, o.accountName, '1111 22 39999', 'Regning AS', '', dot(amount), 'NOK', 'Bokført', '12345678'];
      sumOut += amount;
    } else if (r < 0.1) {
      const amount = 2000000 + Math.floor(rnd() * 100) * 10000;
      fields = [ds, ds, ds, 'Lønn fra EKSEMPEL AS', 'Lønn', 'Lønn', '8100 00 00001', '', o.accountNumber, o.owner, dot(amount), '', 'NOK', 'Bokført', 'Fra: EKSEMPEL AS'];
      sumIn += amount;
    } else {
      const m = MERCHANTS[Math.floor(rnd() * MERCHANTS.length)]!;
      const amount = -(1000 + Math.floor(rnd() * 2000) * 100);
      const reserved = rnd() < 0.01;
      const purchase = new Date(d.getTime() - 86_400_000);
      const prefix = `${pad(purchase.getUTCDate())}.${pad(purchase.getUTCMonth() + 1)}`;
      if (reserved) {
        fields = [ds, '', ds, m[0], 'Varekjøp', '', o.accountNumber, o.accountName, '', '', '', dot(amount), 'NOK', 'Reservert', m[0]];
      } else if (m[1] === 'utland') {
        const msg = `*9876 ${prefix} NOK ${dot(-amount).includes('.') ? dot(-amount) : `${dot(-amount)}.00`} ${m[0]} Kurs: 1.0000`;
        fields = [ds, ds, ds, m[0], 'Varekjøp', 'Varekjøp i utlandet', o.accountNumber, o.owner, '', '', '', dot(amount), 'NOK', 'Bokført', msg];
      } else {
        const desc = `${prefix} ${m[0]} OSLO`;
        fields = [ds, ds, ds, desc, 'Varekjøp', m[1] === 'ubetjent' ? 'Varekjøp ubetjent' : 'Varekjøp debetkort', o.accountNumber, o.owner, '', '', '', dot(amount), 'NOK', 'Bokført', desc];
      }
      sumOut += amount;
    }
    rows.push(fields);
  }
  rows.sort((a, b) => {
    const da = a[0]!.split('.').reverse().join('');
    const db = b[0]!.split('.').reverse().join('');
    return da < db ? 1 : da > db ? -1 : 0;
  });
  lines.push(
    '﻿Utført dato;Bokført dato;Rentedato;Beskrivelse;Type;Undertype;Fra konto;Avsender;Til konto;Mottakernavn;Beløp inn;Beløp ut;Valuta;Status;Melding/KID/Fakt.nr',
  );
  for (const f of rows) lines.push(f.join(';'));
  const end = new Date(o.start.getTime() + o.days * 86_400_000);
  lines.push(';;;;;;;;;;;;;;');
  lines.push(`Total beløp inn på konto:;;${noFormat(sumIn)};;;;;;;;;;;;`);
  lines.push(';;;;;;;;;;;;;;');
  lines.push(`Totalt beløp ut av konto:;;${noFormat(sumOut)};;;;;;;;;;;;`);
  lines.push(';;;;;;;;;;;;;;');
  lines.push(`Inngående saldo pr. ${dateNo(o.start)}:;;0,00 NOK;;;;;;;;;;;;`);
  lines.push(';;;;;;;;;;;;;;');
  lines.push(`Utgående  saldo pr. ${dateNo(end)}:;;${noFormat(sumIn + sumOut)};;;;;;;;;;;;`);
  return lines.join('\n') + '\n';
}
