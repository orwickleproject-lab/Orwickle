import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:orwickle/auth_api.dart';
import 'package:orwickle/main.dart';

class MemoryStorage implements SessionStorage {
  String? value;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String value) async {
    this.value = value;
  }

  @override
  Future<void> clear() async {
    value = null;
  }
}

void main() {
  testWidgets(
    'signup offers exactly three public roles and validates passwords',
    (tester) async {
      final api = AuthApi(
        storage: MemoryStorage(),
        client: MockClient((_) async => http.Response('{}', 500)),
      );
      await tester.pumpWidget(MyApp(api: api));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Create account'));
      await tester.tap(find.text('Create account'));
      await tester.pumpAndSettle();
      expect(find.text('Student'), findsOneWidget);
      expect(find.text('Investor'), findsOneWidget);
      expect(find.text('Buyer'), findsOneWidget);
      expect(find.text('Administrator'), findsNothing);
      await tester.ensureVisible(find.text('Create account'));
      await tester.tap(find.text('Create account'));
      await tester.pumpAndSettle();
      expect(find.text('Enter full name.'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      api.close();
    },
  );
  testWidgets(
    'password step shows OTP and opens protected account only after verification',
    (tester) async {
      final storage = MemoryStorage();
      bool authenticated = false;
      final account = {
        'id': 'test',
        'fullName': 'Sample Student',
        'email': 'student@example.test',
        'role': 'student',
        'emailVerified': true,
      };
      final api = AuthApi(
        storage: storage,
        client: MockClient((req) async {
          final path = req.url.path;
          if (path == '/api/csrf') {
            return http.Response(
              jsonEncode({'csrfToken': 'test-csrf'}),
              200,
              headers: {'set-cookie': 'orwickle.sid=anonymous; HttpOnly'},
            );
          }
          if (path == '/api/auth/login') {
            return http.Response(
              jsonEncode({
                'challengeId': 'test-challenge',
                'resendAt': DateTime.now()
                    .add(const Duration(minutes: 1))
                    .toIso8601String(),
                'resendsRemaining': 3,
              }),
              200,
            );
          }
          if (path == '/api/auth/login/verify') {
            authenticated = true;
            return http.Response(
              jsonEncode({'account': account, 'csrfToken': 'next-csrf'}),
              200,
              headers: {
                'set-cookie': 'orwickle.sid=authenticated-test; HttpOnly',
              },
            );
          }
          if (path == '/api/account' || path == '/api/roles/student') {
            return http.Response(
              jsonEncode({'account': account}),
              authenticated ? 200 : 401,
            );
          }
          if (path == '/api/sessions') {
            return http.Response('{"sessions":[]}', 200);
          }
          return http.Response('{}', 404);
        }),
      );
      await tester.pumpWidget(MyApp(api: api));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('field-email')),
        'student@example.test',
      );
      await tester.enterText(
        find.byKey(const ValueKey('field-password')),
        'test-only long password',
      );
      await tester.ensureVisible(find.text('Continue'));
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(find.text('Verify your email'), findsOneWidget);
      expect(storage.value, isNull);
      expect(find.text('Sample Student'), findsNothing);
      await tester.enterText(find.byKey(const ValueKey('otp-input')), '123456');
      await tester.ensureVisible(find.text('Verify code'));
      await tester.tap(find.text('Verify code'));
      await tester.pumpAndSettle();
      expect(find.text('Sample Student'), findsOneWidget);
      expect(storage.value, isNotNull);
      await tester.pumpWidget(const SizedBox());
      api.close();
    },
  );
  test(
    'API restores a saved session and deletes it after server revocation',
    () async {
      final storage = MemoryStorage()..value = 'orwickle.sid=test-saved';
      final api = AuthApi(
        storage: storage,
        client: MockClient((req) async {
          expect(req.headers['Cookie'], isNotNull);
          return http.Response(
            '{"error":{"code":"SESSION_EXPIRED","message":"Session ended"}}',
            401,
          );
        }),
      );
      expect(await api.restore(), isTrue);
      await expectLater(api.call('/account'), throwsA(isA<AuthFailure>()));
      expect(storage.value, isNull);
      api.close();
    },
  );
}
