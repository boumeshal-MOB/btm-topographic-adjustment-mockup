import { describe, expect, it } from 'vitest';
import {
  assertAllowedServiceEndpoint,
  parseEphemeralServiceConnection,
  parseServiceGatewayEnvironment,
  parseServiceHealth,
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

  it('accepts only a canonical HTTPS Quick Tunnel when the mockup pilot is enabled', () => {
    const environment = parseServiceGatewayEnvironment({
      STARNET_ALLOW_TRYCLOUDFLARE_PILOT: 'true',
    });

    expect(() => assertAllowedServiceEndpoint(
      { origin: 'https://calm-bird-42.trycloudflare.com' },
      environment,
    )).not.toThrow();
    expect(() => assertAllowedServiceEndpoint(
      { origin: 'https://trycloudflare.com.attacker.example' },
      environment,
    )).toThrow('not authorised');
    expect(() => assertAllowedServiceEndpoint(
      { origin: 'https://nested.calm-bird-42.trycloudflare.com' },
      environment,
    )).toThrow('not authorised');
  });

  it('does not enable Quick Tunnels unless the mockup pilot flag is explicit', () => {
    expect(() => assertAllowedServiceEndpoint(
      { origin: 'https://calm-bird-42.trycloudflare.com' },
      parseServiceGatewayEnvironment({}),
    )).toThrow('not configured');
  });

  it('does not expose an unexpected network error', () => {
    expect(publicServiceGatewayError(new Error('connect ECONNREFUSED 10.0.0.4:5080'))).toEqual({
      code: 'SERVICE_CONNECTION_FAILED',
      message: 'The STAR*NET execution service could not be reached or rejected the request.',
    });
  });

  it('accepts only the known optional execution host modes', () => {
    expect(parseServiceHealth({
      status: 'ok',
      starNetAvailable: true,
      invocationScriptAvailable: true,
      hostMode: 'interactive-pilot',
      maximumConcurrentExecutions: 1,
    }).hostMode).toBe('interactive-pilot');
    expect(() => parseServiceHealth({
      status: 'ok',
      starNetAvailable: true,
      invocationScriptAvailable: true,
      hostMode: 'unknown',
      maximumConcurrentExecutions: 1,
    })).toThrow('invalid health response');
  });
});
