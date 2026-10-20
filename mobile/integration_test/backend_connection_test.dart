import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:orwickle/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Android app reaches the real Express backend', (tester) async {
    app.main();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Check connection'));
    for (var attempt = 0; attempt < 100; attempt++) {
      await tester.pump(const Duration(milliseconds: 200));
      if (find.text('Checking connection...').evaluate().isEmpty) break;
    }
    final observedText = tester
        .widgetList<Text>(find.byType(Text))
        .map((widget) => widget.data ?? '')
        .join(' | ');
    const requireDatabase = bool.fromEnvironment('REQUIRE_DATABASE');
    if (requireDatabase) {
      expect(
        find.text('Backend and database connected securely'),
        findsOneWidget,
        reason: 'Observed app text: $observedText',
      );
    } else {
      final reached =
          find.textContaining('Backend reachable').evaluate().isNotEmpty ||
          find
              .text('Backend and database connected securely')
              .evaluate()
              .isNotEmpty;
      expect(
        reached,
        isTrue,
        reason: 'Emulator must receive a real backend response',
      );
    }
    // Confirm that the original starter still works after the connection check.
    await tester.tap(find.byTooltip('Increment'));
    await tester.pump();
    expect(find.text('1'), findsOneWidget);
  });
}
