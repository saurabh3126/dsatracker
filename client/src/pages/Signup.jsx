import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User2, AtSign } from 'lucide-react';
import { apiPost } from '../lib/api';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Signup() {
  const navigate = useNavigate();
  const { setSession } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [leetcodeUsername, setLeetcodeUsername] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const json = await apiPost('/api/auth/signup', {
        name: name.trim(),
        email: email.trim(),
        password,
        leetcodeUsername: leetcodeUsername.trim(),
      });

      setSession(json?.token, json?.user);
      navigate('/questions', { replace: true });
    } catch (err) {
      setError(err?.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 text-slate-100">
      <div className="group relative overflow-hidden rounded-[2.25rem] border border-white/10 bg-[#05070a]/80 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.65)] backdrop-blur-2xl transition-all duration-300 hover:border-emerald-500/40 hover:shadow-[0_20px_40px_rgba(16,185,129,0.22),0_30px_90px_rgba(0,0,0,0.65)] hover:-translate-y-2 hover:scale-[1.02] sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-fuchsia-500/10" />
        <div className="pointer-events-none absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[-20deg]" />

        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
                <img src="/fevicon.png" alt="DSA Tracker" className="h-7 w-7" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">DSA Tracker</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight text-white">Create your account</h1>
              </div>
            </div>
          </div>

          <p className="mt-3 text-sm text-slate-300">We collect your LeetCode username once at signup.</p>

          {error ? (
            <div className="mt-6 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200">
              {error}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <label className="block">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Name</span>
              <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 ring-1 ring-white/5 focus-within:border-emerald-500/40 focus-within:ring-emerald-500/20">
                <User2 className="h-4 w-4 text-slate-400" />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  type="text"
                  required
                  autoComplete="name"
                  className="w-full bg-transparent text-sm font-semibold text-slate-100 placeholder:text-slate-500 outline-none"
                  placeholder="Your name"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Email</span>
              <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 ring-1 ring-white/5 focus-within:border-emerald-500/40 focus-within:ring-emerald-500/20">
                <Mail className="h-4 w-4 text-slate-400" />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  required
                  autoComplete="email"
                  className="w-full bg-transparent text-sm font-semibold text-slate-100 placeholder:text-slate-500 outline-none"
                  placeholder="you@example.com"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Password</span>
              <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 ring-1 ring-white/5 focus-within:border-emerald-500/40 focus-within:ring-emerald-500/20">
                <Lock className="h-4 w-4 text-slate-400" />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full bg-transparent text-sm font-semibold text-slate-100 placeholder:text-slate-500 outline-none"
                  placeholder="At least 8 characters"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">LeetCode username</span>
              <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 ring-1 ring-white/5 focus-within:border-emerald-500/40 focus-within:ring-emerald-500/20">
                <AtSign className="h-4 w-4 text-slate-400" />
                <input
                  value={leetcodeUsername}
                  onChange={(e) => setLeetcodeUsername(e.target.value)}
                  type="text"
                  required
                  autoComplete="username"
                  className="w-full bg-transparent text-sm font-semibold text-slate-100 placeholder:text-slate-500 outline-none"
                  placeholder="leetcode_id"
                />
              </div>
            </label>

            <button
              disabled={loading}
              type="submit"
              className={
                'mt-2 w-full rounded-2xl py-3.5 text-[11px] font-black uppercase tracking-[0.2em] ring-1 ring-emerald-500/30 transition-all ' +
                (loading
                  ? 'cursor-not-allowed bg-white/5 text-slate-300'
                  : 'bg-emerald-500 text-black hover:bg-emerald-400 active:scale-[0.99] shadow-lg shadow-emerald-500/10')
              }
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>

            <div className="pt-2 text-center text-sm text-slate-300">
              Already have an account?{' '}
              <Link to="/login" className="font-bold text-emerald-300 hover:text-emerald-200">
                Login
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
