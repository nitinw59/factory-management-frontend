import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuBell, LuX, LuCheckCheck } from 'react-icons/lu';
import { notificationApi } from '../api/notificationApi';
import { API_BASE_URL } from '../utils/api';
import { useAuth } from '../context/AuthContext';

let _toastId = 0;

const NotificationBell = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);

  const panelRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  const addToast = useCallback((notification) => {
    const id = ++_toastId;
    setToasts(prev => [...prev, { id, message: notification.message, link_to: notification.link_to }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  const fetchNotifications = useCallback(async (pageNum = 1, append = false) => {
    setLoading(true);
    try {
      const res = await notificationApi.getMyNotifications({ page: pageNum, limit: 20 });
      const { data, total, total_pages } = res.data;
      setUnreadCount(total);
      setTotalPages(total_pages);
      setNotifications(prev => append ? [...prev, ...data] : data);
    } catch (err) {
      console.error('Failed to fetch notifications', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial unread count fetch
  useEffect(() => {
    fetchNotifications(1);
  }, [fetchNotifications]);

  // WebSocket connection
  const connectWs = useCallback(() => {
    const token = localStorage.getItem('factory_token');
    if (!token) return;

    const wsBase = API_BASE_URL.replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsBase}/ws?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'NEW_NOTIFICATION') {
          setUnreadCount(c => c + 1);
          addToast(msg.notification);
          setNotifications(prev => [msg.notification, ...prev]);
        }
      } catch {}
    };

    ws.onclose = (e) => {
      if (e.code === 4001) {
        logout();
        navigate('/login');
      } else {
        reconnectTimerRef.current = setTimeout(connectWs, 5000);
      }
    };

    ws.onerror = () => ws.close();
  }, [addToast, logout, navigate]);

  useEffect(() => {
    connectWs();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [connectWs]);

  // Close panel on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleToggle = () => {
    if (!isOpen) {
      setPage(1);
      fetchNotifications(1);
    }
    setIsOpen(o => !o);
  };

  const handleClickNotification = async (notification) => {
    navigate(notification.link_to);
    setIsOpen(false);
    if (!notification.is_read) {
      try {
        await notificationApi.markAsRead(notification.id);
        setUnreadCount(c => Math.max(0, c - 1));
        setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n));
      } catch {}
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllRead();
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch {}
  };

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchNotifications(next, true);
  };

  return (
    <>
      <div className="relative" ref={panelRef}>
        {/* Bell button */}
        <button
          onClick={handleToggle}
          className="relative p-1 text-gray-600 hover:text-blue-600 focus:outline-none"
          aria-label="Notifications"
        >
          <LuBell size={20} />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold leading-none text-white bg-red-500 rounded-full px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown panel */}
        {isOpen && (
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-100 z-50 flex flex-col max-h-[480px]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <span className="font-semibold text-sm text-gray-800">
                Notifications {unreadCount > 0 && <span className="ml-1 text-xs font-normal text-gray-400">({unreadCount} unread)</span>}
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                >
                  <LuCheckCheck size={13} />
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 && !loading && (
                <div className="p-6 text-sm text-center text-gray-400">No new notifications</div>
              )}
              {notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClickNotification(n)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${!n.is_read ? 'bg-blue-50/60' : ''}`}
                >
                  <div className="flex items-start gap-2.5">
                    {!n.is_read && (
                      <span className="mt-1.5 flex-shrink-0 w-2 h-2 rounded-full bg-blue-500" />
                    )}
                    <div className={!n.is_read ? '' : 'ml-4'}>
                      <p className="text-sm text-gray-700 leading-snug">{n.message}</p>
                      <p className="text-xs text-gray-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                </button>
              ))}
              {loading && (
                <div className="p-4 text-sm text-center text-gray-400">Loading…</div>
              )}
            </div>

            {/* Load more */}
            {page < totalPages && !loading && (
              <div className="border-t border-gray-100 flex-shrink-0">
                <button
                  onClick={handleLoadMore}
                  className="w-full text-xs text-blue-600 hover:text-blue-800 py-2.5"
                >
                  Load more
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast container — fixed bottom-right, outside the relative div */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-start gap-3 bg-white border border-gray-200 shadow-lg rounded-lg px-4 py-3 max-w-sm"
          >
            <LuBell size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-700 leading-snug">{toast.message}</p>
              {toast.link_to && (
                <button
                  onClick={() => { navigate(toast.link_to); setToasts(prev => prev.filter(t => t.id !== toast.id)); }}
                  className="text-xs text-blue-600 hover:underline mt-0.5"
                >
                  View
                </button>
              )}
            </div>
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-0.5"
            >
              <LuX size={14} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
};

export default NotificationBell;
