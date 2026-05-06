const {
  assertAllowedOwner,
  assertPrivateRepoScope,
  clearStateCookie,
  exchangeCodeForToken,
  fetchGitHubUser,
  getQueryParam,
  readCookies,
  sendPopupResult,
  sendText,
} = require('./_lib/github-oauth');

module.exports = async function handler(req, res) {
  try {
    const oauthError = getQueryParam(req, 'error');
    if (oauthError) {
      return sendPopupResult(res, req, 'error', {
        message: getQueryParam(req, 'error_description') || oauthError,
      });
    }

    const state = getQueryParam(req, 'state');
    const code = getQueryParam(req, 'code');
    const storedState = readCookies(req).alpaca_admin_oauth_state;

    if (!state || !storedState || state !== storedState) {
      return sendPopupResult(res, req, 'error', {
        message: 'OAuth state check failed. Please try logging in again.',
      });
    }

    if (!code) {
      return sendPopupResult(res, req, 'error', {
        message: 'Missing GitHub authorization code.',
      });
    }

    const { accessToken, scope } = await exchangeCodeForToken(req, code);
    const user = await fetchGitHubUser(accessToken);
    assertAllowedOwner(user);
    assertPrivateRepoScope(scope);

    return sendPopupResult(res, req, 'success', { token: accessToken });
  } catch (error) {
    const fallbackCookie = clearStateCookie(req);
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return sendPopupResult(res, req, 'error', {
        message: error.message || 'GitHub authorization failed.',
      });
    }

    return sendText(res, 500, error.message || 'GitHub authorization failed.', fallbackCookie);
  }
};
