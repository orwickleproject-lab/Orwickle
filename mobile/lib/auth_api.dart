import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'backend_connection.dart';

abstract class SessionStorage {
  Future<String?> read();
  Future<void> write(String value);
  Future<void> clear();
}

class SecureSessionStorage implements SessionStorage {
  final FlutterSecureStorage storage;
  const SecureSessionStorage([this.storage = const FlutterSecureStorage()]);
  static const key = 'orwickle.session.v1';
  @override
  Future<String?> read() => storage.read(key: key);
  @override
  Future<void> write(String value) => storage.write(key: key, value: value);
  @override
  Future<void> clear() => storage.delete(key: key);
}

class AuthFailure implements Exception {
  final String message;
  final int status;
  final String code;
  const AuthFailure(this.message, this.status, [this.code = '']);
  @override
  String toString() => message;
}

class AuthApi {
  final http.Client client;
  final SessionStorage storage;
  final String baseUrl;
  String? _cookie;
  String? _csrf;
  bool _authenticated = false;
  AuthApi({
    http.Client? client,
    this.storage = const SecureSessionStorage(),
    this.baseUrl = backendBaseUrl,
  }) : client = client ?? http.Client();
  Future<bool> restore() async {
    _cookie = await storage.read();
    _authenticated = _cookie != null;
    return _authenticated;
  }

  Future<void> clear() async {
    _cookie = null;
    _csrf = null;
    _authenticated = false;
    await storage.clear();
  }

  Future<Map<String, dynamic>> call(
    String path, [
    Map<String, dynamic>? body,
    String? method,
  ]) async {
    final verb = method ?? (body == null ? 'GET' : 'POST');
    if (verb != 'GET' && _csrf == null) {
      _csrf = (await call('/csrf'))['csrfToken'] as String;
    }
    http.Response response;
    try {
      response = await client
          .send(
            http.Request(verb, Uri.parse(baseUrl).resolve('/api$path'))
              ..headers.addAll({
                'Cookie': ?_cookie,
                if (body != null) 'Content-Type': 'application/json',
                if (verb != 'GET') 'X-CSRF-Token': _csrf!,
              })
              ..body = body == null ? '' : jsonEncode(body),
          )
          .then(http.Response.fromStream)
          .timeout(const Duration(seconds: 30));
    } catch (_) {
      throw const AuthFailure(
        'Cannot connect. Check your connection and try again.',
        0,
      );
    }
    final setCookie = response.headers['set-cookie'];
    if (setCookie != null) {
      final match = RegExp(r'(?:^|,\s*)(orwickle\.sid=[^;]*)')
          .firstMatch(setCookie);
      if (match != null) _cookie = match.group(1);
    }
    Map<String, dynamic> data;
    try {
      data = jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      throw const AuthFailure(
        'The service is unavailable. Try again shortly.',
        503,
      );
    }
    if (response.statusCode >= 400) {
      final error = data['error'] as Map<String, dynamic>? ?? {};
      if (error['code'] == 'SESSION_EXPIRED') {
        await clear();
      }
      if (error['code'] == 'CSRF_INVALID') _csrf = null;
      throw AuthFailure(
        error['message'] as String? ?? 'The request could not be completed.',
        response.statusCode,
        error['code'] as String? ?? '',
      );
    }
    if (data['csrfToken'] != null) _csrf = data['csrfToken'] as String;
    if (path == '/auth/login/verify' && data['account'] != null) {
      _authenticated = true;
    }
    if (_authenticated && _cookie != null) await storage.write(_cookie!);
    if (path == '/auth/logout') await clear();
    return data;
  }

  void close() => client.close();
}
