const axios = require("axios");
require("dotenv").config();
const { cached } = require("./cache");

const CATALOG_TTL = 20 * 60 * 1000; // 20 minutes

// Genre ID-to-name mapping from TMDB
const genreMapforMatch = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

const genreMap = {
  28: "Act",
  12: "Adv",
  16: "Ani",
  35: "Com",
  80: "Cri",
  99: "Doc",
  18: "Dra",
  10751: "Fam",
  14: "Fan",
  36: "His",
  27: "Hor",
  10402: "Mus",
  9648: "Mys",
  10749: "Rom",
  878: "Sci",
  10770: "TV Mov",
  53: "Thriller",
  10752: "War",
  37: "Wes",
};

// Reverse genre map for lookup by name
const genreNameToId = {
  action: 28,
  adventure: 12,
  animation: 16,
  comedy: 35,
  crime: 80,
  documentary: 99,
  drama: 18,
  family: 10751,
  fantasy: 14,
  history: 36,
  horror: 27,
  music: 10402,
  mystery: 9648,
  romance: 10749,
  "science fiction": 878,
  sciencefiction: 878, // alias
  scifi: 878, // alias
  "tv movie": 10770,
  tvmovie: 10770, // alias
  thriller: 53,
  war: 10752,
  western: 37,
};

const getTrendingMovies = async (limit = 5) => {
  try {
    // Cache the full trending page once and slice per-call, so every
    // requested `limit` shares the same cached fetch instead of fragmenting
    // the cache by limit value.
    const movies = await cached("tmdb:trending", CATALOG_TTL, async () => {
      const response = await axios.get(
        `https://api.themoviedb.org/3/trending/movie/week?api_key=${process.env.TMDB_API_KEY}`
      );

      return response.data.results.map((movie) => {
        // Ensure genre_ids exists and is an array
        const genreIds = Array.isArray(movie.genre_ids) ? movie.genre_ids : [];
        const genres = genreIds.map((id) => genreMap[id]).filter(Boolean);

        // If no genres found, add 'Unknown' as fallback
        if (genres.length === 0) {
          genres.push("Unknown");
        }

        return {
          title: movie.title,
          type: "Movie",
          genre: genres,
          year: movie.release_date
            ? new Date(movie.release_date).getFullYear()
            : new Date().getFullYear(),
          posterPath: movie.poster_path
            ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
            : "/images/default-movie.jpg",
          id: movie.id.toString(),
          externalId: movie.id.toString(),
          description: movie.overview || "No description available.",
          sourceApi: "tmdb",
        };
      });
    });

    return movies.slice(0, limit);
  } catch (error) {
    console.error("❌ Error fetching trending movies:", error.message);
    return [];
  }
};

const getMoviesByPreferences = async (preferences, limit = 10) => {

  try {
    if (!preferences.topGenres || preferences.topGenres.length === 0) {
      return await getTrendingMovies(limit);
    }

    // Normalize input genres to lowercase and no spaces for matching
    const normalizedInputGenres = preferences.topGenres.map((g) =>
      g.toLowerCase().replace(/\s+/g, "")
    );

    // Convert genre names to TMDB genre IDs
    const genreIds = normalizedInputGenres
      .map((name) => {
        const id = genreNameToId[name];
        return id;
      })
      .filter(Boolean)
      // Callers pass a ranked list that can include book-only genres (e.g.
      // "Fiction"), so take the top 5 that actually exist on TMDB.
      .slice(0, 5);

    if (genreIds.length === 0) {
      return await getTrendingMovies(limit);
    }

    // Sorted so the same set of genres (regardless of input order) shares a cache entry
    const sortedGenreIds = [...genreIds].sort((a, b) => a - b);

    const results = await cached(
      `tmdb:byGenres:${sortedGenreIds.join("-")}`,
      CATALOG_TTL,
      async () => {
        const params = {
          api_key: process.env.TMDB_API_KEY,
          with_genres: sortedGenreIds.join("|"),
          sort_by: "popularity.desc",
          "vote_count.gte": 50,
          "primary_release_date.gte": `${new Date().getFullYear() - 5}-01-01`,
          page: 1,
        };

        const response = await axios.get(
          "https://api.themoviedb.org/3/discover/movie",
          {
            params,
            timeout: 5000,
          }
        );

        return response.data.results;
      }
    );

    // Filter movies to ensure at least one genre matches
    const filteredMovies = results.filter((movie) => {
      if (!Array.isArray(movie.genre_ids)) return false;
      const movieGenres = movie.genre_ids
        .map((id) => genreMapforMatch[id]?.toLowerCase() || "")
        .filter(Boolean);
      // Check if any movie genre is in input genre list
      return movieGenres.some((genre) =>
        normalizedInputGenres.includes(genre.replace(/\s+/g, ""))
      );
    });

    // Map filtered movies to app format
    const movies = filteredMovies.slice(0, limit).map((movie) => {
      // const movieGenres = movie.genre_ids
      //   .map(id => genreMapforMatch[id] || 'Unknown')
      //   .filter(Boolean);
      const movieGenres = movie.genre_ids
        .map((id) => genreMap[id] || "Unknown")
        .filter(Boolean);

      // Calculate match score (optional)
      const matchScore = movieGenres.reduce((score, genre) => {
        return (
          score +
          (normalizedInputGenres.includes(
            genre.toLowerCase().replace(/\s+/g, "")
          )
            ? 1
            : 0)
        );
      }, 0);

      return {
        title: movie.title,
        type: "Movie",
        genre: movieGenres,
        year: movie.release_date
          ? new Date(movie.release_date).getFullYear()
          : new Date().getFullYear(),
        posterPath: movie.poster_path
          ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
          : "/images/default-movie.jpg",
        id: movie.id.toString(),
        description: movie.overview || "No description available.",
        rating: movie.vote_average || 0,
        sourceApi: "tmdb",
        matchScore,
      };
    });

    // Sort by matchScore desc, then rating desc
    const sortedMovies = movies.sort((a, b) => {
      if (b.matchScore === a.matchScore) {
        return b.rating - a.rating;
      }
      return b.matchScore - a.matchScore;
    });

    // If not enough movies, fill with trending
    if (sortedMovies.length < 5) {
      const fallbackMovies = await getTrendingMovies(
        limit - sortedMovies.length
      );
      return [...sortedMovies, ...fallbackMovies].slice(0, limit);
    }

    return sortedMovies.slice(0, limit);
  } catch (error) {
    console.error("❌ Error fetching movies by preferences:", error.message);
    return await getTrendingMovies(limit);
  }
};

module.exports = {
  getTrendingMovies,
  getMoviesByPreferences,
  genreMap,
};
