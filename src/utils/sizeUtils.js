export const SIZE_MAPPING = {
    's':    '28',
    'm':    '30',
    'l':    '32',
    'xl':   '34',
    'xxl':  '36',
    'xxxl': '38',
    '4xl':  '40',
    '5xl':  '42',
    '6xl':  '44',
};

export const stdSize = (sizeStr) => {
    if (!sizeStr) return '';
    const clean = String(sizeStr).trim().toLowerCase();
    const mapped = SIZE_MAPPING[clean];
    return mapped ? String(mapped).toUpperCase() : clean.toUpperCase();
};
