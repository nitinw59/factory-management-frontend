import { buildTrimCardWorkbook } from './trimCardXlsx.mjs';
import { buildBomV2Workbook } from './bomV2.mjs';
const m = { title: 'TRIM CARD', company: null, sample: true, footer: true, header: [['Buyer', 'A']], colours: [{ id: 1, name: 'Black' }, { id: 2, name: 'Navy' }],
  grid: [{ label: 'THREAD', cells: [['T1'], ['T2']] }], strips: [], bottom: [{ label: 'Labels', text: 'x' }] };
const wb = await buildTrimCardWorkbook(m);
const ws = wb.worksheets[0];
ws.eachRow((row, n) => { const v = row.values.slice(1).map(x => (x == null ? '' : String(x).slice(0, 10))); if (v.join('').includes('Colour') || v.join('').includes('THREAD')) console.log('card row', n, JSON.stringify(v), 'h', row.height); });
const row = (c) => ({ classification: 'B', description: 'd', colour: c, size: 'S', cons: '1', uom: 'pcs', wastage: '2%', remarks: '', qty: 10 });
for (const withQty of [false, true]) {
  const wb2 = await buildBomV2Workbook([{ title: 'BOM', sheet: 'S' + withQty, withQty, footnote: 'f', header: [['a', 'b', 'c', 'd']], fabric: [{ code: 'F', classification: 'c', description: 'd', colour: 'k', size: 's', cons: '1', uom: 'm', wastage: '2%', remarks: 'r', qty: 5 }], trims: [{ name: 'Btn', rows: [row('Black')] }] }], null);
  wb2.worksheets[0].eachRow((r, n) => { const v = r.values.slice(1).map(x => (x == null ? '' : String(x))); if (v.includes('SAMPLE')) console.log('v2 withQty', withQty, 'header', n, 'SAMPLE at col', v.indexOf('SAMPLE') + 1, 'REMARKS at', v.indexOf('REMARKS') + 1, 'cols', wb2.worksheets[0].columns.length); });
}
