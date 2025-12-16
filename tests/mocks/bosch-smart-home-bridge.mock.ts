/**
 * Mock for bosch-smart-home-bridge library
 */

import { Observable } from 'rxjs';

/**
 * Mock BSHC client for testing
 */
export class MockBshcClient {
  /**
   * Mock subscribe method
   * @returns Observable with mock subscription result
   */
  subscribe = jest.fn(() => {
    return new Observable((subscriber) => {
      subscriber.next({
        parsedResponse: { result: 'test-subscription-id' },
      });
      subscriber.complete();
    });
  });

  /**
   * Mock long polling method
   * @returns Observable with mock polling result
   */
  longPolling = jest.fn(() => {
    return new Observable((subscriber) => {
      subscriber.next({
        parsedResponse: { result: [] },
      });
      subscriber.complete();
    });
  });
}

/**
 * Mock Bosch Smart Home Bridge for testing
 */
export class MockBoschSmartHomeBridge {
  private client = new MockBshcClient();

  /**
   * Get mock BSHC client
   * @returns Mock client instance
   */
  getBshcClient = jest.fn(() => this.client);

  /**
   * Mock pairing method
   * @returns Observable with mock pairing result
   */
  pairIfNeeded = jest.fn(() => {
    return new Observable((subscriber) => {
      subscriber.next(true);
      subscriber.complete();
    });
  });
}

/**
 * Mock Bosch Smart Home Bridge Builder for testing
 */
export class MockBoschSmartHomeBridgeBuilder {
  private host = '';
  private cert = '';
  private key = '';
  private logger: unknown = null;

  static builder(): MockBoschSmartHomeBridgeBuilder {
    return new MockBoschSmartHomeBridgeBuilder();
  }

  withHost(host: string): this {
    this.host = host;
    return this;
  }

  withClientCert(cert: string): this {
    this.cert = cert;
    return this;
  }

  withClientPrivateKey(key: string): this {
    this.key = key;
    return this;
  }

  withLogger(logger: unknown): this {
    this.logger = logger;
    return this;
  }

  build(): MockBoschSmartHomeBridge {
    return new MockBoschSmartHomeBridge();
  }
}

export const MockBshbUtils = {
  generateClientCertificate: jest.fn(() => ({
    cert: '-----BEGIN CERTIFICATE-----\nMOCK_CERT\n-----END CERTIFICATE-----',
    private: '-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----',
  })),
};

// Mock the entire module
export const mockBoschSmartHomeBridge = {
  BoschSmartHomeBridge: MockBoschSmartHomeBridge,
  BoschSmartHomeBridgeBuilder: MockBoschSmartHomeBridgeBuilder,
  BshbUtils: MockBshbUtils,
};
