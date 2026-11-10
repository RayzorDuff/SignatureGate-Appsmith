#!/usr/bin/env python3
"""Source-only inventory regression checks; no deployment or network access."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'scripts'))
from check_internal_service_routing import inventory


class RoutingInventoryChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = json.loads((ROOT / 'config/internal_service_routing.json').read_text())
        self.config.pop('application_target', None)
        self.action('api', 'API', 'N8N')
        self.action('query', 'DB', 'signaturegate-postgres-test')
        self.action('controller', 'JS', 'UNUSED_DATASOURCE')

    def action(self, name, plugin_type, datasource, *, nested=False):
        path = self.root / 'pages/Synthetic/queries' / name / 'metadata.json'
        path.parent.mkdir(parents=True, exist_ok=True)
        data = {'unpublishedAction': {'name': name, 'datasource': {'name': datasource},
                'actionConfiguration': {'httpMethod': 'POST', 'path': '/webhook/synthetic',
                                        'body': 'PRIVATE_PAYLOAD_DO_NOT_REPORT',
                                        'headers': [{'value': 'PRIVATE_CREDENTIAL_DO_NOT_REPORT'}]}}}
        (data['unpublishedAction'] if nested else data)['pluginType'] = plugin_type
        path.write_text(json.dumps(data))
        return path

    def test_root_plugin_types_include_api_and_database_but_not_js(self):
        report = inventory(self.root, self.config)
        self.assertEqual([row['action'] for row in report['actions']], ['api'])
        self.assertEqual(report['database_actions_by_datasource'], {'signaturegate-postgres-test': 1})
        self.assertFalse(report['live_binding_verified'])
        self.assertFalse(report['actions'][0]['live_binding_verified'])
        self.assertNotIn('PRIVATE_', json.dumps(report))

    def test_nested_legacy_plugin_type_is_still_recognized(self):
        self.action('legacy', 'API', 'N8N', nested=True)
        self.assertEqual(len(inventory(self.root, self.config)['actions']), 2)

    def test_empty_api_inventory_is_an_error(self):
        (self.root / 'pages/Synthetic/queries/api/metadata.json').unlink()
        with self.assertRaisesRegex(ValueError, 'No API actions'):
            inventory(self.root, self.config)

    def test_unreadable_or_conflicting_metadata_cannot_disappear_silently(self):
        path = self.action('broken', 'API', 'N8N')
        path.write_text('{')
        with self.assertRaisesRegex(ValueError, 'Unreadable action metadata'):
            inventory(self.root, self.config)
        self.action('broken', 'API', 'N8N')
        data = json.loads(path.read_text())
        data['unpublishedAction']['pluginType'] = 'DB'
        path.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, 'Conflicting plugin types'):
            inventory(self.root, self.config)

    def test_unreviewed_database_alias_and_wrong_principal_are_rejected(self):
        self.action('query', 'DB', 'unreviewed')
        with self.assertRaisesRegex(ValueError, 'reviewed test contract'):
            inventory(self.root, self.config)
        self.action('query', 'DB', 'signaturegate-postgres-test')
        for database, username in [('signaturegate', 'signaturegate_test_app'),
                                   ('signaturegate_test', 'postgres')]:
            config = copy.deepcopy(self.config)
            config['test_database_contracts']['signaturegate-postgres-test'].update(
                database=database, username=username)
            with self.assertRaisesRegex(ValueError, 'Unexpected test database or principal'):
                inventory(self.root, config)

    def test_source_cannot_claim_live_binding_verification(self):
        self.config['test_database_contracts']['signaturegate-postgres-test']['live_binding_verified'] = True
        with self.assertRaisesRegex(ValueError, 'cannot assert live verification'):
            inventory(self.root, self.config)

    def test_checked_out_source_has_reviewable_api_and_database_inventory(self):
        config = json.loads((ROOT / 'config/internal_service_routing.json').read_text())
        report = inventory(ROOT, config)
        self.assertGreater(len(report['actions']), 0)
        self.assertGreater(report['database_actions_by_datasource'][config.get('application_target', {}).get('datasource', 'signaturegate-postgres-test')], 0)
        public_upload = next(row for row in report['actions'] if row['action'] == 'apiUploadEvidencePublic')
        self.assertEqual(public_upload['classification'], 'NEEDS_REVIEW')
        self.assertIsNone(public_upload['expected_base_url'])


if __name__ == '__main__':
    unittest.main()
