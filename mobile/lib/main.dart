import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'auth_api.dart';
import 'auth_design.dart';
import 'backend_connection.dart';

void main() => runApp(const MyApp());

class MyApp extends StatelessWidget {
  final AuthApi? api;
  const MyApp({super.key, this.api});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Orwickle',
    debugShowCheckedModeBanner: false,
    theme: orwickleTheme(),
    home: AccountFlow(api: api),
  );
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
  bool busy = false, showPassword = false, showConfirmation = false;
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
    FocusScope.of(context).unfocus();
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
      showConfirmation = false;
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
    if (mounted) {
      setState(() {
        account = user;
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
    FocusScope.of(context).unfocus();
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
        setState(() => notice = 'Password updated. Sign in again.');
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
    bool confirm = false,
    bool fullName = false,
    double bottom = 18,
  }) => Padding(
    padding: EdgeInsets.only(bottom: bottom),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ExcludeSemantics(
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: ink,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Semantics(
          label: label,
          child: TextFormField(
            key: ValueKey('field-${label.toLowerCase().replaceAll(' ', '-')}'),
            controller: controller,
            enabled: !busy,
            obscureText: secret && !(confirm ? showConfirmation : showPassword),
            keyboardType: isEmail
                ? TextInputType.emailAddress
                : secret
                ? TextInputType.visiblePassword
                : TextInputType.name,
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
                : [AutofillHints.name],
            autocorrect: !secret && !isEmail,
            enableSuggestions: !secret,
            maxLength: secret
                ? 128
                : fullName
                ? 100
                : 254,
            style: const TextStyle(color: ink, fontSize: 15, height: 1.4),
            textInputAction:
                fullName ||
                    isEmail && view != 'recovery' ||
                    secret && !confirm && view != 'login'
                ? TextInputAction.next
                : TextInputAction.done,
            decoration: InputDecoration(
              isDense: true,
              counterText: '',
              hintText: isEmail
                  ? 'name@example.com'
                  : fullName
                  ? 'Your full name'
                  : confirm
                  ? 'Re-enter your password'
                  : view == 'login'
                  ? 'Enter your password'
                  : 'At least 12 characters',
              suffixIcon: secret
                  ? IconButton(
                      tooltip: (confirm ? showConfirmation : showPassword)
                          ? 'Hide $label'
                          : 'Show $label',
                      icon: Icon(
                        (confirm ? showConfirmation : showPassword)
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined,
                        size: 23,
                        color: ink,
                      ),
                      onPressed: busy
                          ? null
                          : () => setState(() {
                              if (confirm) {
                                showConfirmation = !showConfirmation;
                              } else {
                                showPassword = !showPassword;
                              }
                            }),
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
              if (confirm && v != password.text) {
                return 'Passwords do not match.';
              }
              if (fullName && v.trim().length < 2) {
                return 'Enter your full name.';
              }
              return null;
            },
            onFieldSubmitted: (_) {
              if (busy) return;
              if (fullName ||
                  isEmail && view != 'recovery' ||
                  secret && !confirm && view != 'login') {
                FocusScope.of(context).nextFocus();
              } else {
                submit();
              }
            },
          ),
        ),
      ],
    ),
  );

  String title() => {
    'boot': 'Opening your account',
    'login': 'Welcome back',
    'signup': 'Create your account',
    'recovery': 'Forgot password?',
    'otp': 'Verify your email',
    'reset': 'Set a new password',
    'account': 'Your account',
    'denied': 'Access restricted',
  }[view]!;

  String get maskedEmail {
    final value = email.text.trim();
    final at = value.lastIndexOf('@');
    return at > 0
        ? '${value.substring(0, 1)}***${value.substring(at)}'
        : 'your email address';
  }

  String subtitle() => switch (view) {
    'login' => 'Sign in to continue',
    'recovery' => 'Enter your email to receive a reset code.',
    'otp' => 'Enter the 6-digit code sent to\n$maskedEmail',
    'reset' => 'Choose a password with at least 12 characters.',
    'account' => 'Your verified account.',
    'denied' => 'This account uses the administrator web panel.',
    _ => 'Checking your saved session…',
  };

  Widget message(String text, bool isError) => Container(
    width: double.infinity,
    margin: const EdgeInsets.only(bottom: 22),
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: isError ? const Color(0xFFFFF3F3) : tealWash,
      borderRadius: BorderRadius.circular(9),
      border: Border.all(
        color: isError ? const Color(0xFFF0CDD2) : const Color(0xFFC8E8E8),
      ),
    ),
    child: Semantics(
      liveRegion: true,
      child: Text(
        text,
        style: TextStyle(
          fontSize: 13,
          height: 1.6,
          color: isError ? const Color(0xFFA33947) : teal,
        ),
      ),
    ),
  );

  void openConnectionCheck() {
    showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      builder: (context) => const Padding(
        padding: EdgeInsets.fromLTRB(24, 26, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Development connection',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w600,
                color: ink,
              ),
            ),
            SizedBox(height: 12),
            BackendConnection(),
          ],
        ),
      ),
    );
  }

  Widget footerLink(String label, VoidCallback action) =>
      TextButton(onPressed: busy ? null : action, child: Text(label));

  Widget authForm() => AutofillGroup(
    child: Form(
      key: form,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (view == 'signup')
            field('Full name', name, fullName: true, bottom: 15),
          if (['login', 'signup', 'recovery'].contains(view))
            field(
              'Email',
              email,
              isEmail: true,
              bottom: view == 'signup'
                  ? 15
                  : view == 'login'
                  ? 21
                  : 0,
            ),
          if (['login', 'signup', 'reset'].contains(view))
            field(
              view == 'reset' ? 'New password' : 'Password',
              password,
              secret: true,
              bottom: view == 'login' ? 0 : 15,
            ),
          if (['signup', 'reset'].contains(view))
            field(
              'Confirm password',
              confirmation,
              secret: true,
              confirm: true,
              bottom: view == 'signup' ? 19 : 0,
            ),
          if (view == 'login')
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: busy ? null : () => navigate('recovery'),
                child: const Text(
                  'Forgot password?',
                  style: TextStyle(
                    decoration: TextDecoration.underline,
                    decorationColor: teal,
                    decorationThickness: 1.1,
                  ),
                ),
              ),
            ),
          if (view == 'signup') ...[
            const Text(
              'Choose your role',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: ink,
              ),
            ),
            const SizedBox(height: 10),
            AuthRolePicker(
              selected: role,
              onChanged: busy ? null : (next) => setState(() => role = next),
            ),
          ],
          if (view == 'otp')
            OtpCodeField(controller: code, enabled: !busy, onSubmitted: submit),
          SizedBox(
            height: switch (view) {
              'login' => 35,
              'signup' => 22,
              'otp' => 36,
              'recovery' => 39,
              _ => 28,
            },
          ),
          AuthPrimaryButton(
            label: {
              'login': 'Continue',
              'signup': 'Create account',
              'recovery': 'Send reset code',
              'otp': 'Verify code',
              'reset': 'Update password',
            }[view]!,
            busy: busy,
            onPressed: submit,
          ),
          if (view == 'login') ...[
            const SizedBox(height: 15),
            const Text(
              'Next, enter the code sent to your email.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: muted, height: 1.6),
            ),
            const SizedBox(height: 41),
            const Divider(),
            const SizedBox(height: 24),
            Wrap(
              alignment: WrapAlignment.center,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 7,
              children: [
                const Text(
                  'New here?',
                  style: TextStyle(fontSize: 14, color: ink),
                ),
                footerLink('Create account', () => navigate('signup')),
              ],
            ),
          ],
          if (view == 'signup') ...[
            const SizedBox(height: 17),
            Row(
              children: [
                const Expanded(child: Divider()),
                const SizedBox(width: 10),
                Flexible(
                  flex: 5,
                  fit: FlexFit.tight,
                  child: Wrap(
                    alignment: WrapAlignment.center,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 5,
                    children: [
                      const Text(
                        'Already registered?',
                        style: TextStyle(fontSize: 12, color: muted),
                      ),
                      footerLink('Sign in', () => navigate('login')),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                const Expanded(child: Divider()),
              ],
            ),
          ],
          if (view == 'otp') ...[
            const SizedBox(height: 12),
            TextButton(
              onPressed:
                  busy ||
                      resendSeconds > 0 ||
                      challenge!['resendsRemaining'] == 0
                  ? null
                  : () => run(() async {
                      final purpose = challenge!['purpose'];
                      final data = await api.call('/auth/resend', {
                        'challengeId': challenge!['challengeId'],
                        'purpose': purpose,
                      });
                      if (mounted) {
                        setState(() {
                          challenge = {...data, 'purpose': purpose};
                          code.clear();
                          notice =
                              'A new code has been sent. Use the latest email.';
                        });
                      }
                    }),
              style: TextButton.styleFrom(disabledForegroundColor: muted),
              child: Text(
                resendSeconds > 0
                    ? 'Resend in 00:${resendSeconds.toString().padLeft(2, '0')}'
                    : challenge!['resendsRemaining'] == 0
                    ? 'Resend limit reached'
                    : 'Resend code',
              ),
            ),
            const SizedBox(height: 15),
            const Divider(),
            const SizedBox(height: 12),
            footerLink(
              'Use another email',
              () => navigate(challenge!['purpose'] as String),
            ),
          ],
          if (['recovery', 'reset'].contains(view)) ...[
            const SizedBox(height: 37),
            const Divider(),
            const SizedBox(height: 14),
            footerLink('Back to sign in', () => navigate('login')),
          ],
        ],
      ),
    ),
  );

  @override
  Widget build(BuildContext context) => AnnotatedRegion<SystemUiOverlayStyle>(
    value: const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
      statusBarBrightness: Brightness.light,
      systemNavigationBarColor: Colors.white,
      systemNavigationBarIconBrightness: Brightness.dark,
    ),
    child: Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            key: ValueKey(view),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(28, 20, 28, 28),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        if (['recovery', 'reset'].contains(view)) ...[
                          IconButton(
                            tooltip: 'Back to sign in',
                            onPressed: busy ? null : () => navigate('login'),
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(
                              minWidth: 32,
                              minHeight: 44,
                            ),
                            icon: const Icon(
                              Icons.arrow_back_rounded,
                              color: ink,
                              size: 24,
                            ),
                          ),
                          const SizedBox(width: 15),
                        ],
                        OrwickleBrand(
                          key: const ValueKey('orwickle-brand'),
                          onLongPress: kDebugMode ? openConnectionCheck : null,
                        ),
                      ],
                    ),
                    SizedBox(
                      height: view == 'signup'
                          ? 25
                          : ['login', 'otp', 'recovery', 'reset'].contains(view)
                          ? 48
                          : 34,
                    ),
                    Text(
                      title(),
                      style: TextStyle(
                        color: ink,
                        fontSize: view == 'signup' ? 28 : 31,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -1.15,
                        height: 1.25,
                      ),
                    ),
                    if (view != 'signup') ...[
                      const SizedBox(height: 8),
                      Text(
                        subtitle(),
                        style: const TextStyle(
                          color: muted,
                          fontSize: 16,
                          height: 1.6,
                          fontWeight: FontWeight.w400,
                        ),
                      ),
                    ],
                    SizedBox(
                      height: view == 'signup'
                          ? 21
                          : view == 'otp'
                          ? 32
                          : view == 'login'
                          ? 35
                          : 29,
                    ),
                    if (notice.isNotEmpty) message(notice, false),
                    if (error.isNotEmpty) message(error, true),
                    if (view == 'boot')
                      const Center(child: CircularProgressIndicator()),
                    if (view == 'denied')
                      AuthPrimaryButton(
                        label: 'Sign out',
                        busy: busy,
                        onPressed: () => run(signOut),
                      ),
                    if ([
                      'login',
                      'signup',
                      'recovery',
                      'otp',
                      'reset',
                    ].contains(view))
                      authForm(),
                    if (view == 'account' && account != null)
                      ...accountWidgets(),
                  ],
                ),
              ),
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
        color: tealWash,
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
    FilledButton(
      onPressed: busy ? null : () => run(signOut),
      child: const Text('Sign out'),
    ),
  ];
  String roleLabel(String role) =>
      '${role[0].toUpperCase()}${role.substring(1)}';
}
