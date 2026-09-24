const axios = require("axios");
require("dotenv").config();
const { cached } = require("./cache");

const CATALOG_TTL = 20 * 60 * 1000; // 20 minutes

// Enhanced cache for storing complete book information
const bookInfoCache = new Map();
const requestCache = new Map();

// Optimized rate limiting configuration for speed
const BATCH_SIZE = 3; // Increased for parallel processing
const REQUEST_DELAY = 200; // Reduced delay (200ms)
const RETRY_DELAY = 1000; // Reduced retry delay
const MAX_RETRIES = 2; // Reduced retries
const TIMEOUT = 5000; // Reduced timeout to 5 seconds
const PARALLEL_GOOGLE_REQUESTS = 3; // Allow parallel Google requests

const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY;
const NYT_BOOKS_API_KEY = process.env.NYT_BOOKS_API_KEY;

// Helper: Get NYT Bestseller list (can expand with more categories)
const getNYTBestsellers = async () => {
  return cached("nyt:bestsellers:hardcover-fiction", CATALOG_TTL, async () => {
    const listNames = ["hardcover-fiction"];
    const nytBooks = [];

    for (const list of listNames) {
      try {
        const url = `https://api.nytimes.com/svc/books/v3/lists/current/${list}.json?api-key=${NYT_BOOKS_API_KEY}`;
        const response = await axios.get(url);
        const results = response.data.results.books;

        nytBooks.push(
          ...results.map((b) => ({
            title: b.title.toLowerCase(),
            author: b.author.toLowerCase(),
            rank: b.rank,
            weeks_on_list: b.weeks_on_list,
            primary_isbn13: b.primary_isbn13,
          }))
        );
      } catch (err) {
        console.error(`❌ Error fetching NYT list "${list}":`, err.message);
      }
    }

    return nytBooks;
  });
};

// Main function
const getBooksByPreferences = async (preferences, limit = 20) => {

  try {
    const nytBestsellers = await getNYTBestsellers();

    // Build the Google Books query
    let query = "bestseller";
    const normalizedGenres = preferences.topGenres
      ? normalizeGenres(preferences.topGenres)
      : [];
    if (normalizedGenres.length > 0) {
      const genreQuery = normalizedGenres
        .slice(0, 3)
        .map((g) => `subject:${g}`)
        .join(" OR ");
      query = `(${genreQuery})`;
    }

    // Cache by the normalized genre set so different users/pages requesting
    // the same genre combo share a fetch instead of hitting Google every time.
    const cacheKey = `googlebooks:byGenres:${
      normalizedGenres.length > 0
        ? [...normalizedGenres].sort().join("-")
        : "bestseller"
    }`;

    const items = await cached(cacheKey, CATALOG_TTL, async () => {
      let url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
        query
      )}&orderBy=relevance&maxResults=20${
        GOOGLE_BOOKS_API_KEY ? `&key=${GOOGLE_BOOKS_API_KEY}` : ""
      }`;
      let response = await axios.get(url, { timeout: 8000 });
      let fetchedItems = response.data.items || [];

      // Fallback broader search
      if (fetchedItems.length === 0 && preferences.topGenres) {
        url = `https://www.googleapis.com/books/v1/volumes?q=subject:fiction+${encodeURIComponent(
          preferences.topGenres.slice(0, 3).join(" ")
        )}&maxResults=40${
          GOOGLE_BOOKS_API_KEY ? `&key=${GOOGLE_BOOKS_API_KEY}` : ""
        }`;
        response = await axios.get(url, { timeout: 8000 });
        fetchedItems = response.data.items || [];
      }

      return fetchedItems;
    });

    // Score and format books
    const processedBooks = items.map((item) => {
      const info = item.volumeInfo || {};
      const genres = normalizeGenres(info.categories);
      const title = (info.title || "").toLowerCase();
      const author = (info.authors?.[0] || "").toLowerCase();
      let score = 0;

      // 🎯 Genre match scoring
      if (preferences.topGenres) {
        const matches = genres.filter((g) =>
          preferences.topGenres.includes(g)
        ).length;
        score += matches * 10;
      }

      // ⭐ Google rating scoring
      if (info.averageRating) score += info.averageRating * 2;
      if (info.ratingsCount) score += Math.log10(info.ratingsCount + 1);

      // 🏆 NYT Bestseller bonus
      const nytMatch = nytBestsellers.find(
        (b) => b.title === title && b.author.includes(author)
      );
      if (nytMatch) {
        score += 20;
        if (nytMatch.rank <= 5) score += 5;
        if (nytMatch.weeks_on_list >= 10) score += 5;
      }

      return {
        title: info.title || "Untitled",
        type: "Book",
        author: info.authors?.[0] || "Unknown",
        year: extractYear(info.publishedDate),
        genres: genres,
        description:
          info.description?.substring(0, 300) || "No description available.",
        posterPath:
          info.imageLinks?.thumbnail?.replace("http:", "https:") ||
          "/images/default-book.png",
        id:
          item.id ||
          `google-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        averageRating: info.averageRating,
        language: info.language || "en",
        score: score,
        sourceApi: "googleBooks",
      };
    });

    const topBooks = processedBooks
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    if (topBooks.length < limit) {
      console.warn(
        `⚠️ Only fetched ${topBooks.length} books. Falling back to popular books.`
      );
      const fallback = await getPopularBooks(limit);
      return [...topBooks, ...fallback].slice(0, limit);
    }

    return topBooks;
  } catch (error) {
    console.error("❌ Error fetching books by preferences:", error.message);
    return await getPopularBooks(10);
  }
};
/**
 * Sleep utility for rate limiting
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fast retry mechanism with shorter delays
 */
