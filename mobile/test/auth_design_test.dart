import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:orwickle/auth_api.dart';
import 'package:orwickle/auth_design.dart';
import 'package:orwickle/main.dart';

import 'widget_test.dart' show MemoryStorage;

void main() {
  testWidgets('six OTP cells retain native paste, deletion and validation', (
    tester,
  ) async {
    final controller = TextEditingController();
    final form = GlobalKey<FormState>();
    await tester.pumpWidget(
      MaterialApp(
        theme: orwickleTheme(),
        home: Scaffold(
          body: Form(
            key: form,
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: OtpCodeField(controller: controller, onSubmitted: () {}),
            ),
          ),
        ),
      ),
    );
    for (var i = 0; i < 6; i++) {
      expect(find.byKey(ValueKey('otp-cell-$i')), findsOneWidget);
    }
    expect(find.byType(EditableText), findsOneWidget);
    final input = find.byKey(const ValueKey('otp-input'));
    await tester.enterText(input, '12x34567');
    expect(controller.text, '123456');
    expect(form.currentState!.validate(), isTrue);
    await tester.pump();
    final cell = find.byKey(const ValueKey('otp-cell-2'));
    await tester.tapAt(tester.getCenter(cell));
    await tester.pump();
    expect(controller.selection.baseOffset, 2);
    tester.testTextInput.updateEditingValue(
      const TextEditingValue(
        text: '13456',
        selection: TextSelection.collapsed(offset: 1),
      ),
    );
    await tester.pump();
    expect(controller.text, '13456');
    expect(form.currentState!.validate(), isFalse);
    await tester.pump();
    expect(find.text('Enter the six-digit code.'), findsOneWidget);
    await tester.enterText(input, '654321');
    expect(form.currentState!.validate(), isTrue);
    await tester.pump();
    expect(find.text('Enter the six-digit code.'), findsNothing);
    await tester.pumpWidget(const SizedBox());
    controller.dispose();
  });

  testWidgets(
    'compact signup selects a role and keeps eye toggles independent',
    (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      Map<String, dynamic>? submitted;
      final api = AuthApi(
        storage: MemoryStorage(),
        client: MockClient((request) async {
          if (request.url.path == '/api/csrf') {
            return http.Response('{"csrfToken":"fixture-csrf"}', 200);
          }
          if (request.url.path == '/api/auth/signup') {
            submitted = jsonDecode(request.body) as Map<String, dynamic>;
            return http.Response(
              jsonEncode({
                'challengeId': 'fixture-signup',
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
      await tester.ensureVisible(find.text('Create account'));
      await tester.tap(find.text('Create account'));
      await tester.pumpAndSettle();
      final pass = find.byKey(const ValueKey('field-password'));
      final confirm = find.byKey(const ValueKey('field-confirm-password'));
      await tester.ensureVisible(find.byTooltip('Show Password'));
      await tester.tap(find.byTooltip('Show Password'));
      await tester.pumpAndSettle();
      bool isObscured(Finder field) => tester
          .widget<TextField>(
            find.descendant(of: field, matching: find.byType(TextField)),
          )
          .obscureText;
      expect(isObscured(pass), isFalse);
      expect(isObscured(confirm), isTrue);
      await tester.enterText(
        find.byKey(const ValueKey('field-full-name')),
        'Example Investor',
      );
      await tester.enterText(
        find.byKey(const ValueKey('field-email')),
        'investor@example.test',
      );
      await tester.enterText(pass, 'fixture-only password');
      await tester.enterText(confirm, 'fixture-only password');
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      final role = find.byKey(const ValueKey('role-investor'));
      await tester.ensureVisible(role);
      await tester.pumpAndSettle();
      await tester.tap(role);
      await tester.pumpAndSettle();
      expect(
        tester.widget<AuthRolePicker>(find.byType(AuthRolePicker)).selected,
        'investor',
      );
      await tester.ensureVisible(find.text('Create account'));
      await tester.tap(find.text('Create account'));
      await tester.pumpAndSettle();
      expect(submitted?['role'], 'investor');
      expect(find.text('Verify your email'), findsOneWidget);
      expect(find.textContaining('i***@example.test'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.ensureVisible(find.text('Use another email'));
      await tester.tap(find.text('Use another email'));
      await tester.pumpAndSettle();
      expect(find.text('Create your account'), findsOneWidget);
      expect(isObscured(pass), isTrue);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      api.close();
    },
  );
}
