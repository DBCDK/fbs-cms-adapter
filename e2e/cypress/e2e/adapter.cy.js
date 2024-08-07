/// <reference types="cypress" />

const mockHTTPUrl = Cypress.env("mockHTTPUrl");

const validSmaugUser = {
  id: "some-cpr",
  pin: "some-pin",
};

const validUserinfoUser = {
  userId: "some-userId",
  pincode: "some-pincode",
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
      mockFetchUserinfoAuthenticatedTokenSucces();
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
        // Setup mocks
        mockFetchUserinfoAuthenticatedTokenSucces(token);

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

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/patrons/authenticate/some/path",
        headers: {
          Authorization: "Bearer TOKEN",
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(404);
        expect(res.body).to.deep.include({
          message: "not found",
        });
      });
    });

    it("returns not found when url contains preauthenticated", () => {
      /**
       * Expected flow:
       * 1. Returns 404 for a request url containing pre(authenticate)d
       */

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/patrons/preauthenticated/some/path",
        headers: {
          Authorization: "Bearer TOKEN",
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(404);
        expect(res.body).to.deep.include({
          message: "not found",
        });
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
      mockFetchUserinfoAuthenticatedTokenSucces();

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
      mockFetchUserinfoAuthenticatedTokenSucces();

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
      mockFetchUserinfoAuthenticatedTokenSucces();

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
      mockFetchUserinfoAuthenticatedTokenSucces();
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
      mockFetchUserinfoAuthenticatedTokenSucces();
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
      mockFetchUserinfoAuthenticatedTokenSucces();
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

    it("Using alternative fbs-cms URL, it returns fbs cms response for /patronid/ path when token has valid FBS credentials and user", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing both user and fbs credentials
       *    fbs credentials contains URL, and this is used instead of the default
       * 2. smaug configuration is succesfully validated
       * 3. sessionKey is fetched from Fbs using FBS credentials from smaug configuration
       * 4. patronId is fetched from FBS using sessionKey
       * 5. The url is replaced with values for agencyId and patronId
       * 6. The request is then forwarded to Fbs CMS with succes
       */

      const urlFromSmaugClient = "/fbscms-url-from-smaug-client";

      // Setup mocks
      mockFetchUserinfoAuthenticatedTokenSucces();
      mockSmaug({
        token: "TOKEN",
        status: 200,
        body: {
          user: validSmaugUser,
          fbs: {
            ...validSmaugFbsCredentials,
            url: "http://http_mock:3000" + urlFromSmaugClient,
          },
        },
      });
      mockFetchFbsSessionKeySucces(urlFromSmaugClient);
      mockFetchFbsPatronIdSucces(urlFromSmaugClient);
      mockFetchFbsCmsAuthenticatedPathSucces(urlFromSmaugClient);

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
      mockFetchUserinfoAuthenticatedTokenSucces();
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
      mockFetchUserinfoAuthenticatedTokenSucces();
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
      mockFetchUserinfoAuthenticatedTokenSucces();
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

    it("Can fetch CPR data from authorized token (/userinfo) when creating patron", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing fbs credentials
       * 2. /userinfo attributes will contain a cpr number (nem-id login)
       * 3. cpr will get attached to body
       * 4. Patron will be created
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

      mockFetchUserinfoAuthenticatedTokenSucces();
      mockFetchFbsSessionKeySucces();
      mockCreatePatronInjectedCprSucces();

      // Send request to adapter
      cy.request({
        method: "POST",
        url: "/external/agencyid/patrons/v9",
        headers: {
          Authorization: "Bearer TOKEN",
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "hello new patron",
        });
      });
    });

    it("Can fetch CPR data from authorized token (/userinfo) when creating patron withGuardian", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing fbs credentials
       * 2. /userinfo attributes will contain a cpr number (nem-id login)
       * 3. cpr will get attached to body
       * 4. Guardian can create Patron
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

      mockFetchUserinfoAuthenticatedTokenSucces();
      mockFetchFbsSessionKeySucces();
      mockCreatePatronWithGuardianInjectedCprSucces();

      // Send request to adapter
      cy.request({
        method: "POST",
        url: "/external/agencyid/patrons/withGuardian/v3",
        headers: {
          Authorization: "Bearer TOKEN",
        },
        body: {
          "some-prop": "some-value",
          guardian: { name: "some-name", email: "some-email" },
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "hello new guardian created patron",
        });
      });
    });

    it("Can fetch CPR data from authorized token (/userinfo) when updating pincode for patron", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing fbs credentials
       * 2. /userinfo attributes will contain a cpr number (nem-id login)
       * 3. cpr will get attached to body
       * 4. Patron can update pincode
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
      mockFetchUserinfoAuthenticatedTokenSucces();
      mockUpdatePatronPincodeInjectedCprSucces();

      // Send request to adapter
      cy.request({
        method: "PUT",
        url: "/external/agencyid/patrons/patronid/v8",
        headers: {
          Authorization: "Bearer TOKEN",
        },
        body: {
          "some-prop": "some-value",
          "some-other-prop": { "some-deeper-prop": "some-deeper-value" },
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "fresh new updated pincode for patron",
        });
      });
    });

    it("Fail when token has no CPR attached (no nem-id signin)", () => {
      /**
       * Expected flow:
       * 1. Adapter uses token to fetch smaug configuration containing fbs credentials
       * 2. /userinfo attributes will NOT contain a cpr number (no nem-id login)
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

      mockFetchUserinfoAuthenticatedTokenNoCPR();

      // Send request to adapter
      cy.request({
        method: "POST",
        url: "/external/agencyid/patrons/v9",
        headers: {
          Authorization: "Bearer TOKEN_WITH_NO_CPR",
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(403);
        expect(res.body).to.deep.include({
          message: "token does not include a cpr",
        });
      });
    });
  });

  describe("selecting authentication path", () => {
    it("should use /authenticate path for borchk validated users", () => {
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
      mockFetchUserinfoAuthenticatedTokenNoCPR();
      mockSmaug({
        token: "TOKEN_WITH_NO_CPR",
        status: 200,
        body: {
          user: validSmaugUser,
          fbs: validSmaugFbsCredentials,
        },
      });
      mockFetchFbsSessionKeySucces();
      mockFetchFbsPatronIdSuccesInstitution();
      mockFetchFbsCmsAuthenticatedPathSucces();

      // Send request to adapter
      cy.request({
        url: "/external/agencyid/patrons/patronid/some/path",
        headers: {
          Authorization: "Bearer TOKEN_WITH_NO_CPR",
        },
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body).to.deep.include({
          message: "hello patron",
        });
      });

      // Redis should have updated values
      redisGet({ key: "TOKEN_WITH_NO_CPR", namespace: "sessionkey" }).then(
        (value) => {
          expect(value).to.equal("SOME_VALID_SESSION_KEY");
        }
      );
      redisGet({ key: "TOKEN_WITH_NO_CPR", namespace: "patronid" }).then(
        (value) => {
          expect(value).to.equal("1234");
        }
      );
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

function mockFetchFbsSessionKeySucces(basePath = "/fbscms") {
  mockHTTP({
    request: {
      method: "POST",
      path: `${basePath}/external/v1/some-agencyid/authentication/login`,
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

function mockFetchFbsPatronIdSucces(basePath = "/fbscms") {
  mockHTTP({
    request: {
      method: "POST",
      path: `${basePath}/external/some-agencyid/patrons/preauthenticated/v9`,
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

function mockFetchFbsPatronIdSuccesInstitution(basePath = "/fbscms") {
  mockHTTP({
    request: {
      method: "POST",
      path: `${basePath}/external/some-agencyid/patrons/authenticate/v9`,
      headers: {
        "x-session": "SOME_VALID_SESSION_KEY",
      },
      body: {
        libraryCardNumber: validUserinfoUser.userId,
        pincode: validUserinfoUser.pincode,
      },
    },
    response: {
      status: 200,
      body: {
        patronId: 1234,
        patronType: "COMPANY",
        authenticateStatus: "VALID",
      },
    },
  });
}

function mockFetchFbsPatronIdExpiredSessionKey(basePath = "/fbscms") {
  mockHTTP({
    request: {
      method: "POST",
      path: `${basePath}/external/some-agencyid/patrons/preauthenticated/v9`,
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

function mockFetchFbsCmsAnonymousPathSucces(basePath = "/fbscms") {
  mockHTTP({
    request: {
      method: "GET",
      path: `${basePath}/external/some-agencyid/some/path`,
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

function mockFetchFbsCmsAnonymousPathPostSucces(basePath = "/fbscms") {
  mockHTTP({
    request: {
      method: "POST",
      path: `${basePath}/external/some-agencyid/some/path`,
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

function mockFetchFbsCmsAnonymousPathExpiredSessionKey(basePath = "/fbscms") {
  mockHTTP({
    request: {
      method: "GET",
      path: `${basePath}/external/some-agencyid/some/path`,
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

function mockFetchFbsCmsAuthenticatedPathSucces(basePath = "/fbscms") {
  mockHTTP({
    request: {
      method: "GET",
      path: `${basePath}/external/some-agencyid/patrons/1234/some/path`,
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

function mockFetchFbsCmsAuthenticatedPathExpiredSessionKey(
  basePath = "/fbscms"
) {
  mockHTTP({
    request: {
      method: "GET",
      path: `${basePath}/external/some-agencyid/patrons/12345/some/path`,
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

function mockFetchUserinfoAuthenticatedTokenSucces(token = "TOKEN") {
  mockHTTP({
    request: {
      method: "GET",
      path: `/userinfo`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    },
    response: {
      status: 200,
      body: {
        attributes: {
          cpr: "some-cpr",
          userId: "some-userId",
          pincode: "some-pincode",
          idpUsed: "nemlogin",
        },
      },
    },
  });
}

function mockFetchUserinfoAuthenticatedTokenNoCPR() {
  mockHTTP({
    request: {
      method: "GET",
      path: `/userinfo`,
      headers: {
        authorization: "Bearer TOKEN_WITH_NO_CPR",
      },
    },
    response: {
      status: 200,
      body: {
        attributes: {
          cpr: null,
          userId: "some-userId",
          pincode: "some-pincode",
          idpUsed: "borchk",
        },
      },
    },
  });
}

function mockCreatePatronInjectedCprSucces(basePath = "/fbscms") {
  mockHTTP({
    request: {
      method: "POST",
      path: `${basePath}/external/some-agencyid/patrons/v9`,
      body: '{"personIdentifier":"some-cpr"}',
    },
    response: {
      status: 200,
      body: { message: "hello new patron" },
    },
  });
}

function mockCreatePatronWithGuardianInjectedCprSucces(basePath = "/fbscms") {
  mockHTTP({
    request: {
      method: "POST",
      path: `${basePath}/external/some-agencyid/patrons/withGuardian/v3`,
      body: {
        "some-prop": "some-value",
        guardian: {
          name: "some-name",
          email: "some-email",
          personIdentifier: "some-cpr",
        },
      },
    },
    response: {
      status: 200,
      body: { message: "hello new guardian created patron" },
    },
  });
}

function mockUpdatePatronPincodeInjectedCprSucces(basePath = "/fbscms") {
  mockHTTP({
    request: {
      method: "PUT",
      path: `${basePath}/external/some-agencyid/patrons/1234/v8`,
      headers: {
        "x-session": "SOME_VALID_SESSION_KEY",
      },
      body: {
        "some-prop": "some-value",
        "some-other-prop": { "some-deeper-prop": "some-deeper-value" },
        pincodeChange: { libraryCardNumber: "some-cpr" },
      },
    },
    response: {
      status: 200,
      body: {
        message: "fresh new updated pincode for patron",
      },
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
