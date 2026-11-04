// A purchasing scan behind login (4 Nov 2026): the file is read with the user's token and opened in a new tab. The tab is
// opened on the click itself, or the browser's popup blocker stops it.
import { useState } from 'react';
import api from '../../utils/api';

export default function DocumentLink({ path, name }) {
    const [failed, setFailed] = useState(false);
    const open = async () => {
        setFailed(false);
        const tab = window.open('', '_blank');
        try {
            const res = await api.get(path, { responseType: 'blob' });
            const url = URL.createObjectURL(res.data);
            if (tab) tab.location.href = url; else window.location.href = url;
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch {
            if (tab) tab.close();
            setFailed(true);
        }
    };
    return (
        <>
            <button type="button" onClick={open} className="text-indigo-700 hover:underline text-left">{name}</button>
            {failed && <span className="text-xs text-rose-700"> Could not open the file.</span>}
        </>
    );
}
