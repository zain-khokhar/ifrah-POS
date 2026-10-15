'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Truck, CheckCircle2, RotateCcw, AlertCircle, Search, RefreshCw,
  Clock, Calendar, User, Phone, Check, X, ShieldAlert, DollarSign,
  PackageCheck, Printer, Download, FileText, Filter, ChevronDown,
} from 'lucide-react';
import ReceiptModal from '@/components/ReceiptModal';

const FILTERS = [
  { id: 'today',     label: 'Aaj (Today)' },
  { id: 'tomorrow',  label: 'Kal (Tomorrow)' },
  { id: 'next2days', label: 'Agley 2 Din' },
  { id: 'upcoming',  label: 'Agley 7 Din' },
  { id: 'pending',   label: 'Pending' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'custom',    label: 'Custom Range' },
  { id: 'all',       label: 'Sabhi' },
];

/** Build a human-readable attachment list from a booking item.
 *  New bookings: stored as JSON array in `it.attachments`
 *  Old bookings: stored as boolean columns (jewellery, clutch_purse, etc.)
 */
function getAttachments(it) {
  // 1. Try the new JSON attachments column first
  if (it.attachments) {
    try {
      const parsed = typeof it.attachments === 'string'
        ? JSON.parse(it.attachments)
        : it.attachments;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(s => String(s).trim()).filter(Boolean);
      }
    } catch (_) {
      // CSV fallback
      const csv = String(it.attachments).split(',').map(s => s.trim()).filter(Boolean);
      if (csv.length > 0) return csv;
    }
  }
  // 2. Fall back to legacy boolean columns (old bookings)
  const acc = [];
  if (it.jewellery)      acc.push('Jewellery');
  if (it.clutch_purse)   acc.push('Purse');
  if (it.hand_bag)       acc.push('Bag');
  if (it.double_dupatta) acc.push('2x Dupatta');
  if (it.shoes)          acc.push('Shoes');
  return acc;
}

