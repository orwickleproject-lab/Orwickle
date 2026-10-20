// Presentation smoke test. All authentication responses here are explicit fixtures.
// Real backend connectivity is covered separately by backend_connection_test.dart.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:integration_test/integration_test.dart';
import 'package:orwickle/auth_api.dart';
import 'package:orwickle/main.dart';

class _EmptyStorage implements SessionStorage {
  @override
  Future<String?> read() async => null;
  @override
  Future<void> write(String value) async {}
  @override
  Future<void> clear() async {}
}

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('reference auth screens render and navigate on Android', (
    tester,
  ) async {
    final api = AuthApi(
      storage: _EmptyStorage(),
      client: MockClient((request) async {
        if (request.url.path == '/api/csrf') {
          return http.Response('{"csrfToken":"ui-fixture"}', 200);
        }
        if (request.url.path == '/api/auth/login') {
          return http.Response(
            jsonEncode({
              'challengeId': 'ui-fixture-challenge',
              'resendAt': DateTime.now()
                  .add(const Duration(seconds: 45))
                  .toIso8601String(),
              'resendsRemaining': 3,
            }),
            200,
          );
        }
        return http.Response('{}', 404);
      }),
    );
    await tester.pumpWidget(MyApp(api: api));
    await tester.pumpAndSettle();
    await binding.convertFlutterSurfaceToImage();
    await tester.pumpAndSettle();
    await binding.takeScreenshot('01-login');
    await tester.ensureVisible(find.text('Create account'));
    await tester.tap(find.text('Create account'));
    await tester.pumpAndSettle();
    expect(find.text('Choose your role'), findsOneWidget);
    await binding.takeScreenshot('02-signup');
    await tester.ensureVisible(find.text('Sign in'));
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Forgot password?'));
    await tester.pumpAndSettle();
    expect(find.text('Send reset code'), findsOneWidget);
    await binding.takeScreenshot('03-recovery');
    await tester.tap(find.text('Back to sign in'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('field-email')),
      'name@example.test',
    );
    await tester.enterText(
      find.byKey(const ValueKey('field-password')),
      'presentation fixture only',
    );
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Continue'));
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Verify your email'), findsOneWidget);
    await binding.takeScreenshot('04-otp');
    await tester.tap(find.text('Verify code'));
    await tester.pumpAndSettle();
    expect(find.text('Enter the six-digit code.'), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('otp-input')), '123456');
    await tester.pumpAndSettle();
    expect(find.text('1'), findsOneWidget);
    expect(find.text('6'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    api.close();
  });
}
