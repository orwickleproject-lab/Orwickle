import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createApi } from './api.js';
import './style.css';

const defaultApi = createApi();
const roleLabel = (role) => role.charAt(0).toUpperCase() + role.slice(1);
export function App({ api = defaultApi }) {
  const [view, setView] = useState('boot');
  const [account, setAccount] = useState(null);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [resetToken, setResetToken] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = challenge
    ? Math.max(0, Math.ceil((new Date(challenge.resendAt) - now) / 1000))
    : 0;
  function navigate(next) {
    setView(next);
    setError('');
    setNotice('');
    setPassword('');
    setConfirmation('');
    setCode('');
    setResetToken(null);
    setChallenge(null);
    setShowPassword(false);
  }
  async function loadUsers(query = '', nextPage = 1) {
    const params = new URLSearchParams({ search: query, page: String(nextPage) });
    const data = await api.call(`/admin/users?${params}`);
    setUsers(data.users);
    setTotal(data.total);
    setPage(data.page);
    setAppliedSearch(query);
  }
  async function loadAccount() {
    const data = await api.call('/admin/account');
    setAccount(data.account);
    setView('account');
    await loadUsers();
  }
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await loadAccount();
      } catch (e) {
        if (alive) {
          setView((current) =>
            e.status === 403
              ? 'denied'
              : e.status === 401 || current === 'boot'
                ? 'login'
                : current,
          );
          if (e.status !== 401) setError(e.message);
          if (e.code === 'SESSION_EXPIRED')
            setNotice('Your session expired. Please sign in again.');
        }
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api]);
  async function run(work) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      if (view === 'account' && e.status === 401) {
        navigate('login');
        setAccount(null);
        setUsers([]);
        setEditing(null);
        setNotice('Your session expired. Please sign in again.');
      } else if (view === 'account' && e.status === 403) setView('denied');
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function submit(event) {
    event.preventDefault();
    run(async () => {
      if (view === 'login' || view === 'recovery') {
        const purpose = view === 'login' ? 'login' : 'recovery';
        const data = await api.call(`/admin/auth/${purpose}`, {
          email: email.trim(),
          ...(purpose === 'login' && { password }),
        });
        setPassword('');
        setChallenge({ ...data, purpose });
        setCode('');
        setView('otp');
      } else if (view === 'otp') {
        const data = await api.call(`/admin/auth/${challenge.purpose}/verify`, {
          challengeId: challenge.challengeId,
          code,
        });
        setCode('');
        if (challenge.purpose === 'recovery') {
          setResetToken(data.resetToken);
          setView('reset');
        } else {
          await loadAccount();
          setChallenge(null);
        }
      } else if (view === 'reset') {
        if (password !== confirmation) throw new Error('Passwords do not match.');
        await api.call('/admin/auth/reset', {
          resetToken,
          password,
          confirmPassword: confirmation,
        });
        navigate('login');
        setNotice('Password updated. Sign in again.');
      }
    });
  }
  async function signOut() {
    await api.call('/auth/logout', {});
    setAccount(null);
    setUsers([]);
    setSearch('');
    setEditing(null);
    navigate('login');
    setNotice('You have signed out.');
  }
  const titles = {
    boot: 'Loading…',
    login: 'Admin sign in',
    recovery: 'Reset password',
    otp: 'Verify email',
    reset: 'New password',
    account: 'Users',
    denied: 'Access restricted',
  };
  return (
    <main>
      <header>
        <a className="brand" href="/" aria-label="Orwickle administrator home">
          <img src="/mark.svg" alt="" width="32" height="32" />
          <strong>Orwickle</strong>
          <span>Admin</span>
        </a>
        {view === 'account' && (
          <button disabled={busy} onClick={() => run(signOut)}>
            Sign out
          </button>
        )}
      </header>
      <section className={view === 'account' ? '' : 'auth'} aria-busy={busy}>
        <h1>{titles[view]}</h1>
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert">{error}</p>}
        {view === 'boot' && <p role="status">Checking your login…</p>}
        {view === 'denied' && (
          <>
            <p>Sign in with an administrator account.</p>
            <button disabled={busy} onClick={() => run(signOut)}>
              Sign out
            </button>
          </>
        )}
        {['login', 'recovery', 'otp', 'reset'].includes(view) && (
          <>
            {view === 'login' && <p>Enter your password, then verify the email code.</p>}
            {view === 'recovery' && <p>We’ll email a recovery code if the account is eligible.</p>}
            {view === 'otp' && (
              <p>Enter the six-digit code sent to {email}. It expires in 10 minutes.</p>
            )}
            <form onSubmit={submit}>
              {['login', 'recovery'].includes(view) && (
                <label>
                  Email address
                  <input
                    type="email"
                    autoComplete="username"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy}
                  />
                </label>
              )}
              {['login', 'reset'].includes(view) && (
                <label>
                  {view === 'reset' ? 'New password' : 'Password'}
                  <span className="password">
                    <input
                      aria-label={view === 'reset' ? 'New password' : 'Password'}
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={view === 'reset' ? 12 : 1}
                      maxLength={128}
                      autoComplete={view === 'reset' ? 'new-password' : 'current-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy}
                    />
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </span>
                </label>
              )}
              {view === 'reset' && (
                <label>
                  Confirm new password
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    disabled={busy}
                  />
                </label>
              )}
              {view === 'otp' && (
                <label>
                  Email verification code
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    disabled={busy}
                  />
                </label>
              )}
              <button type="submit" disabled={busy}>
                {busy
                  ? 'Please wait…'
                  : {
                      login: 'Continue',
                      recovery: 'Send recovery code',
                      otp: 'Verify code',
                      reset: 'Update password',
                    }[view]}
              </button>
              {view === 'login' && (
                <button type="button" disabled={busy} onClick={() => navigate('recovery')}>
                  Forgot password?
                </button>
              )}
              {view === 'otp' && (
                <button
                  type="button"
                  disabled={busy || seconds > 0 || challenge.resendsRemaining === 0}
                  onClick={() =>
                    run(async () => {
                      const data = await api.call('/admin/auth/resend', {
                        challengeId: challenge.challengeId,
                        purpose: challenge.purpose,
                      });
                      setChallenge({ ...data, purpose: challenge.purpose });
                      setNotice('A new code has been sent.');
                    })
                  }
                >
                  {seconds
                    ? `Resend in ${seconds}s`
                    : challenge.resendsRemaining
                      ? 'Resend code'
                      : 'Resend limit reached'}
                </button>
              )}
              {view !== 'login' && (
                <button type="button" disabled={busy} onClick={() => navigate('login')}>
                  Back to sign in
                </button>
              )}
            </form>
          </>
        )}
        {view === 'account' && account && (
          <>
            <p className="muted">Signed in as {account.email}</p>
            {editing && (
              <form
                className="editor"
                aria-label="Edit user"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(async () => {
                    await api.call(
                      `/admin/users/${editing.id}`,
                      { fullName: editing.fullName.trim(), role: editing.role },
                      'PATCH',
                    );
                    setEditing(null);
                    await loadUsers(appliedSearch, page);
                    setNotice('User updated.');
                  });
                }}
              >
                <h2>Edit user</h2>
                <p>{editing.email}</p>
                <label>
                  Full name
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    value={editing.fullName}
                    onChange={(event) => setEditing({ ...editing, fullName: event.target.value })}
                    disabled={busy}
                  />
                </label>
                <label>
                  Role
                  <select
                    aria-label="Role"
                    value={editing.role}
                    onChange={(event) => setEditing({ ...editing, role: event.target.value })}
                    disabled={busy}
                  >
                    {['student', 'investor', 'buyer'].map((role) => (
                      <option key={role} value={role}>
                        {roleLabel(role)}
                      </option>
                    ))}
                  </select>
                </label>
                <button disabled={busy}>Save changes</button>
                <button type="button" disabled={busy} onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </form>
            )}
            <form
              className="toolbar"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                run(() => loadUsers(search.trim(), 1));
              }}
            >
              <input
                type="search"
                aria-label="Search users"
                placeholder="Search name or email"
                maxLength={100}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                disabled={busy}
              />
              <button disabled={busy}>Search</button>
            </form>
            <p>
              {total} {total === 1 ? 'user' : 'users'}
            </p>
            <div className="table-wrap" role="region" aria-label="Users table" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Email status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.fullName}</td>
                      <td>{user.email}</td>
                      <td>{roleLabel(user.role)}</td>
                      <td>{user.emailVerified ? 'Verified' : 'Pending'}</td>
                      <td>
                        <button
                          aria-label={`Edit ${user.fullName}`}
                          disabled={busy}
                          onClick={() => setEditing({ ...user })}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {users.length === 0 && <p>{busy ? 'Loading users…' : 'No users found.'}</p>}
            {total > 20 && (
              <nav aria-label="User pages">
                <button
                  disabled={busy || page === 1}
                  onClick={() => run(() => loadUsers(appliedSearch, page - 1))}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {Math.ceil(total / 20)}
                </span>
                <button
                  disabled={busy || page * 20 >= total}
                  onClick={() => run(() => loadUsers(appliedSearch, page + 1))}
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </section>
    </main>
  );
}
if (document.getElementById('root')) createRoot(document.getElementById('root')).render(<App />);
