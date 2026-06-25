import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2, Plus, Pencil, Trash2, Search, X,
  AlertTriangle, Users, ChevronDown,
} from 'lucide-react';
import { genericApi } from '../../api/genericApi';
import { factoryUserConfig } from '../../config/crudConfigs';
import Modal from '../../shared/Modal';
import CrudForm from '../../shared/CrudForm';

// --- Static metadata for role display and color coding ---
const ROLE_META = {
  factory_admin:      { label: 'Factory Admin',      category: 'Administration', bg: 'bg-purple-50',  badge: 'bg-purple-100 text-purple-800',  accent: 'bg-purple-400' },
  hr_manager:         { label: 'HR Manager',         category: 'Administration', bg: 'bg-purple-50',  badge: 'bg-purple-100 text-purple-800',  accent: 'bg-purple-400' },
  accountant:         { label: 'Accountant',         category: 'Administration', bg: 'bg-purple-50',  badge: 'bg-purple-100 text-purple-800',  accent: 'bg-purple-400' },
  production_manager: { label: 'Production Manager', category: 'Production',    bg: 'bg-blue-50',    badge: 'bg-blue-100 text-blue-800',      accent: 'bg-blue-400'   },
  line_supervisor:    { label: 'Line Supervisor',    category: 'Production',    bg: 'bg-blue-50',    badge: 'bg-blue-100 text-blue-800',      accent: 'bg-blue-400'   },
  line_loader:        { label: 'Line Loader',        category: 'Production',    bg: 'bg-blue-50',    badge: 'bg-blue-100 text-blue-800',      accent: 'bg-blue-400'   },
  cutting_manager:    { label: 'Cutting Manager',    category: 'Production',    bg: 'bg-blue-50',    badge: 'bg-blue-100 text-blue-800',      accent: 'bg-blue-400'   },
  cutting_operator:   { label: 'Cutting Operator',   category: 'Production',    bg: 'bg-blue-50',    badge: 'bg-blue-100 text-blue-800',      accent: 'bg-blue-400'   },
  universal_checker:  { label: 'Universal Checker',  category: 'Quality',       bg: 'bg-green-50',   badge: 'bg-green-100 text-green-800',    accent: 'bg-green-400'  },
  garment_checker:    { label: 'Garment Checker',    category: 'Quality',       bg: 'bg-green-50',   badge: 'bg-green-100 text-green-800',    accent: 'bg-green-400'  },
  store_manager:      { label: 'Store Manager',      category: 'Supply Chain',  bg: 'bg-amber-50',   badge: 'bg-amber-100 text-amber-800',    accent: 'bg-amber-400'  },
  supplier:           { label: 'Supplier',           category: 'Supply Chain',  bg: 'bg-amber-50',   badge: 'bg-amber-100 text-amber-800',    accent: 'bg-amber-400'  },
  dispatch_officer:   { label: 'Dispatch Officer',   category: 'Supply Chain',  bg: 'bg-amber-50',   badge: 'bg-amber-100 text-amber-800',    accent: 'bg-amber-400'  },
  purchase_manager:   { label: 'Purchase Manager',   category: 'Supply Chain',  bg: 'bg-amber-50',   badge: 'bg-amber-100 text-amber-800',    accent: 'bg-amber-400'  },
  merchandiser:       { label: 'Merchandiser',       category: 'Commercial',    bg: 'bg-teal-50',    badge: 'bg-teal-100 text-teal-800',      accent: 'bg-teal-400'   },
  mechanic:           { label: 'Mechanic',           category: 'Technical',     bg: 'bg-rose-50',    badge: 'bg-rose-100 text-rose-800',      accent: 'bg-rose-400'   },
};
const DEFAULT_META = { category: 'Other', bg: 'bg-gray-50', badge: 'bg-gray-100 text-gray-700', accent: 'bg-gray-300' };
const CATEGORY_ORDER = ['Administration', 'Production', 'Quality', 'Supply Chain', 'Commercial', 'Technical', 'Other'];

const getMeta = (role) => ROLE_META[role] ?? { ...DEFAULT_META, label: role };

const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  return parts.length >= 2
    ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    : name.substring(0, 2).toUpperCase();
};

const UserManagementPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState(null);
  const [deleteErr, setDeleteErr] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [search, setSearch] = useState('');
  const [modalUser, setModalUser] = useState(undefined); // undefined=closed, null=create, obj=edit
  const [collapsedRoles, setCollapsedRoles] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setFetchErr(null);
    try {
      const res = await genericApi.getAll('shared/factory_users');
      setUsers(res.data || []);
    } catch (ex) {
      setFetchErr(ex?.response?.data?.error || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data) => {
    setApiError(null);
    try {
      if (data.id) {
        await genericApi.update('shared/factory_users', data.id, data);
      } else {
        await genericApi.create('shared/factory_users', data);
      }
      setModalUser(undefined);
      load();
    } catch (ex) {
      setApiError(ex?.response?.data?.error || 'An unexpected error occurred.');
    }
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Delete "${user.name}"?\n\nThis cannot be undone.`)) return;
    setDeleting(user.id);
    setDeleteErr(null);
    try {
      await genericApi.delete('shared/factory_users', user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (ex) {
      setDeleteErr(ex?.response?.data?.error || ex.message || 'Delete failed.');
    } finally {
      setDeleting(null);
    }
  };

  const toggleRole = (role) => {
    setCollapsedRoles((prev) => {
      const next = new Set(prev);
      next.has(role) ? next.delete(role) : next.add(role);
      return next;
    });
  };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    );
  }, [users, search]);

  const groupedByRole = useMemo(() =>
    filteredUsers.reduce((acc, u) => {
      if (!acc[u.role]) acc[u.role] = [];
      acc[u.role].push(u);
      return acc;
    }, {}),
    [filteredUsers]
  );

  const sortedRoleNames = useMemo(() =>
    Object.keys(groupedByRole).sort((a, b) => {
      const catA = CATEGORY_ORDER.indexOf(getMeta(a).category);
      const catB = CATEGORY_ORDER.indexOf(getMeta(b).category);
      if (catA !== catB) return catA - catB;
      return a.localeCompare(b);
    }),
    [groupedByRole]
  );

  const isSearchActive = search.trim().length > 0;

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-xl">
            <Users size={20} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Factory Users</h1>
            <p className="text-xs text-gray-400">Manage system access across all factory roles</p>
          </div>
        </div>
        <button
          onClick={() => { setApiError(null); setModalUser(null); }}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
        >
          <Plus size={15} /> Add User
        </button>
      </div>

      {/* Summary + Search */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-600 text-xs font-semibold px-3 py-1 rounded-full">
            <Users size={11} /> {users.length} total user{users.length !== 1 ? 's' : ''}
          </span>
          {isSearchActive && (
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full">
              {filteredUsers.length} matching &ldquo;{search}&rdquo;
            </span>
          )}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 bg-white"
          />
          {isSearchActive && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Error Banners */}
      {fetchErr && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          {fetchErr}
        </div>
      )}
      {deleteErr && (
        <div className="flex items-start justify-between gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            {deleteErr}
          </div>
          <button onClick={() => setDeleteErr(null)} className="shrink-0 text-amber-600 hover:text-amber-800">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 size={28} className="animate-spin text-blue-500" />
        </div>
      )}

      {/* Empty states */}
      {!loading && users.length === 0 && !fetchErr && (
        <div className="flex flex-col items-center py-16 text-center">
          <Users size={40} className="text-gray-300 mb-3" />
          <p className="font-semibold text-gray-500 text-sm">No users yet</p>
          <p className="text-xs text-gray-400 mt-1">Click &ldquo;Add User&rdquo; to create the first one.</p>
        </div>
      )}
      {!loading && users.length > 0 && isSearchActive && filteredUsers.length === 0 && (
        <div className="flex flex-col items-center py-16 text-center">
          <Search size={36} className="text-gray-300 mb-3" />
          <p className="font-semibold text-gray-500 text-sm">No users match your search</p>
          <p className="text-xs text-gray-400 mt-1">Try a different name or email.</p>
        </div>
      )}

      {/* Role Section Cards */}
      {!loading && (
        <div className="space-y-3">
          {sortedRoleNames.map((role) => {
            const meta = getMeta(role);
            const roleUsers = groupedByRole[role];
            const isCollapsed = isSearchActive ? false : collapsedRoles.has(role);

            return (
              <section key={role} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggleRole(role)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-1 self-stretch min-h-[1.25rem] rounded-full ${meta.accent}`} />
                    <span className="font-bold text-gray-800 text-sm">{meta.label}</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${meta.badge}`}>
                      {roleUsers.length}
                    </span>
                    <span className="text-[10px] text-gray-400 font-medium hidden sm:inline">
                      {meta.category}
                    </span>
                  </div>
                  <ChevronDown
                    size={14}
                    className={`text-gray-400 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`}
                  />
                </button>

                {!isCollapsed && (
                  <div className="divide-y divide-gray-50">
                    {roleUsers.map((user) => (
                      <div
                        key={user.id}
                        className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition ${meta.bg}`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${meta.badge}`}>
                          {getInitials(user.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gray-800 truncate">{user.name}</p>
                          <p className="text-xs text-gray-400 truncate">{user.email}</p>
                        </div>
                        <span className={`hidden sm:inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.badge}`}>
                          {meta.label}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => { setApiError(null); setModalUser(user); }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(user)}
                            disabled={deleting === user.id}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-40"
                          >
                            {deleting === user.id
                              ? <Loader2 size={13} className="animate-spin" />
                              : <Trash2 size={13} />
                            }
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Footer */}
      {!loading && filteredUsers.length > 0 && (
        <p className="text-[11px] text-gray-400 px-1">
          {isSearchActive
            ? `${filteredUsers.length} user${filteredUsers.length !== 1 ? 's' : ''} matching "${search}"`
            : `${users.length} user${users.length !== 1 ? 's' : ''} across ${sortedRoleNames.length} role${sortedRoleNames.length !== 1 ? 's' : ''}`
          }
        </p>
      )}

      {/* Add / Edit Modal */}
      {modalUser !== undefined && (
        <Modal
          title={modalUser ? `Edit · ${modalUser.name}` : 'Add New User'}
          onClose={() => { setModalUser(undefined); setApiError(null); }}
        >
          <CrudForm
            fields={factoryUserConfig.fields}
            initialData={modalUser || {}}
            onSave={handleSave}
            onClose={() => { setModalUser(undefined); setApiError(null); }}
            apiError={apiError}
          />
        </Modal>
      )}
    </div>
  );
};

export default UserManagementPage;
