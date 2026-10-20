import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'Android secure storage survives new storage instances and removes revoked material',
    (tester) async {
      const first = FlutterSecureStorage();
      const second = FlutterSecureStorage();
      const key = 'orwickle.integration.storage-probe';
      await first.write(key: key, value: 'non-secret-storage-probe');
      expect(await second.read(key: key), isNotNull);
      await second.delete(key: key);
      expect(await first.read(key: key), isNull);
    },
  );
}
