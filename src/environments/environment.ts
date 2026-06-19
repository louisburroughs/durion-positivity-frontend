export const environment = {
  production: false,
  apiBaseUrl: '/api', // dev-server proxies /api -> http://localhost:8080 (see proxy.conf.json), mirroring alpha/prod
  /** Set to true to skip the real login API and use a local mock session. */
  mockAuth: true,
};
