import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'auth_api.dart';
import 'backend_connection.dart';

void main() => runApp(const MyApp());
const ink = Color(0xFF123E3D);
const paper = Color(0xFFF5F3EE);
const muted = Color(0xFF65756A);

class MyApp extends StatelessWidget {
  final AuthApi? api;
  const MyApp({super.key, this.api});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Orwickle',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: paper,
      fontFamily: 'Roboto',
      colorScheme: ColorScheme.fromSeed(
        seedColor: ink,
        primary: ink,
        surface: paper,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFFFFFDFA),
        contentPadding: const EdgeInsets.all(17),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFCBD1C7)),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(53),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(49),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    ),
    home: AccountFlow(api: api),
  );
}

class OrwickleMark extends StatelessWidget {
  const OrwickleMark({super.key});
  @override
  Widget build(BuildContext context) => Container(
    width: 42,
    height: 42,
    decoration: BoxDecoration(
      color: ink,
      borderRadius: BorderRadius.circular(13),
    ),
    child: CustomPaint(painter: _MarkPainter()),
  );
}

class _MarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 64;
    canvas.drawCircle(
      Offset(32 * scale, 32 * scale),
      17 * scale,
      Paint()
        ..color = paper
        ..style = PaintingStyle.stroke
        ..strokeWidth = 7 * scale,
    );
    canvas.drawCircle(
      Offset(46 * scale, 18 * scale),
      7 * scale,
      Paint()..color = const Color(0xFFE7AE72),
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class AccountFlow extends StatefulWidget {
  final AuthApi? api;
  const AccountFlow({super.key, this.api});
  @override
  State<AccountFlow> createState() => _AccountFlowState();
}

class _AccountFlowState extends State<AccountFlow> {
  late final AuthApi api = widget.api ?? AuthApi();
  final form = GlobalKey<FormState>();
  final name = TextEditingController(),
      email = TextEditingController(),
      password = TextEditingController(),
      confirmation = TextEditingController(),
      code = TextEditingController();
  String view = 'boot', role = 'student', error = '', notice = '';
  String? resetToken;
  Map<String, dynamic>? account, challenge;
  List<dynamic> sessions = [];
  bool busy = false, showPassword = false;
  late final Timer timer;
  int get resendSeconds => challenge == null
      ? 0
      : ((DateTime.parse(challenge!['resendAt'] as String)
                        .millisecondsSinceEpoch -
                    DateTime.now().millisecondsSinceEpoch) /
                1000)
            .ceil()
            .clamp(0, 60);
  @override
  void initState() {
    super.initState();
    timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && view == 'otp') setState(() {});
    });
    restore();
  }

  @override
  void dispose() {
    timer.cancel();
    for (final c in [name, email, password, confirmation, code]) {
      c.dispose();
    }
    if (widget.api == null) api.close();
    super.dispose();
  }

  Future<void> restore() async {
    try {
      if (await api.restore()) {
        await loadAccount();
      } else if (mounted) {
        setState(() => view = 'login');
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          view = 'login';
          notice = e is AuthFailure && e.status == 401
              ? 'Your session expired or was signed out. Please sign in again.'
              : 'Your saved session could not be checked. Try again when connected.';
        });
      }
    }
  }

  void navigate(String next) {
    setState(() {
      view = next;
      error = '';
      notice = '';
      challenge = null;
      resetToken = null;
      password.clear();
      confirmation.clear();
      code.clear();
      showPassword = false;
    });
  }

  Future<void> loadAccount() async {
    final data = await api.call('/account');
    final user = data['account'] as Map<String, dynamic>;
    if (!['student', 'investor', 'buyer'].contains(user['role'])) {
      if (mounted) {
        setState(() {
          account = user;
          view = 'denied';
        });
      }
      return;
    }
    await api.call('/roles/${user['role']}');
    final list = await api.call('/sessions');
    if (mounted) {
      setState(() {
        account = user;
        sessions = list['sessions'] as List<dynamic>;
        view = 'account';
      });
    }
  }

  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = '';
      notice = '';
    });
    try {
      await action();
    } catch (e) {
      if (!mounted) return;
      if (e is AuthFailure && e.code == 'SESSION_EXPIRED') {
        navigate('login');
        account = null;
      }
      setState(
        () => error = e is AuthFailure
            ? e.message
            : 'The request could not be completed. Please try again.',
      );
    } finally {
      if (mounted) {
        setState(() => busy = false);
      }
    }
  }

  Future<void> submit() async {
    if (!(form.currentState?.validate() ?? false)) return;
    await run(() async {
      if (['login', 'signup', 'recovery'].contains(view)) {
        final purpose = view;
        final data = await api.call('/auth/$purpose', {
          'email': email.text.trim(),
          if (purpose != 'recovery') 'password': password.text,
          if (purpose == 'signup') ...{
            'fullName': name.text.trim(),
            'confirmPassword': confirmation.text,
            'role': role,
          },
        });
        if (!mounted) return;
        setState(() {
          challenge = {...data, 'purpose': purpose};
          view = 'otp';
          password.clear();
          confirmation.clear();
          code.clear();
        });
      } else if (view == 'otp') {
        final purpose = challenge!['purpose'] as String;
        final data = await api.call('/auth/$purpose/verify', {
          'challengeId': challenge!['challengeId'],
          'code': code.text,
        });
        code.clear();
        if (!mounted) return;
        if (purpose == 'login') {
          await loadAccount();
        } else if (purpose == 'recovery') {
          setState(() {
            resetToken = data['resetToken'] as String;
            view = 'reset';
          });
        } else {
          navigate('login');
          setState(
            () => notice =
                'Email verified. Sign in with your password to continue.',
          );
        }
      } else if (view == 'reset') {
        await api.call('/auth/reset', {
          'resetToken': resetToken,
          'password': password.text,
          'confirmPassword': confirmation.text,
        });
        await api.clear();
        if (!mounted) return;
        navigate('login');
        setState(
          () => notice =
              'Password updated. All sessions signed out. Sign in again.',
        );
      }
    });
  }

  Future<void> signOut() async {
    await api.call('/auth/logout', {});
    if (mounted) {
      account = null;
      navigate('login');
      setState(() => notice = 'You have signed out.');
    }
  }

  Widget field(
    String label,
    TextEditingController controller, {
    bool secret = false,
    bool isEmail = false,
    bool isCode = false,
    bool confirm = false,
    bool fullName = false,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 18),
    child: TextFormField(
      controller: controller,
      enabled: !busy,
      obscureText: secret && !showPassword,
      keyboardType: isEmail
          ? TextInputType.emailAddress
          : isCode
          ? TextInputType.number
          : TextInputType.text,
      textCapitalization: fullName
          ? TextCapitalization.words
          : TextCapitalization.none,
      autofillHints: isEmail
          ? [AutofillHints.username]
          : secret
          ? [
              view == 'login'
                  ? AutofillHints.password
                  : AutofillHints.newPassword,
            ]
          : isCode
          ? [AutofillHints.oneTimeCode]
          : fullName
          ? [AutofillHints.name]
          : null,
      autocorrect: !secret && !isEmail && !isCode,
      enableSuggestions: !secret,
      maxLength: isCode
          ? 6
          : secret
          ? 128
          : fullName
          ? 100
          : 254,
      inputFormatters: isCode ? [FilteringTextInputFormatter.digitsOnly] : null,
      style: isCode ? const TextStyle(fontSize: 28, letterSpacing: 12) : null,
      decoration: InputDecoration(
        labelText: label,
        counterText: '',
        suffixIcon: secret && !confirm
            ? IconButton(
                tooltip: showPassword ? 'Hide password' : 'Show password',
                icon: Icon(
                  showPassword
                      ? Icons.visibility_off_outlined
                      : Icons.visibility_outlined,
                ),
                onPressed: () => setState(() => showPassword = !showPassword),
              )
            : null,
      ),
      validator: (value) {
        final v = value ?? '';
        if (v.isEmpty || (!secret && v.trim().isEmpty)) {
          return 'Enter ${label.toLowerCase()}.';
        }
        if (isEmail &&
            !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(v.trim())) {
          return 'Enter a valid email address.';
        }
        if (secret && view != 'login' && v.length < 12) {
          return 'Use at least 12 characters.';
        }
        if (confirm && v != password.text) return 'Passwords do not match.';
        if (isCode && v.length != 6) return 'Enter the six-digit code.';
        if (fullName && v.trim().length < 2) return 'Enter your full name.';
        return null;
      },
      onFieldSubmitted: (_) {
        if (!busy) submit();
      },
    ),
  );
  String title() => {
    'boot': 'Opening your account',
    'login': 'Welcome back.',
    'signup': 'Make a beginning.',
    'recovery': 'Let’s get you back.',
    'otp': 'Check your inbox.',
    'reset': 'A fresh start.',
    'account': 'Your account.',
    'denied': 'Access restricted.',
  }[view]!;
  String subtitle() => switch (view) {
    'login' => 'Sign in to your Orwickle account. We’ll email a code after checking your password.',
    'signup' => 'Create your account, then verify your email to continue.',
    'recovery' => 'If an eligible account exists, we’ll email a recovery code.',
    'otp' =>
      'Enter the six-digit ${challenge?['purpose'] == 'signup'
          ? 'verification'
          : challenge?['purpose'] == 'recovery'
          ? 'recovery'
          : 'sign-in'} code sent to ${email.text.trim()}. It expires in 10 minutes.',
    'reset' => 'Use at least 12 characters. Updating your password signs out all existing sessions.',
    'account' => 'Your secure space on Orwickle.',
    'denied' => 'This account cannot access the mobile app. Use the administrator web panel.',
    _ => 'Checking your saved session…',
  };
  Widget message(String text, bool isError) => Container(
    width: double.infinity,
    margin: const EdgeInsets.only(bottom: 20),
    padding: const EdgeInsets.all(15),
    decoration: BoxDecoration(
      color: isError ? const Color(0xFFF8E5DD) : const Color(0xFFE3EADD),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Semantics(
      liveRegion: true,
      child: Text(
        text,
        style: TextStyle(
          color: isError ? const Color(0xFF8E3C28) : ink,
          fontSize: 13,
          height: 1.5,
        ),
      ),
    ),
  );
  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 28, 24, 36),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    OrwickleMark(),
                    SizedBox(width: 11),
                    Text(
                      'Orwickle',
                      style: TextStyle(
                        fontSize: 27,
                        fontWeight: FontWeight.w600,
                        letterSpacing: -1,
                        color: ink,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 46),
                Text(
                  view == 'account' ? 'SIGNED IN SECURELY' : 'A PLACE TO BEGIN',
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 2.4,
                    color: muted,
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  title(),
                  style: const TextStyle(
                    fontSize: 34,
                    fontWeight: FontWeight.w500,
                    letterSpacing: -1.3,
                    color: ink,
                    height: 1.15,
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  subtitle(),
                  style: const TextStyle(
                    color: muted,
                    fontSize: 14,
                    height: 1.65,
                  ),
                ),
                const SizedBox(height: 28),
                if (notice.isNotEmpty) message(notice, false),
                if (error.isNotEmpty) message(error, true),
                if (view == 'boot')
                  const Center(child: CircularProgressIndicator()),
                if (view == 'denied')
                  FilledButton(
                    onPressed: busy ? null : () => run(signOut),
                    child: const Text('Sign out'),
                  ),
                if ([
                  'login',
                  'signup',
                  'recovery',
                  'otp',
                  'reset',
                ].contains(view))
                  AutofillGroup(
                    child: Form(
                      key: form,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (view == 'signup')
                            field('Full name', name, fullName: true),
                          if (['login', 'signup', 'recovery'].contains(view))
                            field('Email address', email, isEmail: true),
                          if (['login', 'signup', 'reset'].contains(view))
                            field(
                              view == 'reset' ? 'New password' : 'Password',
                              password,
                              secret: true,
                            ),
                          if (['signup', 'reset'].contains(view))
                            field(
                              'Confirm password',
                              confirmation,
                              secret: true,
                              confirm: true,
                            ),
                          if (view == 'signup') ...[
                            const Text(
                              'I’m joining as',
                              style: TextStyle(
                                color: ink,
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 10),
                            SegmentedButton<String>(
                              showSelectedIcon: false,
                              segments: const [
                                ButtonSegment(
                                  value: 'student',
                                  label: Text('Student'),
                                ),
                                ButtonSegment(
                                  value: 'investor',
                                  label: Text('Investor'),
                                ),
                                ButtonSegment(
                                  value: 'buyer',
                                  label: Text('Buyer'),
                                ),
                              ],
                              selected: {role},
                              onSelectionChanged: busy
                                  ? null
                                  : (value) =>
                                        setState(() => role = value.first),
                            ),
                            const SizedBox(height: 26),
                          ],
                          if (view == 'otp')
                            field(
                              'Email verification code',
                              code,
                              isCode: true,
                            ),
                          FilledButton(
                            onPressed: busy ? null : submit,
                            child: busy
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : Text(
                                    {
                                      'login': 'Continue with email code',
                                      'signup': 'Create account',
                                      'recovery': 'Send recovery code',
                                      'otp': 'Verify code',
                                      'reset': 'Update password',
                                    }[view]!,
                                  ),
                          ),
                          if (view == 'login') ...[
                            TextButton(
                              onPressed: busy
                                  ? null
                                  : () => navigate('recovery'),
                              child: const Text('Forgot password?'),
                            ),
                            const SizedBox(height: 16),
                            OutlinedButton(
                              onPressed: busy ? null : () => navigate('signup'),
                              child: const Text('Create an account'),
                            ),
                          ],
                          if (view == 'otp')
                            TextButton(
                              onPressed:
                                  busy ||
                                      resendSeconds > 0 ||
                                      (challenge!['resendsRemaining'] as int) ==
                                          0
                                  ? null
                                  : () => run(() async {
                                      final purpose = challenge!['purpose'];
                                      final data = await api.call(
                                        '/auth/resend',
                                        {
                                          'challengeId':
                                              challenge!['challengeId'],
                                          'purpose': purpose,
                                        },
                                      );
                                      if (mounted) {
                                        setState(() {
                                          challenge = {
                                            ...data,
                                            'purpose': purpose,
                                          };
                                          notice = 'A new code has been sent. Use the latest email.';
                                        });
                                      }
                                    }),
                              child: Text(
                                resendSeconds > 0
                                    ? 'Resend in ${resendSeconds}s'
                                    : challenge!['resendsRemaining'] == 0
                                    ? 'Resend limit reached'
                                    : 'Resend code · ${challenge!['resendsRemaining']} remaining',
                              ),
                            ),
                          if (view != 'login')
                            TextButton(
                              onPressed: busy ? null : () => navigate('login'),
                              child: Text(
                                view == 'signup'
                                    ? 'Already registered? Sign in'
                                    : 'Back to sign in',
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                if (view == 'account' && account != null) ...accountWidgets(),
                const SizedBox(height: 30),
                const Divider(color: Color(0xFFDFE1D7)),
                const SizedBox(height: 10),
                const Text(
                  'Protected with password and email verification.',
                  style: TextStyle(fontSize: 11, color: muted),
                ),
                if (kDebugMode)
                  const ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    title: Text(
                      'Development connection',
                      style: TextStyle(fontSize: 12, color: muted),
                    ),
                    children: [BackendConnection()],
                  ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
  List<Widget> accountWidgets() => [
    Container(
      width: double.infinity,
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: const Color(0xFFE8ECDF),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            backgroundColor: ink,
            foregroundColor: paper,
            child: Text(
              (account!['fullName'] as String).substring(0, 1).toUpperCase(),
            ),
          ),
          const SizedBox(height: 18),
          Text(
            account!['fullName'] as String,
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w600,
              color: ink,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            account!['email'] as String,
            style: const TextStyle(color: muted, fontSize: 13),
          ),
          const SizedBox(height: 16),
          Text(
            '${roleLabel(account!['role'] as String)} · Email verified',
            style: const TextStyle(fontSize: 12, color: ink),
          ),
        ],
      ),
    ),
    const SizedBox(height: 30),
    Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        const Text(
          'Active sessions',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w600,
            color: ink,
          ),
        ),
        IconButton(
          tooltip: 'Refresh sessions',
          onPressed: busy ? null : () => run(loadAccount),
          icon: const Icon(Icons.refresh_rounded),
        ),
      ],
    ),
    const Text(
      'Review where you’re signed in.',
      style: TextStyle(color: muted, fontSize: 13),
    ),
    const SizedBox(height: 10),
    ...sessions.map((raw) {
      final s = raw as Map<String, dynamic>;
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 18),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Color(0xFFD9DED2))),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.devices_outlined, size: 19, color: muted),
                const SizedBox(width: 10),
                Text(
                  s['isCurrent'] == true ? 'This session' : 'Other session',
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    color: ink,
                  ),
                ),
                if (s['isCurrent'] == true) ...[
                  const Spacer(),
                  const Text(
                    'Current',
                    style: TextStyle(color: muted, fontSize: 11),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 10),
            Text(
              s['deviceLabel'] as String,
              style: const TextStyle(color: muted, fontSize: 11, height: 1.5),
            ),
            const SizedBox(height: 8),
            Text(
              'Last active ${dateLabel(s['lastSeenAt'] as String)}\nExpires ${dateLabel(s['expiresAt'] as String)}',
              style: const TextStyle(color: muted, fontSize: 12, height: 1.7),
            ),
            if (s['isCurrent'] != true)
              TextButton(
                onPressed: busy
                    ? null
                    : () => run(() async {
                        await api.call('/sessions/${s['id']}', {}, 'DELETE');
                        await loadAccount();
                      }),
                child: const Text('Sign out this session'),
              ),
          ],
        ),
      );
    }),
    const SizedBox(height: 26),
    OutlinedButton(
      onPressed: busy || sessions.length < 2
          ? null
          : () => run(() async {
              await api.call('/sessions/revoke-others', {});
              await loadAccount();
              if (mounted) {
                setState(() => notice = 'Other sessions signed out.');
              }
            }),
      child: const Text('Sign out other sessions'),
    ),
    const SizedBox(height: 12),
    FilledButton(
      onPressed: busy ? null : () => run(signOut),
      child: const Text('Sign out'),
    ),
  ];
  String roleLabel(String role) =>
      '${role[0].toUpperCase()}${role.substring(1)}';
  String dateLabel(String raw) {
    final d = DateTime.parse(raw).toLocal();
    return '${d.day}/${d.month}/${d.year} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  }
}
