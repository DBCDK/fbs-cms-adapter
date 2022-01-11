/// <reference types="cypress" />

const mockHTTPUrl = Cypress.env("mockHTTPUrl");

const validSmaugUser = {
  id: "some-cpr",
  pin: "some-pin",
};
const validSmaugFbsCredentials = {
  agencyid: "some-agencyid",
  username: "some-username",
  password: "some-password",
};

describe("Testing the FBS CMS adapter", () => {
  beforeEach(() => {
    resetMockHTTP();
  });

  context("Token validation", () => {
    it("returns error when no token is given", () => {
      /**
       * Expected flow:
       * 1. Request is invalid due to missing token
       */

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/some/path",
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(400);
        expect(res.body).to.deep.include({
          message: "headers should have required property 'authorization'",
        });
      });
    });

    it("returns error when token is not found", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration, but token is invalid
       */

      // Setup mocks
      mockSmaug({ token: "TOKEN", status: 404, body: "" });

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/some/path",
        headers: {
          Authorization: "Bearer TOKEN",
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(403);
        expect(res.body).to.deep.include({ message: "invalid token" });
      });
    });

    it("returns error when configuration has invalid fbs credentials", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration
       * 2. smaug configuration fails to validate
       */

      // Setup mocks
      mockSmaug({
        token: "TOKEN_WITHOUT_FBS_CREDENTIALS",
        status: 200,
        body: { user: validSmaugUser },
      });
      mockSmaug({
        token: "TOKEN_WITHOUT_FBS_AGENCYID",
        status: 200,
        body: {
          user: validSmaugUser,
          fbs: omit("agencyid", validSmaugFbsCredentials),
        },
      });
      mockSmaug({
        token: "TOKEN_WITHOUT_FBS_USERNAME",
        status: 200,
        body: {
          user: validSmaugUser,
          fbs: omit("username", validSmaugFbsCredentials),
        },
      });
      mockSmaug({
        token: "TOKEN_WITHOUT_FBS_PASSWORD",
        status: 200,
        body: {
          user: validSmaugUser,
          fbs: omit("password", validSmaugFbsCredentials),
        },
      });

      // For each token we send request to adapter
      // expecting to fail smaug configuration validation
      [
        "TOKEN_WITHOUT_FBS_CREDENTIALS",
        "TOKEN_WITHOUT_FBS_AGENCYID",
        "TOKEN_WITHOUT_FBS_USERNAME",
        "TOKEN_WITHOUT_FBS_PASSWORD",
      ].forEach((token) => {
        cy.request({
          url: `/external/agencyid/some/path`,
          headers: {
            Authorization: `Bearer ${token}`,
          },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.eq(403);
          expect(res.body).to.deep.include({
            message:
              "token must have FBS credentials with 'agencyid', 'username' and 'password'",
          });
        });
      });
    });

    it("returns not found when url contains authenticate", () => {
      /**
       * Expected flow:
       * 1. Returns 404 for a request url containing authenticate
       */

      // Setup mocks
      mockSmaug({
        token: "TOKEN",
        status: 200,
        body: {
          fbs: validSmaugFbsCredentials,
        },
      });

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/patrons/authenticate/some/path",
        headers: {
          Authorization: "Bearer TOKEN",
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(404);
      });
    });

    it("returns not found when url contains preauthenticated", () => {
      /**
       * Expected flow:
       * 1. Returns 404 for a request url containing pre(authenticate)d
       */

      // Setup mocks
      mockSmaug({
        token: "TOKEN",
        status: 200,
        body: {
          fbs: validSmaugFbsCredentials,
        },
      });

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/patrons/preauthenticated/some/path",
        headers: {
          Authorization: "Bearer TOKEN",
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(404);
      });
    });
  });

  context("Access anonymous path", () => {
    it("returns fbs cms response, when token has valid FBS credentials", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing fbs credentials
       * 2. smaug configuration is succesfully validated
       * 3. sessionKey is fetched from Fbs using FBS credentials from smaug configuration
       * 4. The url is replaced with value for agencyId
       * 5. The request is then forwarded to Fbs CMS with succes
       */

      // Setup mocks
      mockSmaug({
        token: "TOKEN",
        status: 200,
        body: {
          fbs: validSmaugFbsCredentials,
        },
      });
      mockFetchFbsSessionKeySucces();
      mockFetchFbsCmsAnonymousPathSucces();

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/some/path",
        headers: {
          Authorization: "Bearer TOKEN",
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "from FBS CMS API",
        });
      });

      // Redis should have updated value
      redisGet({ key: "TOKEN", namespace: "sessionkey" }).then((value) => {
        expect(value).to.equal("SOME_VALID_SESSION_KEY");
      });
    });

    it("returns fbs cms response, when token has valid FBS credentials - POST request", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing fbs credentials
       * 2. smaug configuration is succesfully validated
       * 3. sessionKey is fetched from Fbs using FBS credentials from smaug configuration
       * 4. The url is replaced with value for agencyId
       * 5. The request is then forwarded to Fbs CMS with succes
       */

      // Setup mocks
      mockSmaug({
        token: "TOKEN",
        status: 200,
        body: {
          fbs: validSmaugFbsCredentials,
        },
      });
      mockFetchFbsSessionKeySucces();
      mockFetchFbsCmsAnonymousPathPostSucces();

      // Send request to adapter
      cy.request({
        method: "POST",
        url: "/external/agencyid/some/path",
        headers: {
          Authorization: "Bearer TOKEN",
        },
        body: { test: "test" },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "from FBS CMS API",
        });
      });

      // Redis should have updated value
      redisGet({ key: "TOKEN", namespace: "sessionkey" }).then((value) => {
        expect(value).to.equal("SOME_VALID_SESSION_KEY");
      });
    });

    it("returns fbs cms response, when sessionKey is cached", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing fbs credentials
       * 2. smaug configuration is succesfully validated
       * 3. The sessionKey is fetched from redis using the token
       * 4. The url is replaced with value for agencyId
       * 5. The request is then forwarded to Fbs CMS with succes
       */

      // Setup mocks
      mockSmaug({
        token: "TOKEN",
        status: 200,
        body: {
          fbs: validSmaugFbsCredentials,
        },
      });
      redisSet({
        key: "TOKEN",
        value: "SOME_VALID_SESSION_KEY",
        namespace: "sessionkey",
      });
      mockFetchFbsCmsAnonymousPathSucces();

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/some/path",
        headers: {
          Authorization: "Bearer TOKEN",
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "from FBS CMS API",
        });
      });
    });

    it("logs in again when sessionKey is expired", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing fbs credentials
       * 2. smaug configuration is succesfully validated
       * 3. The sessionKey is fetched from redis using the token
       * 4. The url is replaced with value for agencyId
       * 5. The request is forwarded to FBS CMS, but it returns 401 due to expired sessionKey
       * 6. sessionKey is refetched from FBS using FBS credentials from smaug configuration
       * 7. The request is then forwarded to FBS CMS with succes
       */

      // Setup mocks
      mockSmaug({
        token: "TOKEN",
        status: 200,
        body: {
          fbs: validSmaugFbsCredentials,
        },
      });
      redisSet({
        key: "TOKEN",
        value: "SOME_EXPIRED_SESSION_KEY",
        namespace: "sessionkey",
      });
      mockFetchFbsCmsAnonymousPathExpiredSessionKey();
      mockFetchFbsSessionKeySucces();
      mockFetchFbsCmsAnonymousPathSucces();

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/some/path",
        headers: {
          Authorization: "Bearer TOKEN",
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "from FBS CMS API",
        });
      });

      // Redis should have updated value
      redisGet({ key: "TOKEN", namespace: "sessionkey" }).then((value) => {
        expect(value).to.equal("SOME_VALID_SESSION_KEY");
      });
    });
  });

  context("Access patron path", () => {
    it("returns error when anonymous token is used for accessing /patron/ path", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing fbs credentials
       * 2. Configuration validation fails, due to missing user when accessing authenticated path
       */

      // Setup mocks
      mockSmaug({
        token: "TOKEN",
        status: 200,
        body: {
          fbs: validSmaugFbsCredentials,
        },
      });

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/patron/patronid/some/path",
        headers: {
          Authorization: "Bearer TOKEN",
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(403);
        expect(res.body).to.deep.include({
          message: "user authenticated token is required",
        });
      });
    });

    it("returns fbs cms response for /patronid/ path when token has valid FBS credentials and user", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing both user and fbs credentials
       * 2. smaug configuration is succesfully validated
       * 3. sessionKey is fetched from Fbs using FBS credentials from smaug configuration
       * 4. patronId is fetched from FBS using sessionKey
       * 5. The url is replaced with values for agencyId and patronId
       * 6. The request is then forwarded to Fbs CMS with succes
       */

      // Setup mocks
      mockSmaug({
        token: "TOKEN",
        status: 200,
        body: {
          user: validSmaugUser,
          fbs: validSmaugFbsCredentials,
        },
      });
      mockFetchFbsSessionKeySucces();
      mockFetchFbsPatronIdSucces();
      mockFetchFbsCmsAuthenticatedPathSucces();

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/patrons/patronid/some/path",
        headers: {
          Authorization: "Bearer TOKEN",
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "hello patron",
        });
      });

      // Redis should have updated values
      redisGet({ key: "TOKEN", namespace: "sessionkey" }).then((value) => {
        expect(value).to.equal("SOME_VALID_SESSION_KEY");
      });
      redisGet({ key: "TOKEN", namespace: "patronid" }).then((value) => {
        expect(value).to.equal("1234");
      });
    });

    it("Uses cached sessionKey and patronId", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing both user and fbs credentials
       * 2. smaug configuration is succesfully validated
       * 3. The sessionKey and patronId are fetched from redis using the token
       * 4. The url is replaced with values for agencyId and patronId
       * 5. The request is then forwarded to Fbs CMS with succes
       */

      // Setup mocks
      mockSmaug({
        token: "TOKEN",
        status: 200,
        body: {
          user: validSmaugUser,
          fbs: validSmaugFbsCredentials,
        },
      });
      redisSet({
        key: "TOKEN",
        value: "SOME_VALID_SESSION_KEY",
        namespace: "sessionkey",
      });
      redisSet({ key: "TOKEN", value: "1234", namespace: "patronid" });
      mockFetchFbsCmsAuthenticatedPathSucces();

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/patrons/patronid/some/path",
        headers: {
          Authorization: "Bearer TOKEN",
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "hello patron",
        });
      });
    });

    it("logins again, when sessionKey is expired when fetching patronId", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing both user and fbs credentials
       * 2. smaug configuration is succesfully validated
       * 3. The sessionKey is fetched from redis using the token
       * 4. patronId fails to be fetched from FBS due to expired sessionKey
       * 5. sessionKey is refetched from Fbs using FBS credentials from smaug configuration
       * 6. patronId is refetched from FBS using sessionKey
       * 7. The url is replaced with values for agencyId and patronId
       * 8. The request is then forwarded to Fbs CMS with succes
       */

      // Setup mocks
      mockSmaug({
        token: "TOKEN",
        status: 200,
        body: {
          user: validSmaugUser,
          fbs: validSmaugFbsCredentials,
        },
      });
      redisSet({
        key: "TOKEN",
        value: "SOME_EXPIRED_SESSION_KEY",
        namespace: "sessionkey",
      });
      mockFetchFbsPatronIdExpiredSessionKey();
      mockFetchFbsSessionKeySucces();
      mockFetchFbsPatronIdSucces();
      mockFetchFbsCmsAuthenticatedPathSucces();

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/patrons/patronid/some/path",
        headers: {
          Authorization: "Bearer TOKEN",
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "hello patron",
        });
      });

      // Redis should have updated values
      redisGet({ key: "TOKEN", namespace: "sessionkey" }).then((value) => {
        expect(value).to.equal("SOME_VALID_SESSION_KEY");
      });
      redisGet({ key: "TOKEN", namespace: "patronid" }).then((value) => {
        expect(value).to.equal("1234");
      });
    });

    it("logins again, when sessionKey is expired when calling fbs cms", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing both user and fbs credentials
       * 2. smaug configuration is succesfully validated
       * 3. The sessionKey and patronId are fetched from redis using the token
       * 4. The url is replaced with values for agencyId and patronId
       * 5. The request is then forwarded to Fbs CMS, but it returns 401 due to expired sessionKey
       * 6. sessionKey is refetched from Fbs using FBS credentials from smaug configuration
       * 7. patronId is refetched from FBS using sessionKey
       * 8. The url is replaced with values for agencyId and patronId (just in case patronId changed)
       * 9. The request is then forwarded to Fbs CMS with succes
       */

      // Setup mocks
      mockSmaug({
        token: "TOKEN",
        status: 200,
        body: {
          user: validSmaugUser,
          fbs: validSmaugFbsCredentials,
        },
      });
      redisSet({
        key: "TOKEN",
        value: "SOME_EXPIRED_SESSION_KEY",
        namespace: "sessionkey",
      });
      redisSet({ key: "TOKEN", value: "12345", namespace: "patronid" });
      mockFetchFbsCmsAuthenticatedPathExpiredSessionKey();
      mockFetchFbsSessionKeySucces();
      mockFetchFbsPatronIdSucces();
      mockFetchFbsCmsAuthenticatedPathSucces();

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/patrons/patronid/some/path",
        headers: {
          Authorization: "Bearer TOKEN",
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "hello patron",
        });
      });

      // Redis should have updated values
      redisGet({ key: "TOKEN", namespace: "sessionkey" }).then((value) => {
        expect(value).to.equal("SOME_VALID_SESSION_KEY");
      });
      redisGet({ key: "TOKEN", namespace: "patronid" }).then((value) => {
        expect(value).to.equal("1234");
      });
    });
  });
});