const fastRetry = async (fn, maxRetries = MAX_RETRIES) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(RETRY_DELAY * (i + 1)); // Linear backoff instead of exponential
    }
  }
};

/**
 * Normalize and clean genre information (optimized)
 */
const normalizeGenres = (categories) => {
  if (!categories || !Array.isArray(categories)) return ["General"];

  // Pre-compiled genre map for faster lookup
  const genreMap = {
    fiction: "Fiction",
    biography: "Biography",
    history: "History",
    science: "Science",
    business: "Business",
    "self-help": "Self-Help",
    health: "Health",
    cooking: "Cooking",
    travel: "Travel",
    religion: "Religion",
    philosophy: "Philosophy",
    psychology: "Psychology",
    "true crime": "True Crime",
    memoir: "Biography",
    romance: "Romance",
    drama: "Drama",
    adventure: "Adventure",
    comedy: "Comedy",
    humor: "Comedy",
    thriller: "Thriller",
    "science fiction": "Science Fiction",
    scifi: "Science Fiction",
    fantasy: "Fantasy",
    mystery: "Mystery",
  };

  return categories
    .map((cat) => {
      const lower = cat.toLowerCase();
      // Find the first matching genre
      for (const [key, value] of Object.entries(genreMap)) {
        if (lower.includes(key)) {
          return value;
        }
      }
      return cat; 
    })
    .filter(Boolean);
};

/**
 * Extract year from various date formats (optimized)
 */
const extractYear = (publishedDate) => {
  if (!publishedDate) return new Date().getFullYear();
  // Use parseInt directly on first 4 characters for speed
  const year = parseInt(publishedDate.substring(0, 4), 10);
  return isNaN(year) ? new Date().getFullYear() : year;
};

/**
 * Fast Google Books API call with aggressive caching
 */
const getBookInfoFromGoogle = async (isbn, title, author) => {
  if (!isbn && !title) return null;

  const cacheKey = isbn || `${title}-${author}`;
  if (bookInfoCache.has(cacheKey)) {
    return bookInfoCache.get(cacheKey);
  }

  try {
    const bookInfo = await fastRetry(async () => {
      let url = "";
      if (isbn) {
        url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1${
          GOOGLE_BOOKS_API_KEY ? `&key=${GOOGLE_BOOKS_API_KEY}` : ""
        }`;
      } else {
        // Simplified search query for faster results
        const searchQuery = `intitle:"${title.substring(0, 50)}"`;
        url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
          searchQuery
        )}&maxResults=1${
          GOOGLE_BOOKS_API_KEY ? `&key=${GOOGLE_BOOKS_API_KEY}` : ""
        }`;
      }

      const response = await axios.get(url, {
        timeout: TIMEOUT,
        headers: { "User-Agent": "BookFetcher/1.0" },
      });

      const book = response.data.items?.[0];
      if (!book) return null;

      const volumeInfo = book.volumeInfo;
      // Return minimal required data for speed
      return {
        googleId: book.id, // /book_detail/:id needs the Google volume ID, not an ISBN
        year: extractYear(volumeInfo.publishedDate),
        genres: normalizeGenres(volumeInfo.categories),
        description: volumeInfo.description?.substring(0, 500) || null, // Truncate for speed
        pageCount: volumeInfo.pageCount || null,
        averageRating: volumeInfo.averageRating || null,
        ratingsCount: volumeInfo.ratingsCount || null,
        language: volumeInfo.language || "en",
        publisher: volumeInfo.publisher || null,
        subtitle: volumeInfo.subtitle || null,
        imageLinks: {
          thumbnail:
            volumeInfo.imageLinks?.thumbnail?.replace("http:", "https:") ||
            null,
          medium:
            volumeInfo.imageLinks?.medium?.replace("http:", "https:") || null,
        },
        authors: volumeInfo.authors || [],
      };
    });

    bookInfoCache.set(cacheKey, bookInfo);
    return bookInfo;
  } catch (error) {
    // Cache null results to avoid repeated failed requests
    bookInfoCache.set(cacheKey, null);
    return null;
  }
};

