const tmdbService = require("./tmdbService");
const googleBooksService = require("./googleBooksService");
const Interaction = require("../models/SavedSearch");
const mongoose = require("mongoose");
const CACHE_TTL = 60 * 60 * 1000; // 1 hour cache
const User = require("../models/User");
const RECOMMENDATION_COUNT = 12; // 3 rows of 4 per media type on the dashboard
// Each onboarding-quiz genre counts as this many interactions, so explicit
// picks keep steering recommendations until real behaviour outweighs them.
const ONBOARDING_GENRE_WEIGHT = 3;

// `id` must be the ID the detail page expects (TMDB movie ID / Google Books
// volume ID). externalId is deliberately not used as a fallback: for NYT
// bestsellers it's an ISBN, which /book_detail can't load.
const normalize = (rec, type) => ({
  ...rec,
  id: rec.id || rec.tmdbId || rec.bookId,
  type,
  genre: Array.isArray(rec.genre) && rec.genre.length > 0 ? rec.genre : ["Unknown"],
  year: rec.year || new Date().getFullYear(),
  description: rec.description || "No description available.",
});

const getRecommendations = async (userId) => {
  try {

    if (userId) {
      // Validate userId format
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return getDefaultRecommendations();
      }
      // Check if user exists
      const userExists = await User.exists({ _id: userId });
      if (!userExists) {
        return getDefaultRecommendations();
      }
      const personalized = await getPersonalizedRecommendations(userId);
      return personalized;
    }

    // No userId provided, return default recommendations
    return getDefaultRecommendations();
  } catch (error) {
    console.error("Recommendation error:", error);
    return getDefaultRecommendations();
  }
};
const getDefaultRecommendations = async () => {
  try {
    const movieCount = RECOMMENDATION_COUNT;
    const bookCount = RECOMMENDATION_COUNT;
    const fetchLimit = RECOMMENDATION_COUNT * 2; // fetch extra to ensure enough valid items
    const [movies, books] = await Promise.all([
      tmdbService.getTrendingMovies(fetchLimit),
      googleBooksService.getPopularBooks(fetchLimit),
    ]);
    if (movies.length === 0 && books.length === 0) {
      console.warn("⚠️ No movies or books fetched.");
      return [];
    }
    const shuffledMovies = shuffleArray(toLinkable(movies, "Movie")).slice(
      0,
      movieCount
    );
    const shuffledBooks = shuffleArray(toLinkable(books, "Book")).slice(
      0,
      bookCount
    );
    const combined = shuffleArray([...shuffledMovies, ...shuffledBooks]);
    return combined;
  } catch (error) {
    console.error("🔥 Error:", error.message);
    return [];
  }
};
const getPersonalizedRecommendations = async (userId) => {
  try {

    // Get user's interaction history and fetches up to 100 of the most recent activities
    const interactions = await Interaction.find({ userId })
      .sort({ timestamp: -1 })
      .limit(100);

    // Genres seen in behaviour (clicks, watchlist adds, genre filters), plus
    // the onboarding-quiz picks - so the quiz still counts after the first
    // search/click instead of being dropped entirely.
    const genreCounts = analyzeUserPreferences(interactions).genres;
    const user = await User.findById(userId).select("preferredGenres");
    (user?.preferredGenres || []).forEach((genre) => {
      genreCounts[genre] = (genreCounts[genre] || 0) + ONBOARDING_GENRE_WEIGHT;
    });

    // Ranked list; the movie/book services each pick the top genres they
    // can actually use, so pass more than 5 through.
    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([genre]) => genre);

    if (topGenres.length === 0) {
      return await getDefaultRecommendations();
    }

    // Fetch content based on top genres
    const fetchLimit = RECOMMENDATION_COUNT * 3;
    const [moviesRaw, booksRaw] = await Promise.all([
      tmdbService.getMoviesByPreferences
        ? tmdbService.getMoviesByPreferences({ topGenres }, fetchLimit)
        : tmdbService.getTrendingMovies(fetchLimit),
      googleBooksService.getBooksByPreferences
        ? googleBooksService.getBooksByPreferences({ topGenres }, fetchLimit)
        : googleBooksService.getPopularBooks(fetchLimit),
    ]);

    // Randomly pick from the linkable items, topping up from trending/popular
    // when there aren't enough.
    const [selectedMovies, selectedBooks] = await Promise.all([
      pickRecommendations(moviesRaw, "Movie", () =>
        tmdbService.getTrendingMovies(RECOMMENDATION_COUNT * 2)
      ),
      pickRecommendations(booksRaw, "Book", () =>
        googleBooksService.getPopularBooks(RECOMMENDATION_COUNT * 2)
      ),
    ]);

    // Combine and shuffle the final results for even more randomness
    const final = shuffleArray([...selectedMovies, ...selectedBooks]);

    return final;

  } catch (error) {
    console.error("Error in getPersonalizedRecommendations:", error);
    return await getDefaultRecommendations(); // Fallback
  }
};

