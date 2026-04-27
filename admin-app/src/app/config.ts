export const AUTH_BASE_URL = 'https://alpaca-notes-cms.vercel.app'
export const REPO_OWNER = 'alpacaA1'
export const REPO_NAME = 'Alpaca-Notes-CMS'
export const REPO_BRANCH = 'main'
export const POSTS_PATH = 'source/_posts'
export const READ_LATER_PATH = 'source/read-later-items'
export const SITE_ROOT_PATH = `/${REPO_NAME}`

export const AUTH_ORIGIN = new URL(AUTH_BASE_URL).origin
export const AUTH_START_URL = `${AUTH_BASE_URL}/api/auth`
export const READ_LATER_IMPORT_URL = `${AUTH_BASE_URL}/api/import-read-later`