/**
 * Fast genre processing from NYT list names
 */
const processBookCategories = (listName) => {
  // Pre-compiled map for O(1) lookup
  const listNameMap = new Map([
    ["hardcover-fiction", ["Fiction", "Bestseller"]],
    ["hardcover-nonfiction", ["Non-Fiction", "Bestseller"]],
    ["paperback-nonfiction", ["Non-Fiction", "Bestseller"]],
    ["young-adult-hardcover", ["Young Adult", "Fiction"]],
    ["trade-fiction-paperback", ["Fiction", "Bestseller"]],
    ["business-books", ["Business", "Non-Fiction"]],
    ["science", ["Science", "Non-Fiction"]],
    ["sports", ["Sports", "Non-Fiction"]],
    ["health", ["Health & Fitness", "Non-Fiction"]],
  ]);

  return listNameMap.get(listName) || ["Bestseller"];
};

/**
 * Fast NYT API fetch with aggressive caching
 */
const fetchFromNYTList = async (listName) => {
  const cacheKey = `nyt-${listName}`;

  // Check cache with extended validity for speed
  if (requestCache.has(cacheKey)) {
    const cached = requestCache.get(cacheKey);
    const cacheAge = Date.now() - cached.timestamp;
    if (cacheAge < 1800000) {
      // 30 minutes cache for speed
      return cached.data;
    }
  }

  try {
    const result = await fastRetry(async () => {
      const url = `https://api.nytimes.com/svc/books/v3/lists/current/${listName}.json?api-key=${NYT_BOOKS_API_KEY}`;

      const response = await axios.get(url, {
        timeout: TIMEOUT,
        headers: {
          "User-Agent": "BookFetcher/1.0",
          Accept: "application/json",
        },
      });

      return response.data.results?.books?.slice(0, 5) || []; // Limit to 5 books per list for speed
    });

    // Cache the result
    requestCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });

    return result;
  } catch (error) {
    console.error(`❌ Failed to fetch ${listName}:`, error.message);
    return [];
  }
};

/**
 * Process books in parallel batches for maximum speed
 */