// ----- HELPER FUNCTIONS FOR MOCKING STUFF -----
function mockHTTP({ request, response }) {
  cy.request({
    method: "POST",
    url: mockHTTPUrl,
    body: {
      request,
      response,
    },
  });
}

function resetMockHTTP() {
  cy.request({
    method: "POST",
    url: `${mockHTTPUrl}/reset`,
    body: { namespaces: ["patronid", "sessionid"] },
  });
}

function mockSmaug({ token, status, body }) {
  mockHTTP({
    request: {
      method: "GET",
      path: "/smaug/configuration",
      query: {
        token,
      },
    },
    response: {
      status,
      body,
    },
  });
}

function mockFetchFbsSessionKeySucces() {
  mockHTTP({
    request: {
      method: "POST",
      path: "/fbscms/external/v1/some-agencyid/authentication/login",
      body: {
        username: validSmaugFbsCredentials.username,
        password: validSmaugFbsCredentials.password,
      },
    },
    response: {
      status: 200,
      body: { sessionKey: "SOME_VALID_SESSION_KEY" },
    },
  });
}

function mockFetchFbsPatronIdSucces() {
  mockHTTP({
    request: {
      method: "POST",
      path: "/fbscms/external/some-agencyid/patrons/preauthenticated/v7",
      headers: {
        "x-session": "SOME_VALID_SESSION_KEY",
      },
      body: validSmaugUser.id,
    },
    response: {
      status: 200,
      body: {
        authenticated: true,
        patron: {
          patronId: 1234,
        },
      },
    },
  });
}

