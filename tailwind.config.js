// Tailwind is compiled at build time (react-scripts picks this file up
// automatically). It replaces the runtime Play CDN (cdn.tailwindcss.com),
// which re-generated CSS in every tablet's browser on each DOM change.
// Version is pinned to 3.4.17 — the exact version the CDN served — and the
// config is the CDN's default (no theme changes, no plugins), so pages look
// the same.
/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
    // Class names assembled at runtime can't be found by scanning the source:
    //  - PreparationManagerDashboardPage: text-${color} / bg-${color}-100
    //  - BomDashboardPage Spinner: h-${h} (default 64)
    safelist: [
        'text-green-500', 'text-blue-500', 'text-gray-500',
        'bg-green-100', 'bg-blue-100', 'bg-gray-100',
        'h-64',
    ],
    theme: { extend: {} },
    plugins: [],
};
