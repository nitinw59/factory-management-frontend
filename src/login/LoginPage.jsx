import { Navigate, useLocation } from 'react-router-dom';
import { API_BASE_URL } from '../utils/api';
import { useAuth } from '../context/AuthContext';

const LoginPage = () => {
    const { user } = useAuth();
    const location = useLocation();
    const sessionExpired = location.state?.reason === 'session_expired';

    const handleLogin = () => {
        window.location.href = `${API_BASE_URL}/api/auth/google`;
    };

    // Already authenticated — go straight to the role-based portal redirect.
    if (user) {
        return <Navigate to="/init" replace />;
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 px-4">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 px-8 py-10 flex flex-col items-center">
                <img
                    src="/matrix_logo.png"
                    alt="MATRIX"
                    className="h-20 w-auto mb-4"
                />
                <h1 className="text-2xl font-black tracking-[0.3em] text-slate-800">MATRIX</h1>
                <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Factory Management Platform</p>

                {sessionExpired && (
                    <div className="w-full mt-6 flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium rounded-xl px-3.5 py-3">
                        <svg className="w-4 h-4 flex-shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                        <span>Your session has expired. Please sign in again.</span>
                    </div>
                )}

                <div className="w-full mt-8">
                    <button
                        onClick={handleLogin}
                        className="w-full flex items-center justify-center gap-2.5 bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-700 font-bold text-sm py-2.5 rounded-xl shadow-sm transition-colors"
                    >
                        <svg width="16" height="16" viewBox="0 0 48 48">
                            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
                            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.3 44 24 44z"/>
                            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C40.9 35.7 44 30.3 44 24c0-1.3-.1-2.4-.4-3.5z"/>
                        </svg>
                        Sign in with Google
                    </button>
                </div>

                <p className="text-[10px] text-slate-400 mt-6 uppercase tracking-widest">Authorized personnel only</p>
            </div>
        </div>
    );
};

export default LoginPage;
