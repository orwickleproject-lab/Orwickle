import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:orwickle/backend_connection.dart';

void main() {
  testWidgets('reports backend reachable when database is unavailable', (
    tester,
  ) async {
    final paths = <String>[];
    final client = MockClient((request) async {
      paths.add(request.url.path);
      return request.url.path == '/health/live'
          ? http.Response('{"status":"ok","service":"orwickle-backend"}', 200)
          : http.Response('{"error":{"code":"DATABASE_NOT_CONFIGURED"}}', 503);
    });
    addTearDown(client.close);
    await tester.pumpWidget(
      MaterialApp(home: BackendConnection(client: client)),
    );
    await tester.tap(find.text('Check connection'));
    await tester.pumpAndSettle();
    expect(paths, ['/health/live', '/health/ready']);
    expect(
      find.text('Backend reachable; database unavailable'),
      findsOneWidget,
    );
  });

  testWidgets(
    'only reports secure database success when backend verifies TLS',
    (tester) async {
      final client = MockClient((request) async {
        return request.url.path == '/health/live'
            ? http.Response('{"status":"ok","service":"orwickle-backend"}', 200)
            : http.Response('{"database":"ok","tls":true}', 200);
      });
      addTearDown(client.close);
      await tester.pumpWidget(
        MaterialApp(home: BackendConnection(client: client)),
      );
      await tester.tap(find.text('Check connection'));
      await tester.pumpAndSettle();
      expect(
        find.text('Backend and database connected securely'),
        findsOneWidget,
      );
    },
  );

  testWidgets('network failures show a recoverable status', (tester) async {
    final client = MockClient(
      (_) async => throw http.ClientException('offline'),
    );
    addTearDown(client.close);
    await tester.pumpWidget(
      MaterialApp(home: BackendConnection(client: client)),
    );
    await tester.tap(find.text('Check connection'));
    await tester.pumpAndSettle();
    expect(find.text('Backend unreachable'), findsOneWidget);
    expect(
      tester.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed,
      isNotNull,
    );
  });
}
