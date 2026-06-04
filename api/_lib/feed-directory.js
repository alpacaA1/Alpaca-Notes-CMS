const FEED_DIRECTORY_ENDPOINT = 'https://misc.mowen.cn/api/cat/v1/feeds';
const FETCH_TIMEOUT_MS = 12000;
const DIRECTORY_REQUEST_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'alpaca-notes-feed-directory/1.0',
};

class FeedDirectoryError extends Error {
  constructor(message, statusCode = 400, code = 'feed_directory_error') {
    super(message);
    this.name = 'FeedDirectoryError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function normalizeFeed(feed, fallbackCategory) {
  const url = typeof feed?.url === 'string' ? feed.url.trim() : '';
  if (!url) {
    return null;
  }

  return {
    id:
      typeof feed?.id === 'number' || typeof feed?.id === 'string'
        ? String(feed.id)
        : url,
    title: typeof feed?.title === 'string' ? feed.title : '',
    url,
    category: typeof feed?.category === 'string' && feed.category.trim() ? feed.category : fallbackCategory,
    articleCount: typeof feed?.articleCount === 'number' ? feed.articleCount : 0,
    lastSuccessAt: typeof feed?.lastSuccessAt === 'string' ? feed.lastSuccessAt : '',
    intro: {
      content: typeof feed?.intro?.content === 'string' ? feed.intro.content : '',
    },
  };
}

function normalizeCategory(category) {
  const categoryName = typeof category?.category === 'string' && category.category.trim() ? category.category : '未分类';
  const feeds = Array.isArray(category?.feeds)
    ? category.feeds
      .slice()
      .sort((left, right) => {
        const leftOrder = typeof left?.sortOrder === 'number' ? left.sortOrder : Number.MAX_SAFE_INTEGER;
        const rightOrder = typeof right?.sortOrder === 'number' ? right.sortOrder : Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder;
      })
      .map((feed) => normalizeFeed(feed, categoryName))
      .filter(Boolean)
    : [];

  return {
    category: categoryName,
    feeds,
  };
}

function normalizeDirectoryPayload(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.categories)) {
    throw new FeedDirectoryError('共享 RSS 源目录返回格式无效。', 502, 'invalid_directory_response');
  }

  return {
    categories: payload.categories
      .map((category) => normalizeCategory(category))
      .filter((category) => category.feeds.length > 0),
  };
}

async function fetchFeedDirectory() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(FEED_DIRECTORY_ENDPOINT, {
      headers: DIRECTORY_REQUEST_HEADERS,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new FeedDirectoryError(
        `共享 RSS 源目录加载失败（HTTP ${response.status}）。`,
        response.status >= 400 && response.status < 600 ? response.status : 502,
        'directory_fetch_failed',
      );
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new FeedDirectoryError('共享 RSS 源目录返回格式无效。', 502, 'invalid_directory_response');
    }

    return normalizeDirectoryPayload(payload);
  } catch (error) {
    if (error instanceof FeedDirectoryError) {
      throw error;
    }

    if (error?.name === 'AbortError') {
      throw new FeedDirectoryError('共享 RSS 源目录加载超时，请稍后重试。', 504, 'timeout');
    }

    throw new FeedDirectoryError(
      error instanceof Error ? error.message : '共享 RSS 源目录加载失败。',
      500,
      'feed_directory_error',
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  FeedDirectoryError,
  fetchFeedDirectory,
  normalizeDirectoryPayload,
};
