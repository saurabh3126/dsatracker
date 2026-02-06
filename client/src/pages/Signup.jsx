import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
    <div className="mx-auto w-full max-w-md px-4 py-12 text-slate-100">
      <h1 className="text-2xl font-semibold tracking-tight text-white">Sign up</h1>
      <p className="mt-2 text-sm text-slate-300">We collect your LeetCode username once at signup.</p>

      {error ? (
        <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
        <label className="block">
          <span className="text-xs text-slate-300">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            type="text"
            required
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:border-white/20"
            placeholder="Your name"
          />
        </label>

        <label className="block">
          <span className="text-xs text-slate-300">Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:border-white/20"
            placeholder="you@example.com"
          />
        </label>

        <label className="block">
          <span className="text-xs text-slate-300">Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            minLength={6}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:border-white/20"
            placeholder="At least 6 characters"
          />
        </label>

        <label className="block">
          <span className="text-xs text-slate-300">LeetCode username</span>
          <input
            value={leetcodeUsername}
            onChange={(e) => setLeetcodeUsername(e.target.value)}
            type="text"
            required
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:border-white/20"
            placeholder="leetcode_id"
          />
        </label>

        <button
          disabled={loading}
          type="submit"
          className={
            'w-full rounded-xl px-4 py-2 text-sm font-medium ring-1 ring-white/10 ' +
            (loading ? 'cursor-not-allowed bg-white/5 text-slate-300' : 'bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25')
          }
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>

        <div className="text-center text-sm text-slate-300">
          Already have an account?{' '}
          <Link to="/login" className="text-indigo-200 hover:text-indigo-100">
            Login
          </Link>
        </div>
      </form>
    </div>
  );
}
