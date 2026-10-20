import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

const backendBaseUrl = String.fromEnvironment(
  'BACKEND_BASE_URL',
  defaultValue: 'http://10.0.2.2:3000',
);

class BackendConnection extends StatefulWidget {
  const BackendConnection({super.key, this.client});

  final http.Client? client;

  @override
  State<BackendConnection> createState() => _BackendConnectionState();
}

class _BackendConnectionState extends State<BackendConnection> {
  late final http.Client _client = widget.client ?? http.Client();
  String _status = 'Connection not checked';
  bool _checking = false;

  Future<void> _checkConnection() async {
    setState(() => _checking = true);
    var status = 'Backend unreachable';
    try {
      final base = Uri.parse(backendBaseUrl);
      final live = await _client
          .get(base.resolve('/health/live'))
          .timeout(const Duration(seconds: 8));
      final body = jsonDecode(live.body);
      if (live.statusCode == 200 &&
          body is Map<String, dynamic> &&
          body['service'] == 'orwickle-backend' &&
          body['status'] == 'ok') {
        status = 'Backend reachable; database check failed';
        try {
          final ready = await _client
              .get(base.resolve('/health/ready'))
              .timeout(const Duration(seconds: 8));
          final readiness = jsonDecode(ready.body);
          if (ready.statusCode == 200 &&
              readiness is Map<String, dynamic> &&
              readiness['database'] == 'ok' &&
              readiness['tls'] == true) {
            status = 'Backend and database connected securely';
          } else if (ready.statusCode == 503) {
            status = 'Backend reachable; database unavailable';
          }
        } catch (_) {
          // Retain the successful backend result if only readiness fails.
        }
      }
    } catch (_) {
      // Show a useful status without displaying raw network errors.
    }
    if (!mounted) return;
    setState(() {
      _status = status;
      _checking = false;
    });
  }

  @override
  void dispose() {
    if (widget.client == null) _client.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Text(_status, textAlign: TextAlign.center),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: _checking ? null : _checkConnection,
            child: Text(
              _checking ? 'Checking connection...' : 'Check connection',
            ),
          ),
        ],
      ),
    );
  }
}
