export default function formatDateDDMMYYYY(val) {
    if (!val) return null;
    try {
        if (val instanceof Date) {
            if (isNaN(val.getTime())) return null;
            const d = String(val.getDate()).padStart(2, '0');
            const m = String(val.getMonth() + 1).padStart(2, '0');
            const y = val.getFullYear();
            return `${d}-${m}-${y}`;
        }
        const s = String(val).trim();
        if (!s) return null;
        const dateOnly = s.split('T')[0].split(' ')[0];
        const parts = dateOnly.split('-');
        if (parts.length === 3) {
            if (parts[0].length === 4 && parts[1].length <= 2 && parts[2].length <= 2) {
                return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
            }
            if (parts[0].length <= 2 && parts[1].length <= 2 && parts[2].length === 4) {
                return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
            }
        }
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
            const dStr = String(d.getDate()).padStart(2, '0');
            const mStr = String(d.getMonth() + 1).padStart(2, '0');
            return `${dStr}-${mStr}-${d.getFullYear()}`;
        }
        return s;
    } catch {
        return null;
    }
}