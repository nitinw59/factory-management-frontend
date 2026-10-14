import { exportTrimCardFactoryPdf } from './trimCardPdf.mjs';
import fs from 'fs';
const m = { title: 'TRIM CARD', company: null, sample: true, footer: true, file: 'x',
  header: [['Buyer', 'AAMAN'], ['Style', 'LH-SLIM'], ['S.O. no.', 'SO3/2026-27/0003'], ['Date', '13/10/2026'], ['Style BOM', 'v1 · approved']],
  colours: [{ id: 1, name: 'Black' }, { id: 2, name: 'Navy' }, { id: 3, name: 'Khaki' }],
  grid: [{ label: 'Fab. Q. No.', bold: true, cells: [['DN401'], ['DN401'], ['DN402']] }, { label: 'Swatch', swatch: true, cells: [[], [], []] },
    { label: 'THREAD', cells: [['T-40/2 826'], ['T-40/2 835'], ['T-40/2 ASH']] }, { label: 'BUTTON', cells: [['B18'], ['B18'], ['B18']] }, { label: 'MAIN LABEL', cells: [['ML-01'], ['ML-01'], ['ML-01']] }],
  strips: [], bottom: [{ label: 'Labels', text: '1) Main\n2) Size' }, { label: 'Hook & eye', text: '' }] };
const doc = exportTrimCardFactoryPdf({ ...m });
fs.writeFileSync('/private/tmp/claude-501/-Users-nitinmac-git-factory-management-frontend/e3ad01a1-74ca-4a97-bffa-74ebe3a8099a/scratchpad/tc.pdf', Buffer.from(globalThis.__doc.output('arraybuffer')));