/** Map dress condition_status to a colour badge config */
function getDressConditionBadge(status) {
  switch (String(status || 'fresh').toLowerCase()) {
    case 'fresh':
      return { label: '✨ Fresh', color: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd' };
    case 'good':
      return { label: '✓ Good', color: '#15803d', bg: '#dcfce7', border: '#86efac' };
    case 'need_dry_clean':
      return { label: '🧺 Dry-Clean', color: '#b45309', bg: '#fef3c7', border: '#fde68a' };
    case 'need_repair':
      return { label: '🔧 Repair', color: '#b91c1c', bg: '#fee2e2', border: '#fca5a5' };
    default:
      return { label: status || 'Unknown', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' };
  }
}

function DeliveriesContent() {
  const searchParams = useSearchParams();
  const initialFilter = searchParams?.get('filter') || 'today';

  const [filter, setFilter]         = useState(initialFilter);
  const [search, setSearch]         = useState('');
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [userRole, setUserRole]     = useState('viewer');

  // Custom date range
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo]     = useState('');
  const [showCustomRange, setShowCustomRange] = useState(false);
  // Status filter (pending | delivered | '') that combines with Custom Range
  const [statusFilter, setStatusFilter] = useState('');

  // Readiness sub-filters (UI only — applied after fetch)
  const [showFullyReady, setShowFullyReady]     = useState(false);
  const [showPendingReady, setShowPendingReady] = useState(false);

  // Export State
  const [exportingPdf, setExportingPdf]     = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [actionMessage, setActionMessage]   = useState('');

  // Mark Delivered Modal State
  const [deliveryModalItem, setDeliveryModalItem] = useState(null);
  const [deliveryDate, setDeliveryDate]           = useState('');
  const [deliveryNote, setDeliveryNote]           = useState('');
  const [submittingDelivery, setSubmittingDelivery] = useState(false);

  // Receipt Modal State
  const [receiptBookingId, setReceiptBookingId]   = useState(null);
  const [togglingItemId, setTogglingItemId]       = useState(null);

  // Condition Confirmation Modal State (When marking ready on repair/dry-clean dress)
  const [conditionModalItem, setConditionModalItem]             = useState(null);
  const [targetConditionStatus, setTargetConditionStatus]       = useState('good');
  const [submittingConditionReady, setSubmittingConditionReady] = useState(false);

  const reloadRef = useRef(null);

  useEffect(() => {
    window.electronAPI?.auth?.session().then(r => {
      if (r?.ok) setUserRole(r.user.role);
    });
  }, []);

  useEffect(() => {
    // Show/hide custom range picker when filter changes
    setShowCustomRange(filter === 'custom');
  }, [filter]);

  useEffect(() => {
    // When switching away from custom, clear the dates so they don't affect other filters
    if (filter !== 'custom') {
      setCustomFrom('');
      setCustomTo('');
      setStatusFilter('');
    }
  }, [filter]);

  useEffect(() => {
    async function fetchDeliveries() {
      // For custom range, only fetch if dates are set
      if (filter === 'custom' && !customFrom) return;

      setLoading(true);
      try {
        const payload = { filter, search };
        if (filter === 'custom' && customFrom) {
          payload.dateFrom = customFrom;
          payload.dateTo   = customTo || customFrom;
          if (statusFilter) payload.statusFilter = statusFilter;
        }

        let res = await window.electronAPI?.tracking?.listDeliveries(payload);
        let data = res?.ok && Array.isArray(res.data) ? res.data : [];

        // Fallback for next2days
        if (filter === 'next2days' && data.length === 0) {
          const upRes = await window.electronAPI?.tracking?.listDeliveries({
            filter: 'upcoming',
            search,
          });
          if (upRes?.ok && Array.isArray(upRes.data)) {
            const today = new Date().toISOString().slice(0, 10);
            const future = new Date();
            future.setDate(future.getDate() + 2);
            const next2Iso = future.toISOString().slice(0, 10);
            data = upRes.data.filter(b => b.delivery_date >= today && b.delivery_date <= next2Iso);
          }
        }

        setDeliveries(data);
      } catch (err) {
        console.error('Failed to load deliveries:', err);
        setDeliveries([]);
      } finally {
        setLoading(false);
      }
    }
    reloadRef.current = fetchDeliveries;
    fetchDeliveries();
  }, [filter, search, customFrom, customTo, statusFilter]);

  // Per-item "Ready / Prepared" toggle (Night-before prep)
  async function handleToggleReady(itemId, currentVal, conditionStatus = null) {
    if (userRole === 'viewer') return;
    setTogglingItemId(itemId);
    try {
      const payload = {
        itemId,
        isReady: !currentVal,
      };
      if (conditionStatus) payload.conditionStatus = conditionStatus;

      const res = await window.electronAPI?.tracking?.toggleItemReady(payload);
      if (res?.ok) {
        setDeliveries(prev => prev.map(b => {
          const itemIdx = b.items?.findIndex(it => it.id === itemId);
          if (itemIdx === -1 || itemIdx === undefined) return b;
          const updatedItems = [...b.items];
          const updatedItem = {
            ...updatedItems[itemIdx],
            is_ready: !currentVal ? 1 : 0,
          };
          if (conditionStatus) {
            updatedItem.dress_condition_status = conditionStatus;
            updatedItem.item_condition = conditionStatus;
          }
          updatedItems[itemIdx] = updatedItem;
          const readyCount = updatedItems.filter(it => it.is_ready === 1).length;
          return {
            ...b,
            items: updatedItems,
            ready_items: readyCount,
            all_ready: readyCount === updatedItems.length,
          };
        }));
      } else {
        alert(res?.message || 'Ready status update nahi ho saka.');
      }
    } catch (err) {
      alert(err.message || 'Error occurred');
    } finally {
      setTogglingItemId(null);
    }
  }

  // Intercept Ready click: if dress needs dry-clean or repair, prompt for confirmation & condition update
  function handleReadyClick(item, isReady) {
    if (userRole === 'viewer') return;
    if (isReady) {
      // Unchecking ready — no confirmation needed
      handleToggleReady(item.id, true);
      return;
    }

    const cond = String(item.dress_condition_status || '').toLowerCase().trim();
    const needsAttention = cond === 'need_dry_clean' ||
                           cond === 'need_repair' ||
                           cond.includes('dry') ||
                           cond.includes('repair') ||
                           cond.includes('damage');

    if (needsAttention) {
      setTargetConditionStatus('good');
      setConditionModalItem({ item });
    } else {
      handleToggleReady(item.id, false);
    }
  }

  // Confirm condition update & mark ready in DB
  async function handleConfirmConditionAndReady() {
    if (!conditionModalItem || submittingConditionReady) return;
    const { item } = conditionModalItem;
    const newStatus = targetConditionStatus || 'good';
    setSubmittingConditionReady(true);
    try {
      // 1. Update live dress record in dresses table
      if (item.dress_id) {
        await window.electronAPI?.dresses?.updateCondition(
          item.dress_id,
          newStatus,
          `Marked ready from Delivery Tracker (Condition updated to ${newStatus})`
        );
      }

      // 2. Toggle item ready in tracking (also updates booking_items and dresses in DB)
      const res = await window.electronAPI?.tracking?.toggleItemReady({
        itemId: item.id,
        isReady: true,
        conditionStatus: newStatus,
      });

      if (res?.ok) {
        // 3. Update local state
        setDeliveries(prev => prev.map(b => {
          const itemIdx = b.items?.findIndex(it => it.id === item.id);
          if (itemIdx === -1 || itemIdx === undefined) return b;
          const updatedItems = [...b.items];
          updatedItems[itemIdx] = {
            ...updatedItems[itemIdx],
            is_ready: 1,
            dress_condition_status: newStatus,
            item_condition: newStatus,
          };
          const readyCount = updatedItems.filter(it => it.is_ready === 1).length;
          return {
            ...b,
            items: updatedItems,
            ready_items: readyCount,
            all_ready: readyCount === updatedItems.length,
          };
        }));
        setConditionModalItem(null);
        setActionMessage(`✓ Dress '${item.dress_name_snapshot}' condition updated to ${newStatus === 'fresh' ? 'Fresh' : 'Good'} and marked Ready in DB!`);
      } else {
        alert(res?.message || 'Ready status update nahi ho saka.');
      }
    } catch (err) {
      alert(err.message || 'Error occurred updating dress status');
    } finally {
      setSubmittingConditionReady(false);
    }
  }

  // Open Mark Delivered Modal
  function openDeliveryModal(booking) {
    setDeliveryModalItem(booking);
    setDeliveryDate(new Date().toISOString().slice(0, 10));
    setDeliveryNote('');
  }

  // Confirm Mark Delivered
  async function handleConfirmDelivered() {
    if (!deliveryModalItem) return;
    setSubmittingDelivery(true);
    try {
      const res = await window.electronAPI?.tracking?.markDelivered({
        bookingId: deliveryModalItem.id,
        deliveredOn: deliveryDate,
        deliveryNote: deliveryNote.trim(),
        allItemsReady: true,
      });
      if (res?.ok) {
        setDeliveryModalItem(null);
        await reloadRef.current?.();
      } else {
        alert(res?.message || 'Delivery mark nahi ho saki.');
      }
    } catch (err) {
      alert(err.message || 'Delivery mark karte waqt error aaya.');
    } finally {
      setSubmittingDelivery(false);
    }
  }

  // Unmark Delivered
  async function handleUnmarkDelivered(bookingId) {
    if (userRole === 'viewer') return;
    if (!window.confirm('Kya aap waqai is booking ki delivery wapas "Pending" karna chahte hain?')) {
      return;
    }
    try {
      const res = await window.electronAPI?.tracking?.unmarkDelivered(bookingId);
      if (res?.ok) {
        await reloadRef.current?.();
      } else {
        alert(res?.message || 'Unmark nahi ho saka.');
      }
    } catch (err) {
      alert(err.message || 'Error occurred');
    }
  }

  // Export to PDF handler
  async function handleExportPdf() {
    setExportingPdf(true);
    setActionMessage('');
    try {
      const filters = {
        filter,
        range: filter,
        search: search || '',
        excludeDelivered: filter !== 'delivered' && filter !== 'all',
      };
      if (filter === 'custom' && customFrom) {
        filters.dateFrom = customFrom;
        filters.dateTo   = customTo || customFrom;
        if (statusFilter) {
          filters.statusFilter = statusFilter;
          filters.excludeDelivered = false;
        } else {
          filters.excludeDelivered = false; // custom range + no status = all in range
        }
      }
      // Pass readiness sub-filters
      if (showFullyReady)     filters.readinessFilter = 'fully_ready';
      else if (showPendingReady) filters.readinessFilter = 'pending_ready';

      const res = await window.electronAPI?.reports?.exportPdf({
        reportType: 'delivery_sheet',
        filters,
      });
      if (res?.ok && !res.canceled) {
        setActionMessage(`✓ Delivery Sheet PDF saved successfully: ${res.filePath}`);
      } else if (!res?.canceled && res?.message) {
        alert(res.message);
      }
    } catch (err) {
      alert(`PDF export failed: ${err.message}`);
    } finally {
      setExportingPdf(false);
    }
  }

  // Export to Excel handler
  async function handleExportExcel() {
    setExportingExcel(true);
    setActionMessage('');
    try {
      const filters = {
        filter,
        range: filter,
        search: search || '',
        excludeDelivered: filter !== 'delivered' && filter !== 'all',
      };
      if (filter === 'custom' && customFrom) {
        filters.dateFrom = customFrom;
        filters.dateTo   = customTo || customFrom;
        if (statusFilter) filters.statusFilter = statusFilter;
        filters.excludeDelivered = false;
      }
      if (showFullyReady)     filters.readinessFilter = 'fully_ready';
      else if (showPendingReady) filters.readinessFilter = 'pending_ready';

      const res = await window.electronAPI?.reports?.exportExcel({
        reportType: 'delivery_sheet',
        filters,
      });
      if (res?.ok && !res.canceled) {
        setActionMessage(`✓ Delivery Sheet Excel saved successfully: ${res.filePath}`);
      } else if (!res?.canceled && res?.message) {
        alert(res.message);
      }
    } catch (err) {
      alert(`Excel export failed: ${err.message}`);
    } finally {
      setExportingExcel(false);
    }
  }

  // ── Derived display data ────────────────────────────────────────────────

  // Base filter (delivered / not delivered)
  let baseDeliveries = deliveries.filter(d => {
    if (filter === 'custom') {
      if (statusFilter === 'pending')   return !d.delivered_on;
      if (statusFilter === 'delivered') return Boolean(d.delivered_on);
      return true;
    }
    if (filter === 'delivered') return Boolean(d.delivered_on);
    if (filter === 'all') return true;
    return !d.delivered_on;
  });

  // Apply readiness sub-filters (only one can be active at a time)
  let displayedDeliveries = baseDeliveries;
  if (showFullyReady && !showPendingReady) {
    displayedDeliveries = baseDeliveries.filter(d => {
      const total = d.items?.length ?? d.total_items ?? 0;
      const ready = d.items?.filter(it => it.is_ready === 1).length ?? d.ready_items ?? 0;
      return total > 0 && ready === total;
    });
  } else if (showPendingReady && !showFullyReady) {
    displayedDeliveries = baseDeliveries.filter(d => {
      const total = d.items?.length ?? d.total_items ?? 0;
      const ready = d.items?.filter(it => it.is_ready === 1).length ?? d.ready_items ?? 0;
      return total === 0 || ready < total;
    });
  }

  const deliveredCount = deliveries.filter(d => Boolean(d.delivered_on)).length;
  const pendingCount   = displayedDeliveries.length;

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Deliveries Tracker</h1>
          <p className="page-subtitle">Dresses ki tayyari aur customer ko delivery ka record</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => reloadRef.current?.()}
            title="Refresh Karein"
            style={{ gap: 5 }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
          </button>

          {/* Export to PDF */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleExportPdf}
            disabled={exportingPdf}
            title="Daily Delivery Sheet format mein PDF export karein"
            style={{ gap: 6, fontWeight: 600, color: '#0f172a' }}
          >
            <FileText size={13} style={{ color: '#7c3aed' }} />
            {exportingPdf ? 'Exporting...' : 'Export to PDF'}
          </button>

          {/* Export to Excel */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleExportExcel}
            disabled={exportingExcel}
            title="Daily Delivery Sheet format mein Excel export karein"
            style={{ gap: 6, fontWeight: 600, color: '#0f172a' }}
          >
            <Download size={13} style={{ color: '#10b981' }} />
            {exportingExcel ? 'Exporting...' : 'Export to Excel'}
          </button>

          <span className="badge badge-warning" style={{ padding: '6px 12px', fontSize: 13 }}>
            {pendingCount} Pending
          </span>
          <span className="badge badge-success" style={{ padding: '6px 12px', fontSize: 13 }}>
            {deliveredCount} Delivered
          </span>
        </div>
      </div>

      <div className="page-body">
        {/* Action Message Banner */}
        {actionMessage && (
          <div style={{
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span>{actionMessage}</span>
            <button
              onClick={() => setActionMessage('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46', padding: 0 }}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* ── Filters & Search Bar ──────────────────────────── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FILTERS.map(f => {
              const isStatusChip = f.id === 'pending' || f.id === 'delivered';
              // In custom mode, Pending/Delivered chips act as an extra status filter
              const active = filter === 'custom' && isStatusChip
                ? statusFilter === f.id
                : filter === f.id;
              return (
              <button
                key={f.id}
                onClick={() => {
                  if (filter === 'custom' && isStatusChip) {
                    setStatusFilter(prev => (prev === f.id ? '' : f.id));
                  } else {
                    setFilter(f.id);
                  }
                }}
                title={filter === 'custom' && isStatusChip ? 'Custom Range ke saath combine hoga (dobara click = hata dein)' : undefined}
                className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  fontWeight: active ? 700 : 500,
                  fontSize: 12.5,
                  padding: '5px 12px',
                  borderRadius: 20,
                  ...(f.id === 'custom' && filter === f.id ? { background: '#7c3aed', color: 'white' } : {}),
                }}
              >
                {f.id === 'custom' && <Calendar size={12} style={{ marginRight: 4, display: 'inline' }} />}
                {f.label}
              </button>
              );
            })}
          </div>

          <div style={{ position: 'relative', width: 280, maxWidth: '100%' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94a3b8',
                pointerEvents: 'none',
              }}
            />
            <input
              className="form-input"
              style={{ paddingLeft: 36, height: 36, fontSize: 13 }}
              placeholder="Search booking #, customer, phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ── Custom Date Range Picker ───────────────────────── */}
        {showCustomRange && (
          <div style={{
            background: '#f5f3ff',
            border: '1px solid #ddd6fe',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={14} color="#7c3aed" />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#6d28d9' }}>Custom Date Range:</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>From:</label>
              <input
                type="date"
                className="form-input"
                style={{ height: 32, fontSize: 12.5, padding: '4px 10px', width: 150 }}
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>To:</label>
              <input
                type="date"
                className="form-input"
                style={{ height: 32, fontSize: 12.5, padding: '4px 10px', width: 150 }}
                value={customTo}
                min={customFrom}
                onChange={e => setCustomTo(e.target.value)}
              />
            </div>
            {customFrom && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => reloadRef.current?.()}
                style={{ fontSize: 12, padding: '5px 14px' }}
              >
                Apply
              </button>
            )}
            {!customFrom && (
              <span style={{ fontSize: 11.5, color: '#94a3b8', fontStyle: 'italic' }}>
                Select a start date to load results
              </span>
            )}
            {customFrom && (
              <span style={{ fontSize: 11.5, color: '#6d28d9', fontWeight: 600 }}>
                Status: {statusFilter === 'pending' ? 'Pending' : statusFilter === 'delivered' ? 'Delivered' : 'Sabhi'} (upar Pending / Delivered se badlein)
              </span>
            )}
          </div>
        )}

        {/* ── Readiness Sub-Filters ──────────────────────────── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          marginBottom: 14,
          background: '#fafafa',
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          padding: '8px 14px',
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Filter size={13} color="#7c3aed" />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Readiness Filter:</span>
          </div>

          {/* Fully Ready checkbox */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            cursor: 'pointer',
            fontSize: 12.5,
            fontWeight: showFullyReady ? 700 : 500,
            color: showFullyReady ? '#065f46' : '#334155',
            background: showFullyReady ? '#ecfdf5' : 'transparent',
            border: showFullyReady ? '1px solid #a7f3d0' : '1px solid transparent',
            borderRadius: 6,
            padding: '4px 10px',
            transition: 'all 0.15s',
          }}>
            <input
              type="checkbox"
              checked={showFullyReady}
              onChange={e => {
                setShowFullyReady(e.target.checked);
                if (e.target.checked) setShowPendingReady(false);
              }}
              style={{ cursor: 'pointer', accentColor: '#10b981' }}
            />
            <CheckCircle2 size={13} color={showFullyReady ? '#10b981' : '#94a3b8'} />
            Fully Ready Bookings
          </label>

          {/* Pending Ready checkbox */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            cursor: 'pointer',
            fontSize: 12.5,
            fontWeight: showPendingReady ? 700 : 500,
            color: showPendingReady ? '#92400e' : '#334155',
            background: showPendingReady ? '#fef3c7' : 'transparent',
            border: showPendingReady ? '1px solid #fde68a' : '1px solid transparent',
            borderRadius: 6,
            padding: '4px 10px',
            transition: 'all 0.15s',
          }}>
            <input
              type="checkbox"
              checked={showPendingReady}
              onChange={e => {
                setShowPendingReady(e.target.checked);
                if (e.target.checked) setShowFullyReady(false);
              }}
              style={{ cursor: 'pointer', accentColor: '#f59e0b' }}
            />
            <Clock size={13} color={showPendingReady ? '#f59e0b' : '#94a3b8'} />
            To-Be-Ready (Pending Ready)
          </label>

          {(showFullyReady || showPendingReady) && (
            <button
              onClick={() => { setShowFullyReady(false); setShowPendingReady(false); }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 11.5,
                color: '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                padding: '2px 6px',
              }}
            >
              <X size={12} /> Clear
            </button>
          )}

          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#94a3b8' }}>
            {displayedDeliveries.length} booking(s) shown
          </span>
        </div>

        {/* ── Deliveries Table ──────────────────────────────── */}
        <div className="card">
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 10 }} />
              <div>Deliveries load ho rahi hain...</div>
            </div>
          ) : displayedDeliveries.length === 0 ? (
            <div style={{ padding: 56, textAlign: 'center', color: '#94a3b8' }}>
              <Truck size={48} style={{ opacity: 0.35, marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                Koi delivery nahi mili
              </div>
              <div style={{ fontSize: 13 }}>
                {filter === 'today'
                  ? 'Aaj ki date mein koi delivery scheduled nahi hai (ya sabhi deliver ho chuki hain).'
                  : filter === 'custom' && !customFrom
                  ? 'Custom range ke liye pehle date select karein.'
                  : 'Selected filter ke mutabiq koi record mojood nahi.'}
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Booking #</th>
                    <th>Customer</th>
                    <th>Delivery Date</th>
                    <th>Return Date</th>
                    <th>Dresses & Preparation (Night-before Ready)</th>
                    <th style={{ textAlign: 'right' }}>Payment Due</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedDeliveries.map(d => {
                    const isDelivered = Boolean(d.delivered_on);
                    const remainingDue = Number(d.remaining || 0);

                    // Readiness logic
                    const totalItems = d.items?.length ?? d.total_items ?? 0;
                    const readyItems = d.items?.filter(it => it.is_ready === 1).length ?? d.ready_items ?? 0;
                    const isFullyReady = totalItems > 0 && readyItems === totalItems;
                    const isPendingReady = totalItems === 0 || readyItems < totalItems;

                    return (
                      <tr key={d.id} style={{ background: isDelivered ? '#fafafa' : '#ffffff' }}>
                        {/* Booking # */}
                        <td>
                          <Link
                            href={`/bookings/new?id=${d.id}`}
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 800,
                              color: '#7c3aed',
                              fontSize: 14,
                              textDecoration: 'none',
                            }}
                            title="Open Booking"
                          >
                            #{d.booking_no}
                          </Link>
                          {d.status && (
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                              {d.status}
                            </div>
                          )}
                        </td>

                        {/* Customer */}
                        <td>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5 }}>
                            {d.customer_name || '—'}
                          </div>
                          <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <Phone size={11} /> {d.customer_phone || '—'}
                          </div>
                          {d.city && (
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{d.city}</div>
                          )}
                        </td>

                        {/* Delivery Date */}
                        <td>
                          <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 13 }}>
                            {d.delivery_date}
                          </div>
                          {d.delivered_on && (
                            <div style={{ fontSize: 11, color: '#16a34a', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                              <Check size={11} /> Delivered: {d.delivered_on}
                            </div>
                          )}
                        </td>

                        {/* Return Date */}
                        <td>
                          <div style={{ fontSize: 13, color: '#475569' }}>
                            {d.returning_date || '—'}
                          </div>
                        </td>

                        {/* Dresses & Night-before Prep Checklist */}
                        <td style={{ minWidth: 280 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {d.items && d.items.length > 0 ? (
                              d.items.map(it => {
                                const isReady = Boolean(it.is_ready);
                                const attachments = getAttachments(it);
                                return (
                                  <div
                                    key={it.id}
                                    style={{
                                      padding: '5px 8px',
                                      borderRadius: 6,
                                      background: isReady ? '#ecfdf5' : '#f8fafc',
                                      border: isReady ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                                      fontSize: 12,
                                    }}
                                  >
                                     {/* Dress row with checkbox */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                      <input
                                        type="checkbox"
                                        checked={isReady}
                                        disabled={userRole === 'viewer' || togglingItemId === it.id}
                                        onChange={() => handleReadyClick(it, isReady)}
                                        title="Night-before Preparation Ready Tick"
                                        style={{ cursor: userRole === 'viewer' ? 'default' : 'pointer', flexShrink: 0 }}
                                      />
                                      <span style={{
                                        fontWeight: isReady ? 700 : 500,
                                        color: isReady ? '#065f46' : '#334155',
                                        flex: 1,
                                      }}>
                                        {it.dress_name_snapshot}
                                        {it.size ? ` (${it.size})` : ''}
                                      </span>
                                      {/* Live dress condition badge */}
                                      {(() => {
                                        const cond = getDressConditionBadge(it.dress_condition_status);
                                        return (
                                          <span title={`Dress Condition: ${it.dress_condition_status || 'fresh'}`} style={{
                                            fontSize: 9.5,
                                            fontWeight: 700,
                                            color: cond.color,
                                            background: cond.bg,
                                            border: `1px solid ${cond.border}`,
                                            borderRadius: 8,
                                            padding: '1px 7px',
                                            whiteSpace: 'nowrap',
                                          }}>
                                            {cond.label}
                                          </span>
                                        );
                                      })()}
                                      {isReady ? (
                                        <span style={{ fontSize: 10, fontWeight: 700, color: '#059669', background: '#d1fae5', padding: '1px 6px', borderRadius: 10, whiteSpace: 'nowrap' }}>
                                          ✓ Ready
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          disabled={userRole === 'viewer' || togglingItemId === it.id}
                                          onClick={() => handleReadyClick(it, false)}
                                          style={{
                                            fontSize: 9.5,
                                            fontWeight: 600,
                                            color: '#475569',
                                            background: '#f1f5f9',
                                            border: '1px solid #cbd5e1',
                                            borderRadius: 8,
                                            padding: '1px 6px',
                                            cursor: userRole === 'viewer' ? 'default' : 'pointer',
                                            whiteSpace: 'nowrap',
                                          }}
                                          title="Click to mark this dress ready"
                                        >
                                          Ready?
                                        </button>
                                      )}
                                    </div>
                                    {/* Attachments row */}
                                    {attachments.length > 0 && (
                                      <div style={{ marginTop: 3, marginLeft: 22, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                        {attachments.map(att => (
                                          <span
                                            key={att}
                                            style={{
                                              fontSize: 10,
                                              color: '#6d28d9',
                                              background: '#f5f3ff',
                                              border: '1px solid #ddd6fe',
                                              borderRadius: 6,
                                              padding: '1px 6px',
                                              fontWeight: 600,
                                            }}
                                          >
                                            • {att}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            ) : (
                              <span style={{ color: '#64748b', fontSize: 12 }}>
                                {d.dresses_summary || 'Koi dress nahi'}
                              </span>
                            )}
                          </div>
                          {d.delivery_note && (
                            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 4, fontStyle: 'italic' }}>
                              Note: {d.delivery_note}
                            </div>
                          )}
                        </td>

                        {/* Payment Remaining Due */}
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, fontSize: 14, color: remainingDue > 0 ? '#dc2626' : '#16a34a' }}>
                            {remainingDue > 0 ? `Rs. ${remainingDue.toLocaleString()}` : 'Fully Paid ✓'}
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                            Total: Rs. {Number(d.grand_total || 0).toLocaleString()}
                          </div>
                          {d.security_deposit > 0 && (
                            <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 1 }}>
                              Deposit: Rs. {Number(d.security_deposit).toLocaleString()}
                            </div>
                          )}
                        </td>

                        {/* Status Badge — Pending Ready / Fully Ready / Delivered */}
                        <td>
                          {isDelivered ? (
                            <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <CheckCircle2 size={12} /> Delivered
                            </span>
                          ) : isFullyReady ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              background: '#ecfdf5', color: '#065f46',
                              border: '1px solid #a7f3d0', borderRadius: 6,
                              padding: '3px 8px', fontSize: 11.5, fontWeight: 700,
                            }}>
                              <PackageCheck size={12} /> Fully Ready
                            </span>
                          ) : (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              background: '#fef3c7', color: '#92400e',
                              border: '1px solid #fde68a', borderRadius: 6,
                              padding: '3px 8px', fontSize: 11.5, fontWeight: 700,
                            }}>
                              <Clock size={12} /> Pending Ready
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => setReceiptBookingId(d.id)}
                              title="Print Receipt"
                              style={{ padding: '4px 8px' }}
                            >
                              <Printer size={13} />
                            </button>

                            {userRole !== 'viewer' && (
                              !isDelivered ? (
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => openDeliveryModal(d)}
                                  style={{
                                    background: '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    fontWeight: 700,
                                    fontSize: 12,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    padding: '5px 10px',
                                    borderRadius: 6,
                                  }}
                                >
                                  <CheckCircle2 size={13} /> Mark Delivered
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleUnmarkDelivered(d.id)}
                                  title="Ghalati theek karein (Undo Delivered)"
                                  style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '4px 8px', fontSize: 11 }}
                                >
                                  Undo
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── MARK DELIVERED MODAL ────────────────────────────── */}
      {deliveryModalItem && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="card" style={{ width: 480, maxWidth: '95%', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Truck size={20} color="#10b981" />
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#0f172a' }}>
                  Mark as Delivered — #{deliveryModalItem.booking_no}
                </h3>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setDeliveryModalItem(null)}
                style={{ padding: 4, borderRadius: '50%' }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                Customer: {deliveryModalItem.customer_name} ({deliveryModalItem.customer_phone})
              </div>
              <div style={{ color: '#64748b' }}>
                Dresses: {deliveryModalItem.dresses_summary || '—'}
              </div>
            </div>

            {/* Remaining Balance Alert */}
            {Number(deliveryModalItem.remaining || 0) > 0 && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                padding: 12, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center',
              }}>
                <DollarSign size={20} color="#dc2626" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: 13, color: '#991b1b' }}>
                  <div style={{ fontWeight: 800 }}>
                    Baqi Raqam (Remaining Balance): Rs. {Number(deliveryModalItem.remaining).toLocaleString()}
                  </div>
                  <div>Customer se dress deliver karte waqt baqi raqam wasool karein.</div>
                </div>
              </div>
            )}

            {/* Delivery Date */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 5 }}>
                Delivery Date (YYYY-MM-DD)
              </label>
              <input
                type="date"
                className="form-input"
                value={deliveryDate}
                onChange={e => setDeliveryDate(e.target.value)}
              />
            </div>

            {/* Delivery Note */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 5 }}>
                Delivery Note / Handover Details (Optional)
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Delivered to customer's brother with bag"
                value={deliveryNote}
                onChange={e => setDeliveryNote(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeliveryModalItem(null)}
                disabled={submittingDelivery}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmDelivered}
                disabled={submittingDelivery}
                style={{ background: '#10b981', borderColor: '#10b981', fontWeight: 700 }}
              >
                {submittingDelivery ? 'Saving...' : '✓ Confirm Delivered'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONDITION CONFIRMATION MODAL ────────────────── */}
      {conditionModalItem && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050,
          padding: 16,
        }}>
          <div className="card" style={{ width: 490, maxWidth: '100%', padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.25)', borderRadius: 12 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#b45309', border: '1px solid #fde68a'
                }}>
                  <AlertCircle size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#0f172a' }}>
                    Dress Condition Confirmation
                  </h3>
                  <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                    ڈریس کی مرمت یا ڈرائی کلیننگ کی تصدیق
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setConditionModalItem(null)}
                style={{ padding: 4, borderRadius: '50%' }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Dress Info Card */}
            <div style={{
              background: '#f8fafc', padding: 14, borderRadius: 8,
              border: '1px solid #e2e8f0', marginBottom: 16
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <span style={{ fontWeight: 800, color: '#1e293b', fontSize: 14 }}>
                  {conditionModalItem.item.dress_name_snapshot}
                  {conditionModalItem.item.size ? ` (${conditionModalItem.item.size})` : ''}
                </span>
                {(() => {
                  const cond = getDressConditionBadge(conditionModalItem.item.dress_condition_status);
                  return (
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: cond.color, background: cond.bg,
                      border: `1px solid ${cond.border}`,
                      borderRadius: 8, padding: '2px 8px',
                    }}>
                      Current: {cond.label}
                    </span>
                  );
                })()}
              </div>
              <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.5 }}>
                Yeh dress filhal database mein <strong>{getDressConditionBadge(conditionModalItem.item.dress_condition_status).label}</strong> marked hai.
              </div>
            </div>

            {/* Question & Explanation */}
            <div style={{
              background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8,
              padding: 14, marginBottom: 18, color: '#065f46', fontSize: 13, lineHeight: 1.5
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} color="#059669" />
                Kya yeh dress repair ya dry-clean ho chuki hai?
              </div>
              <div>
                Confirm karne par is dress ka status database mein <strong>{targetConditionStatus === 'fresh' ? 'Fresh (نیا)' : 'Good (✓ ٹھیک / تیار)'}</strong> update ho jayega aur yeh delivery ke liye <strong>Ready</strong> mark ho jayegi.
              </div>
            </div>

            {/* Target status selection */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                New Dress Status in Database:
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <label style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 6,
                  border: targetConditionStatus === 'good' ? '2px solid #10b981' : '1px solid #cbd5e1',
                  background: targetConditionStatus === 'good' ? '#f0fdf4' : '#ffffff',
                  cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                }}>
                  <input
                    type="radio"
                    name="conditionStatus"
                    checked={targetConditionStatus === 'good'}
                    onChange={() => setTargetConditionStatus('good')}
                  />
                  <span>✓ Good (صاف اور تیار)</span>
                </label>
                <label style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 6,
                  border: targetConditionStatus === 'fresh' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  background: targetConditionStatus === 'fresh' ? '#eff6ff' : '#ffffff',
                  cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                }}>
                  <input
                    type="radio"
                    name="conditionStatus"
                    checked={targetConditionStatus === 'fresh'}
                    onChange={() => setTargetConditionStatus('fresh')}
                  />
                  <span>✨ Fresh (بالکل نیا)</span>
                </label>
              </div>
            </div>

            {/* Footer buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConditionModalItem(null)}
                disabled={submittingConditionReady}
              >
                Cancel (منسوخ)
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmConditionAndReady}
                disabled={submittingConditionReady}
                style={{ background: '#10b981', borderColor: '#10b981', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {submittingConditionReady ? 'Updating DB...' : '✓ Confirm & Mark Ready'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Receipt Modal ───────────────────────────────────── */}
      {receiptBookingId && (
        <ReceiptModal
          bookingId={receiptBookingId}
          isOpen={Boolean(receiptBookingId)}
          onClose={() => setReceiptBookingId(null)}
        />
      )}
    </div>
  );
}

export default function DeliveriesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading Deliveries...</div>}>
      <DeliveriesContent />
    </Suspense>
  );
}
