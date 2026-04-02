const {
  buildAuthorizeUrl,
  makeStateCookie,
  sendRedirect,
  sendText,
} = require('./_lib/github-oauth');

module.exports = async function handler(req, res) {
  try {
    const { state, url } = buildAuthorizeUrl(req);
    sendRedirect(res, url, makeStateCookie(req, state));
  } catch (error) {
    sendText(res, 500, error.message);
  }
};
