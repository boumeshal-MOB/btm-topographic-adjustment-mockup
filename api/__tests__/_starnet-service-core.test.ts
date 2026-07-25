import { describe, expect, it } from 'vitest';
import {
  assertAllowedServiceEndpoint,
  parseEphemeralServiceConnection,
  parseServiceGatewayEnvironment,
  publicServiceGatewayError,
} from '../_starnet-service-core';

describe('STAR*NET HTTPS service gateway boundary', () => {
  it('accepts an exact allowlisted HTTPS origin', () => {
    const connection = parseEphemeralServiceConnection({
      origin: 'https://starnet-vm.example.test/',
      apiKey: 'a-random-key-with-more-than-24-characters',
    });
    const environment = parseServiceGatewayEnvironment({
      STARNET_ALLOWED_SERVICE_ORIGINS: 'https://starnet-vm.example.test',
    });

    expect(() => assertAllowedServiceEndpoint(connection, environment)).not.toThrow();
    expect(connection.origin).toBe('https://starnet-vm.example.test');
  });

  it('rejects paths, credentials and origins outside the allowlist', () => {
    expect(() => parseEphemeralServiceConnection({
      origin: 'https://user:secret@starnet-vm.example.test/v1',
      apiKey: 'a-random-key-with-more-than-24-characters',
    })).toThrow('service URL is invalid');

    expect(() => assertAllowedServiceEndpoint(
      {
        origin: 'https://other.example.test',
      },
      parseServiceGatewayEnvironment({
        STARNET_ALLOWED_SERVICE_ORIGINS: 'https://starnet-vm.example.test',
      }),
    )).toThrow('not authorised');
  });

  it('allows plain HTTP only for an explicitly enabled localhost simulator', () => {
    const connection = parseEphemeralServiceConnection({
      origin: 'http://127.0.0.1:5080',
      apiKey: 'a-random-key-with-more-than-24-characters',
    });
    const disabled = parseServiceGatewayEnvironment({
      STARNET_ALLOWED_SERVICE_ORIGINS: 'http://127.0.0.1:5080',
    });
    const enabled = parseServiceGatewayEnvironment({
      STARNET_ALLOWED_SERVICE_ORIGINS: 'http://127.0.0.1:5080',
      STARNET_ALLOW_INSECURE_LOCALHOST: 'true',
    });

    expect(() => assertAllowedServiceEndpoint(connection, disabled)).toThrow('HTTPS');
    expect(() => assertAllowedServiceEndpoint(connection, enabled)).not.toThrow();
  });

  it('does not expose an unexpected network error', () => {
    expect(publicServiceGatewayError(new Error('connect ECONNREFUSED 10.0.0.4:5080'))).toEqual({
      code: 'SERVICE_CONNECTION_FAILED',
      message: 'The STAR*NET execution service could not be reached or rejected the request.',
    });
  });
});
