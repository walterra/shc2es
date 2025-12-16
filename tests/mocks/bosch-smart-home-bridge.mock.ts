/**
 * Mock for bosch-smart-home-bridge library
 */

import { Observable } from 'rxjs';

export class MockBshcClient {
  subscribe = jest.fn(() => {
    return new Observable((subscriber) => {
      subscriber.next({
        parsedResponse: { result: 'test-subscription-id' },
      });
      subscriber.complete();
    });
  });

  longPolling = jest.fn((subscriptionId: string) => {
    return new Observable((subscriber) => {
      subscriber.next({
        parsedResponse: { result: [] },
      });
      subscriber.complete();
    });
  });
}

export class MockBoschSmartHomeBridge {
  private client = new MockBshcClient();

  getBshcClient = jest.fn(() => this.client);

  pairIfNeeded = jest.fn(() => {
    return new Observable((subscriber) => {
      subscriber.next(true);
      subscriber.complete();
    });
  });
}

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
