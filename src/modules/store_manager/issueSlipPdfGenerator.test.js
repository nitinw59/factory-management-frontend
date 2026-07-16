import autoTable from 'jspdf-autotable';

jest.mock('jspdf-autotable', () => jest.fn());
jest.mock('../../utils/api', () => ({ IMAGE_BASE_URL: 'http://localhost:5002/uploads' }));

// jsdom ships no TextEncoder and no network; both have to be in place before jspdf loads,
// hence the lazy require of the generator below.
global.TextEncoder = global.TextEncoder || require('util').TextEncoder;
global.TextDecoder = global.TextDecoder || require('util').TextDecoder;
global.fetch = jest.fn(() => Promise.reject(new Error('no network')));

const { generateIssueSlipPdf } = require('./issueSlipPdfGenerator');

// Capture the rows instead of drawing them. The real autotable leaves behind lastAutoTable,
// which the generator reads to place the total below the table. CRA resets mocks between
// tests, so the implementation is reinstalled here rather than in the factory.
beforeEach(() => {
    autoTable.mockImplementation((doc) => { doc.lastAutoTable = { finalY: 400 }; });
});

const bodyOf = () => autoTable.mock.calls[0][1].body;
const headOf = () => autoTable.mock.calls[0][1].head[0];
// Rows are a mix of plain strings and {content, styles} cells.
const text = (row) => row.map(c => (c && typeof c === 'object' ? c.content : c));
const isParent = (row) => !!row[0] && typeof row[0] === 'object' && row[0].styles?.fontStyle === 'bold';

const trim = (item_name, color, qty, unit_cost, over = {}) => ({
    item_kind: 'trim', item_name, item_code: `${item_name.toUpperCase()}-1`,
    variant_color_name: color, qty, unit_cost, uom: 'pcs', ...over,
});

it('groups trim variants under one parent row carrying the group summary', async () => {
    await generateIssueSlipPdf({
        issue: {
            id: 1, issue_number: 'IS-1', total_value: 300,
            lines: [
                trim('Button', 'Red', 10, 2),
                trim('Zipper', 'Black', 5, 20),
                trim('Button', 'Blue', 40, 2),   // same trim item as row 1, out of order
            ],
        },
    });

    const rows = bodyOf();
    expect(headOf()).toEqual(['#', 'Type', 'Item', 'Qty', 'Unit Cost', 'Value']);

    // Button parent + its 2 variants, then Zipper parent + 1 variant — Button holds
    // position 1 because that is where its first variant appeared.
    expect(rows.map(isParent)).toEqual([true, false, false, true, false]);
    expect(text(rows[0])).toEqual(['1', 'Trim', 'Button  (BUTTON-1)  ·  2 variants', '50 pcs', 'Rs. 2.00', 'Rs. 100.00']);
    expect(text(rows[1])[2]).toBe('   · Red');
    expect(text(rows[2])[2]).toBe('   · Blue');
    expect(text(rows[3])).toEqual(['2', 'Trim', 'Zipper  (ZIPPER-1)  ·  1 variant', '5 pcs', 'Rs. 20.00', 'Rs. 100.00']);
    expect(text(rows[4])[2]).toBe('   · Black');
});

it('leaves the parent unit cost blank when variants disagree, but still totals the group', async () => {
    await generateIssueSlipPdf({
        issue: {
            id: 1, issue_number: 'IS-2', total_value: 30,
            lines: [trim('Button', 'Red', 10, 1), trim('Button', 'Blue', 10, 2)],
        },
    });

    const [parent] = bodyOf();
    expect(text(parent)[3]).toBe('20 pcs');
    expect(text(parent)[4]).toBe('');                 // mixed costs — a single number would lie
    expect(text(parent)[5]).toBe('Rs. 30.00');
});

it('keeps general items flat and drops cost columns on a qty-only slip', async () => {
    await generateIssueSlipPdf({
        issue: {
            id: 1, issue_number: 'IS-3',
            lines: [
                { item_kind: 'general', item_name: 'Scissors', item_code: 'SC-9', qty: 3, uom: 'pcs' },
                trim('Button', 'Red', 10, 0),
            ],
        },
    });

    const rows = bodyOf();
    expect(headOf()).toEqual(['#', 'Type', 'Item', 'Qty']);
    expect(text(rows[0])).toEqual(['1', 'General', 'Scissors  (SC-9)', '3 pcs']);
    expect(rows[0].every(c => typeof c === 'string')).toBe(true);   // no parent styling
    expect(text(rows[1])).toEqual(['2', 'Trim', 'Button  (BUTTON-1)  ·  1 variant', '10 pcs']);
    expect(text(rows[2])).toEqual(['', '', '   · Red', '10 pcs']);
});

it('labels a variant with no colour rather than dropping the row', async () => {
    await generateIssueSlipPdf({
        issue: {
            id: 1, issue_number: 'IS-4', total_value: 10,
            lines: [trim('Button', null, 5, 2, { variant_size: 'L', variant_color_number: 'C7' })],
        },
    });
    expect(text(bodyOf()[1])[2]).toBe('   · No variant (C7) · Sz L');
});
