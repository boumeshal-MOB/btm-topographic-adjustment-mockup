import { describe, expect, it } from 'vitest';
import {
  assertAllowedFtpEndpoint,
  parseEphemeralFtpConnection,
  parseGatewayEnvironment,
  publicGatewayError,
  remoteQueueFile,
} from '../_starnet-ftp-core';

const connection = {
  host: 'starnet.example.internal',
  port: 21,
  username: 'btm-runner',
  password: 'not-persisted',
  security: 'explicit-tls',
  incomingDirectory: '/btm/incoming/',
  outgoingDirectory: '/btm/outgoing/',
};

describe('STAR*NET FTP gateway safety boundary', () => {
  it('parses an ephemeral connection and normalises queue folders', () => {
    expect(parseEphemeralFtpConnection(connection)).toEqual({
      ...connection,
      incomingDirectory: '/btm/incoming',
      outgoingDirectory: '/btm/outgoing',
    });
  });

  it('rejects traversal and malformed endpoints before any network connection', () => {
    expect(() => parseEphemeralFtpConnection({
      ...connection,
      incomingDirectory: '/../secrets',
    })).toThrow(/directory is invalid/);
    expect(() => parseEphemeralFtpConnection({
      ...connection,
      host: 'https://example.com',
    })).toThrow(/host is invalid/);
  });

  it('requires an exact server-side host and port allowlist', () => {
    const environment = parseGatewayEnvironment({
      STARNET_ALLOWED_FTP_HOSTS: 'starnet.example.internal, 127.0.0.1',
      STARNET_ALLOWED_FTP_PORTS: '21,990,2121',
    });
    expect(() => assertAllowedFtpEndpoint(connection, environment)).not.toThrow();
    expect(() => assertAllowedFtpEndpoint(
      { host: 'metadata.google.internal', port: 80 },
      environment,
    )).toThrow(/not authorised/);
  });

  it('builds only safe queue paths', () => {
    expect(remoteQueueFile('/incoming', 'btm-run-1.btmjob.json')).toBe(
      '/incoming/btm-run-1.btmjob.json',
    );
    expect(() => remoteQueueFile('/incoming', '../secret')).toThrow(/filename is invalid/);
  });

  it('does not expose raw FTP client errors to the browser', () => {
    expect(publicGatewayError(new Error('530 password hunter2 rejected'))).toEqual({
      code: 'FTP_CONNECTION_FAILED',
      message: 'The FTPS/FTP server could not be reached or rejected the connection.',
    });
  });
});