function mockFetchFbsPatronIdExpiredSessionKey() {
  mockHTTP({
    request: {
      method: "POST",
      path: "/fbscms/external/some-agencyid/patrons/preauthenticated/v7",
      headers: {
        "x-session": "SOME_EXPIRED_SESSION_KEY",
      },
      body: validSmaugUser.id,
    },
    response: {
      status: 401,
      body: {},
    },
  });
}

function mockFetchFbsCmsAnonymousPathSucces() {
  mockHTTP({
    request: {
      method: "GET",
      path: "/fbscms/external/some-agencyid/some/path",
      headers: {
        "x-session": "SOME_VALID_SESSION_KEY",
      },
    },
    response: {
      status: 200,
      body: { message: "from FBS CMS API" },
    },
  });
}
function mockFetchFbsCmsAnonymousPathPostSucces() {
  mockHTTP({
    request: {
      method: "POST",
      path: "/fbscms/external/some-agencyid/some/path",
      headers: {
        "x-session": "SOME_VALID_SESSION_KEY",
      },
      body: {
        test: "test",
      },
    },
    response: {
      status: 200,
      body: { message: "from FBS CMS API" },
    },
  });
}

function mockFetchFbsCmsAnonymousPathExpiredSessionKey() {
  mockHTTP({
    request: {
      method: "GET",
      path: "/fbscms/external/some-agencyid/some/path",
      headers: {
        "x-session": "SOME_EXPIRED_SESSION_KEY",
      },
    },
    response: {
      status: 401,
      body: { message: "key is expired" },
    },
  });
}

