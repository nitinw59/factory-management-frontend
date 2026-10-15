// <datalist> of store locations (Settings → Stores) for location inputs: list="v3-locations-<area>".
// Suggestions only — a new place can still be typed. Loads once per page; missing access = no list.
import { useEffect, useState } from 'react';
import { settingsApi } from '../api/settingsApi';

export default function LocationList({ area }) {
    const [rows, setRows] = useState([]);
    useEffect(() => { settingsApi.locations(area).then(res => setRows(res.data)).catch(() => setRows([])); }, [area]);
    return <datalist id={`v3-locations-${area}`}>{rows.map(l => <option key={l.code} value={l.code}>{l.name || ''}</option>)}</datalist>;
}
