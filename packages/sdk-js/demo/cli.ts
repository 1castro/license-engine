#!/usr/bin/env tsx
/**
 * Demo CLI for the License Engine SDK.
 *
 * Drives the SDK against a running License Engine server and exercises the
 * full lifecycle: activate → validate → recheck → deactivate. State is
 * persisted between runs via filesystem storage.
 *
 * Usage:
 *   pnpm demo activate <license-key>
 *   pnpm demo validate
 *   pnpm demo recheck
 *   pnpm demo deactivate <bindingValue>
 *   pnpm demo clear
 *
 * Optional env:
 *   LICENSE_SERVER=http://localhost:3000
 *   LICENSE_PRODUCT_SLUG=avatar-pro
 *   LICENSE_ENGINE_STATE_DIR=/tmp/license-sdk-demo
 */
import { createNodeLicenseClient } from '../src/node';
import {
  BindingMismatchError,
  LicenseExpiredError,
  LicenseInvalidKeyError,
  LicenseNotActiveError,
  LicenseRevokedError,
  LicenseSdkError,
  LicenseTokenInvalidError,
  ServerUnreachableError,
} from '../src/errors';

const SERVER = process.env.LICENSE_SERVER ?? 'http://localhost:3000';
const PRODUCT = process.env.LICENSE_PRODUCT_SLUG ?? 'avatar-pro';

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  const client = await createNodeLicenseClient({
    serverUrl: SERVER,
    productSlug: PRODUCT,
    extraBindings: [{ type: 'domain', value: 'cli-demo.example.com' }],
  });

  try {
    switch (cmd) {
      case 'activate': {
        const key = rest[0];
        if (!key) throw new Error('Usage: activate <license-key>');
        const v = await client.activate({ licenseKey: key });
        console.log('Activated:');
        console.log('  licenseKey: %s', v.licenseKey);
        console.log('  product:    %s', v.productSlug);
        console.log('  features:   [%s]', v.features.join(', '));
        console.log('  expiresAt:  %s', v.expiresAt.toISOString());
        console.log('  token len:  %d', v.token.length);
        break;
      }
      case 'validate': {
        const v = await client.validate();
        console.log('Valid:');
        console.log('  licenseKey:        %s', v.licenseKey);
        console.log('  features:          [%s]', v.features.join(', '));
        console.log('  expiresAt:         %s', v.expiresAt.toISOString());
        console.log('  refreshedFromSrv:  %s', v.refreshedFromServer);
        break;
      }
      case 'recheck': {
        const v = await client.recheck();
        console.log('Recheck:');
        console.log('  expiresAt:         %s', v.expiresAt.toISOString());
        console.log('  refreshedFromSrv:  %s', v.refreshedFromServer);
        break;
      }
      case 'deactivate': {
        const value = rest[0] ?? 'cli-demo.example.com';
        const result = await client.deactivate({ type: 'domain', value });
        console.log('Deactivate domain=%s: released=%s', value, result.released);
        break;
      }
      case 'clear': {
        await client.clear();
        console.log('Local state cleared.');
        break;
      }
      default:
        printUsage();
        process.exitCode = 2;
    }
  } catch (err) {
    if (err instanceof LicenseInvalidKeyError) {
      console.error('License key invalid: %s', err.reason);
      process.exitCode = 1;
    } else if (err instanceof LicenseRevokedError) {
      console.error('License has been revoked%s', err.revokedAt ? ` at ${err.revokedAt.toISOString()}` : '');
      process.exitCode = 1;
    } else if (err instanceof LicenseExpiredError) {
      console.error('License expired%s', err.expiredAt ? ` at ${err.expiredAt.toISOString()}` : '');
      process.exitCode = 1;
    } else if (err instanceof BindingMismatchError) {
      console.error('Binding mismatch: %s', err.detail);
      process.exitCode = 1;
    } else if (err instanceof ServerUnreachableError) {
      console.error(
        'Server unreachable: %s (within grace: %s)',
        err.reason,
        err.withinGracePeriod,
      );
      process.exitCode = err.withinGracePeriod ? 0 : 1;
    } else if (err instanceof LicenseTokenInvalidError) {
      console.error('Token invalid (%s): %s', err.code, err.message);
      process.exitCode = 1;
    } else if (err instanceof LicenseNotActiveError) {
      console.error('License not active: %s', err.message);
      process.exitCode = 1;
    } else if (err instanceof LicenseSdkError) {
      console.error('SDK error: %s', err.message);
      process.exitCode = 1;
    } else {
      console.error('Unexpected error:', err);
      process.exitCode = 1;
    }
  }
}

function printUsage(): void {
  console.log('License Engine SDK demo');
  console.log('');
  console.log('Commands:');
  console.log('  activate <license-key>     Activate against the server');
  console.log('  validate                   Validate cached license');
  console.log('  recheck                    Force a server recheck');
  console.log('  deactivate [bindingValue]  Release a domain binding (default: cli-demo.example.com)');
  console.log('  clear                      Clear local state');
  console.log('');
  console.log('Env: LICENSE_SERVER=%s  LICENSE_PRODUCT_SLUG=%s', SERVER, PRODUCT);
}

main();
