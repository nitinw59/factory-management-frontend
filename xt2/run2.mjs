import { exportBomV2Pdf } from './bomV2.mjs';
import fs from 'fs';
const row = (c, cl) => ({ classification: cl, description: 'desc', colour: c, size: '28-38', cons: '1', uom: 'pcs', wastage: '2%', remarks: '' });
const blocks = [{ title: 'STYLE BOM', sheet: 'X', estimate: false, withQty: false, footnote: 'Consumption is per garment.', file: 'x',
  header: [['STYLE NO', 'LH-SLIM', 'Style category', 'Trouser'], ['BUYER NAME', 'AAMAN', 'SAM', '30']],
  colourways: [{ colour: 'Black', code: 'DN401', desc: 'Black', fit: 'Slim', sizes: '28-38' }],
  fabric: [{ code: 'DN401', classification: 'Black', description: 'Cotton twill', colour: 'Black', size: '28-38', cons: '1.25', uom: 'm', wastage: '2%', remarks: '' }, { code: 'PK10', classification: 'White', description: 'Pocketing', colour: 'Black', size: '28-38', cons: '0.3', uom: 'm', wastage: '2%', remarks: 'Pocketing fabric' }],
  trims: [{ name: 'Button (fly)', rows: [row('Black', 'B18'), row('Navy', 'B18N')] }, { name: 'Thread', rows: [row('Same in all', 'T-40/2')] }] }];
exportBomV2Pdf(blocks, null);
fs.writeFileSync('/private/tmp/claude-501/-Users-nitinmac-git-factory-management-frontend/e3ad01a1-74ca-4a97-bffa-74ebe3a8099a/scratchpad/v2.pdf', Buffer.from(globalThis.__doc.output('arraybuffer')));