const processBooksInParallel = async (books) => {
  const processedBooks = [];

  // Process books in parallel batches
  for (let i = 0; i < books.length; i += BATCH_SIZE) {
    const batch = books.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(async (book, index) => {
      try {
        const isbn = book.primary_isbn13 || book.primary_isbn10;

        // Add minimal stagger to avoid overwhelming Google API
        if (index > 0) await sleep(100);

        const googleInfo = await getBookInfoFromGoogle(
          isbn,
          book.title,
          book.author
        );

        return {
          title: book.title || "Untitled",
          type: "Book",
          author: book.author || googleInfo?.authors?.[0] || "Unknown",
          year:
            googleInfo?.year ||
            extractYear(book.published_date) ||
            new Date().getFullYear(),
          genres: googleInfo?.genres || processBookCategories(book.list_name),
          description:
            googleInfo?.description ||
            book.description ||
            "No description available.",
          posterPath:
            googleInfo?.imageLinks?.medium ||
            googleInfo?.imageLinks?.thumbnail ||
            book.book_image?.replace("http:", "https:") ||
            "/images/default-book.png",
          // Only set when Google Books matched the ISBN - without it there's
          // no detail page to link to, so the dashboard skips the book.
          id: googleInfo?.googleId,
          externalId: isbn || `nyt-${book.rank}-${Date.now()}`,
          sourceApi: "nytBooks",
          subtitle: googleInfo?.subtitle,
          pageCount: googleInfo?.pageCount,
          averageRating: googleInfo?.averageRating,
          ratingsCount: googleInfo?.ratingsCount,
          publisher: googleInfo?.publisher,
          language: googleInfo?.language || "en",
          rank: book.rank,
          weeksOnList: book.weeks_on_list,
          listName: book.list_name,
          isbn: isbn,
        };
      } catch (error) {
        // Return minimal book data on error to maintain speed
        return {
          title: book.title || "Untitled",
          type: "Book",
          author: book.author || "Unknown",
          year: new Date().getFullYear(),
          genres: processBookCategories(book.list_name),
          description: book.description || "No description available.",
          posterPath:
            book.book_image?.replace("http:", "https:") ||
            "/images/default-book.png",
          externalId: `nyt-${book.rank}-${Date.now()}`,
          sourceApi: "nytBooks",
          rank: book.rank,
          listName: book.list_name,
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    processedBooks.push(...batchResults);

    // Minimal delay between batches
    if (i + BATCH_SIZE < books.length) await sleep(REQUEST_DELAY);
  }

  return processedBooks;
};

/**
 * Fast fallback using Google Books API
 */
const getFastFallbackBooks = async (limit) => {
  const queries = ["bestseller", "popular books"];
  const allBooks = [];

  // Process queries in parallel for speed
  const queryPromises = queries.map(async (query) => {
    try {
      const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
        query
      )}&orderBy=relevance&maxResults=${Math.ceil(limit / 2)}${
        GOOGLE_BOOKS_API_KEY ? `&key=${GOOGLE_BOOKS_API_KEY}` : ""
      }`;

      const response = await axios.get(url, { timeout: TIMEOUT });
      const items = response.data.items || [];

      return items.slice(0, Math.ceil(limit / 2)).map((item) => {
        const volumeInfo = item.volumeInfo;
        return {
          title: volumeInfo.title || "Untitled",
          type: "Book",
          author: volumeInfo.authors?.[0] || "Unknown",
          year: extractYear(volumeInfo.publishedDate),
          genres: normalizeGenres(volumeInfo.categories),
          description:
            volumeInfo.description?.substring(0, 300) ||
            "No description available.",
          posterPath:
            volumeInfo.imageLinks?.thumbnail?.replace("http:", "https:") ||
            "/images/default-book.png",
          id: item.id,
          externalId:
            item.id ||
            `google-${Date.now()}-${Math.random()
              .toString(36)
              .substring(2, 5)}`,
          sourceApi: "googleBooks",
          averageRating: volumeInfo.averageRating,
          language: volumeInfo.language || "en",
        };
      });
    } catch (error) {
      return [];
    }
  });

  const results = await Promise.all(queryPromises);
  return results.flat().slice(0, limit);
};

/**
 * Ultra-fast main function with parallel processing
 */
const getPopularBooks = async (limit = 3) => {
  return cached(`googlebooks:popular:${limit}`, CATALOG_TTL, () =>
    fetchPopularBooksUncached(limit)
  );
};

const fetchPopularBooksUncached = async (limit = 3) => {

  // Quick validation
  if (!NYT_BOOKS_API_KEY) {
    const fallbackBooks = await getFastFallbackBooks(limit);
    return fallbackBooks;
  }

  try {
    // Fetch from multiple lists in parallel for maximum speed
    const lists = ["hardcover-fiction", "hardcover-nonfiction"];

    const listPromises = lists.map((listName) => fetchFromNYTList(listName));
    const results = await Promise.allSettled(listPromises);

    const allBooks = results
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => r.value)
      .filter(Boolean);

    if (allBooks.length === 0) {
      const fallbackBooks = await getFastFallbackBooks(limit);
      return fallbackBooks;
    }

    // Fast deduplication using Set
    const seen = new Set();
    const uniqueBooks = allBooks.filter((book) => {
      const key = `${book.title}${book.author}`
        .toLowerCase()
        .replace(/\s/g, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const selectedBooks = uniqueBooks.slice(0, limit);

    const processedBooks = await processBooksInParallel(selectedBooks);

    return processedBooks.slice(0, limit);
  } catch (error) {
    const fallbackBooks = await getFastFallbackBooks(limit);
    return fallbackBooks;
  }
};

// Optimized cache management for speed
setInterval(() => {
  // Quick cache cleanup every 10 minutes instead of 5
  if (bookInfoCache.size > 500) {
    // Reduced threshold
    bookInfoCache.clear();
  }
  // Clean old request cache
  const now = Date.now();
  for (const [key, value] of requestCache.entries()) {
    if (now - value.timestamp > 1800000) {
      // 30 minutes
      requestCache.delete(key);
    }
  }
}, 600000); // Every 10 minutes

// Export for use in other modules
module.exports = {
  getPopularBooks,
  getBooksByPreferences,
  normalizeGenres,
  processBookCategories,
};
