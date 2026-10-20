import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createApi } from './api.js';
import './style.css';

const defaultApi = createApi();
const labelDate = (value) =>
  new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export function App({ api = defaultApi }) {
  const [view, setView] = useState('boot');
  const [account, setAccount] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [challenge, setChallenge] = useState(null);
  const [resetToken, setResetToken] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
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
  }
  async function loadAccount() {
    const data = await api.call('/admin/account');
    const list = await api.call('/sessions');
    setAccount(data.account);
    setSessions(list.sessions);
    setView('account');
  }
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await loadAccount();
      } catch (e) {
        if (alive) {
          setView(e.status === 403 ? 'denied' : 'login');
          if (e.status !== 401) setError(e.message);
          if (e.code === 'SESSION_EXPIRED')
            setNotice('Your session expired or was signed out. Please sign in again.');
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps
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
        setNotice('Your session expired or was signed out. Please sign in again.');
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
        setNotice('Password updated. All sessions have been signed out. Sign in again.');
      }
    });
  }
  async function signOut() {
    await api.call('/auth/logout', {});
    setAccount(null);
    navigate('login');
    setNotice('You have signed out.');
  }
  const titles = {
    boot: 'Opening your account',
    login: 'Welcome back.',
    recovery: 'Reset your password.',
    otp: 'Check your inbox.',
    reset: 'Choose a new password.',
    account: 'Your account.',
    denied: 'Access restricted.',
  };
  return (
    <main className="shell">
      <aside className="brand-panel">
        <a className="brand" href="/" aria-label="Orwickle administrator home">
          <img src="/mark.svg" alt="" />
          Orwickle<span>ADMINISTRATOR</span>
        </a>
        <div className="brand-story">
          <span className="eyebrow">A PLACE TO BEGIN</span>
          <h1>
            Good things start
            <br />
            with trust.
          </h1>
          <p>A secure space for your Orwickle account.</p>
          <div className="orbit" aria-hidden="true">
            <i />
            <b />
          </div>
        </div>
        <footer>
          Orwickle <span>Account access</span>
        </footer>
      </aside>
      <section className={`content ${view === 'account' ? 'wide' : ''}`}>
        <div className="mobile-brand">
          <img src="/mark.svg" alt="" />
          Orwickle <span>Administrator</span>
        </div>
        <div className="content-inner">
          <span className="eyebrow">
            {view === 'account' ? 'SIGNED IN SECURELY' : 'ADMINISTRATOR ACCESS'}
          </span>
          <h2>{titles[view]}</h2>
          {view === 'login' && (
            <p className="subtitle">
              Sign in with your provisioned administrator account. We’ll email a code after checking
              your password.
            </p>
          )}
          {view === 'recovery' && (
            <p className="subtitle">
              If an eligible account exists, we’ll send a recovery code to your email.
            </p>
          )}
          {view === 'otp' && (
            <p className="subtitle">
              Enter the six-digit {challenge.purpose === 'login' ? 'sign-in' : 'recovery'} code sent
              to <strong>{email}</strong>. It expires in 10 minutes.
            </p>
          )}
          {view === 'reset' && (
            <p className="subtitle">
              Use at least 12 characters. Updating your password signs out every existing session.
            </p>
          )}
          {notice && (
            <div role="status" className="message success">
              {notice}
            </div>
          )}
          {error && (
            <div role="alert" className="message error">
              {error}
            </div>
          )}
          {view === 'boot' && <p role="status">Checking your saved session…</p>}
          {view === 'denied' && (
            <>
              <p>This panel is available to separately provisioned administrators.</p>
              <button disabled={busy} onClick={() => run(signOut)}>
                Sign out of this account
              </button>
              <button className="text" onClick={() => navigate('login')}>
                Back to sign in
              </button>
            </>
          )}
          {['login', 'recovery', 'otp', 'reset'].includes(view) && (
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
                    placeholder="you@example.com"
                    disabled={busy}
                  />
                </label>
              )}
              {['login', 'reset'].includes(view) && (
                <label>
                  {view === 'reset' ? 'New password' : 'Password'}
                  <div className="password">
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
                      className="reveal"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
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
                    className="code"
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
              <button className="primary" type="submit" disabled={busy}>
                {busy
                  ? 'Please wait…'
                  : {
                      login: 'Continue with email code',
                      recovery: 'Send recovery code',
                      otp: 'Verify code',
                      reset: 'Update password',
                    }[view]}
                <span aria-hidden="true">↗</span>
              </button>
              {view === 'login' && (
                <button
                  className="text"
                  type="button"
                  disabled={busy}
                  onClick={() => navigate('recovery')}
                >
                  Forgot password?
                </button>
              )}
              {view === 'otp' && (
                <button
                  className="text"
                  type="button"
                  disabled={busy || seconds > 0 || challenge.resendsRemaining === 0}
                  onClick={() =>
                    run(async () => {
                      const data = await api.call('/admin/auth/resend', {
                        challengeId: challenge.challengeId,
                        purpose: challenge.purpose,
                      });
                      setChallenge({ ...data, purpose: challenge.purpose });
                      setNotice('A new code has been sent. Use the latest email.');
                    })
                  }
                >
                  {seconds
                    ? `Resend in ${seconds}s`
                    : challenge.resendsRemaining
                      ? `Resend code · ${challenge.resendsRemaining} remaining`
                      : 'Resend limit reached'}
                </button>
              )}
              {view !== 'login' && (
                <button
                  type="button"
                  className="text"
                  disabled={busy}
                  onClick={() => navigate('login')}
                >
                  Back to sign in
                </button>
              )}
            </form>
          )}
          {view === 'account' && account && (
            <>
              <div className="account-card">
                <div className="avatar">{account.fullName.charAt(0).toUpperCase()}</div>
                <div>
                  <h3>{account.fullName}</h3>
                  <p>{account.email}</p>
                  <span className="badge">Administrator · Email verified</span>
                </div>
              </div>
              <div className="section-heading">
                <div>
                  <h3>Active sessions</h3>
                  <p>Review where you’re signed in.</p>
                </div>
                <button
                  className="small secondary"
                  disabled={busy}
                  onClick={() => run(loadAccount)}
                >
                  Refresh
                </button>
              </div>
              <ul className="sessions">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <div className="session-title">
                      <strong>{s.isCurrent ? 'This session' : 'Other session'}</strong>
                      {s.isCurrent && <span className="dot">Current</span>}
                    </div>
                    <p className="device">{s.deviceLabel}</p>
                    <p>
                      Last active {labelDate(s.lastSeenAt)}
                      <br />
                      Expires {labelDate(s.expiresAt)}
                    </p>
                    {!s.isCurrent && (
                      <button
                        className="text inline"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await api.call(`/sessions/${s.id}`, {}, 'DELETE');
                            await loadAccount();
                            setNotice('Session signed out.');
                          })
                        }
                      >
                        Sign out this session
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <div className="actions">
                <button
                  className="secondary"
                  disabled={busy || sessions.length < 2}
                  onClick={() =>
                    run(async () => {
                      await api.call('/sessions/revoke-others', {});
                      await loadAccount();
                      setNotice('Other sessions signed out.');
                    })
                  }
                >
                  Sign out other sessions
                </button>
                <button className="primary" disabled={busy} onClick={() => run(signOut)}>
                  Sign out
                </button>
              </div>
            </>
          )}
          <p className="security-note">Protected with password and email verification.</p>
        </div>
      </section>
    </main>
  );
}
if (document.getElementById('root')) createRoot(document.getElementById('root')).render(<App />);
