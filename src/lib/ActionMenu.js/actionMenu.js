"use client"

import { useEffect, useRef, useState } from "react";

// ─── Three-dots Action Menu (fixed-position so table overflow can't clip it) ─
export default function ActionMenu({ items }) {
    const [pos, setPos] = useState(null);
    const btnRef = useRef(null);

    useEffect(() => {
        if (!pos) return;
        const close = () => setPos(null);
        window.addEventListener('click', close);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => {
            window.removeEventListener('click', close);
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [pos]);

    function toggle(e) {
        e.stopPropagation();
        if (pos) return setPos(null);
        const r = btnRef.current.getBoundingClientRect();
        const menuH = items.length * 36 + 8;
        const top = r.bottom + menuH > window.innerHeight ? r.top - menuH - 4 : r.bottom + 4;
        setPos({ top, left: Math.max(8, r.right - 160) });
    }

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={toggle}
                title="Actions"
                style={{ padding: '4px 8px', fontSize: 16, fontWeight: 800, lineHeight: 1 }}
            >
                ⋮
            </button>
            {pos && (
                <div
                    onClick={e => e.stopPropagation()}
                    style={{
                        position: 'fixed', top: pos.top, left: pos.left, width: 160, zIndex: 2000,
                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                        boxShadow: '0 10px 25px rgba(0,0,0,0.15)', padding: 4,
                    }}
                >
                    {items.map(it => (
                        <button
                            key={it.key}
                            type="button"
                            disabled={it.disabled}
                            onClick={() => { setPos(null); it.onClick(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 36,
                                padding: '0 10px', border: 'none', background: 'transparent', borderRadius: 6,
                                cursor: it.disabled ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
                                color: it.color || '#1e293b', textAlign: 'left',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                            {it.icon} {it.label}
                        </button>
                    ))}
                </div>
            )}
        </>
    );
}