const analyzeUserPreferences = (interactions) => {
  const genreOccurrences = {
    genres: {}, 
    topGenres: [], 
  };

  interactions.forEach((interaction) => {
    // Track clicked items and their genres
    if (
      interaction.interactionType === "item clicked" &&
      interaction.clickedItem
    ) {
      const itemGenres =
        interaction.clickedItem.genres || interaction.clickedItem.genre || [];

      if (Array.isArray(itemGenres)) {
        itemGenres.forEach((genre) => {
          genreOccurrences.genres[genre] =
            (genreOccurrences.genres[genre] || 0) + 1;
        });
      }
    }

    // Track watchlisted items and their genres
    if (
      interaction.interactionType === "add to watchlist" &&
      interaction.itemDetails
    ) {
      const itemGenres =
        interaction.itemDetails.genres || interaction.itemDetails.genre || [];

      if (Array.isArray(itemGenres)) {
        itemGenres.forEach((genre) => {
          genreOccurrences.genres[genre] =
            (genreOccurrences.genres[genre] || 0) + 1;
        });
      }
    }

    // Track explicit genre filters
    if (interaction.interactionType === "filter genre" && interaction.genre) {
      genreOccurrences.genres[interaction.genre] =
        (genreOccurrences.genres[interaction.genre] || 0) + 1;
    }
  });

  // Get top genres by count
  genreOccurrences.topGenres = Object.entries(genreOccurrences.genres)
    .sort((a, b) => b[1] - a[1]) // Sort by count descending
    .slice(0, 5) // Take top 5
    .map(([genre]) => genre); 

  return genreOccurrences;
};

// Normalizes items and keeps only ones the dashboard can link to (has an
// `id`), without duplicates.
const toLinkable = (items, type) => {
  const seen = new Set();
  return items
    .map((item) => normalize(item, type))
    .filter((item) => {
      if (!item.id || seen.has(String(item.id))) return false;
      seen.add(String(item.id));
      return true;
    });
};

// Picks RECOMMENDATION_COUNT random linkable items, topping up from
// fetchFallback() if the personalized pool is too small.
const pickRecommendations = async (items, type, fetchFallback) => {
  let selected = shuffleArray(toLinkable(items, type)).slice(
    0,
    RECOMMENDATION_COUNT
  );

  if (selected.length < RECOMMENDATION_COUNT) {
    const chosenIds = new Set(selected.map((item) => String(item.id)));
    const extra = toLinkable(await fetchFallback(), type).filter(
      (item) => !chosenIds.has(String(item.id))
    );
    selected = [
      ...selected,
      ...extra.slice(0, RECOMMENDATION_COUNT - selected.length),
    ];
  }

  return selected;
};

// Randomly shuffles items to avoid the same order every time.
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const refreshRecommendations = async (targetCount = 8) => {
  try {

    // Use the same logic as getRecommendations
    const result = await getRecommendations(targetCount);

    const movieCount = result.filter((r) => r.type === "Movie").length;
    const bookCount = result.filter((r) => r.type === "Book").length;

    return {
      success: true,
      count: result.length,
      distribution: { movies: movieCount, books: bookCount },
    };
  } catch (error) {
    console.error("❌ Error refreshing recommendations:", error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  getRecommendations,
  getDefaultRecommendations,
  getPersonalizedRecommendations,
  refreshRecommendations,
  analyzeUserPreferences, 
};