function mockFetchFbsCmsAuthenticatedPathSucces() {
  mockHTTP({
    request: {
      method: "GET",
      path: "/fbscms/external/some-agencyid/patrons/1234/some/path",
      headers: {
        "x-session": "SOME_VALID_SESSION_KEY",
      },
    },
    response: {
      status: 200,
      body: { message: "hello patron" },
    },
  });
}

function mockFetchFbsCmsAuthenticatedPathExpiredSessionKey() {
  mockHTTP({
    request: {
      method: "GET",
      path: "/fbscms/external/some-agencyid/patrons/12345/some/path",
      headers: {
        "x-session": "SOME_EXPIRED_SESSION_KEY",
      },
    },
    response: {
      status: 401,
      body: { message: "key is expired" },
    },
  });
}

function redisSet({ key, value, namespace }) {
  cy.request({
    method: "POST",
    url: `${mockHTTPUrl}/redis`,
    body: {
      key,
      value,
      namespace,
    },
  });
}

function redisGet({ key, namespace }) {
  return cy
    .request({
      method: "GET",
      url: `${mockHTTPUrl}/redis?key=${key}&namespace=${namespace}`,
    })
    .then((res) => res.body);
}

function omit(key, obj) {
  const { [key]: omitted, ...rest } = obj;
  return rest;
}
