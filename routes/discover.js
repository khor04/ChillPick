const express = require("express");
const axios = require("axios");
const { cached } = require("../services/cache");

const router = express.Router();
require("dotenv").config();

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const CATALOG_TTL = 20 * 60 * 1000; // 20 minutes - shared across every visitor

// Genre ID-to-name mapping from TMDB
const genreMap = {
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
router.get("/movies", async (req, res) => {
  const { page = 1, genre, rating } = req.query;

  try {
    let movies = await cached(`discover:movies:page:${page}`, CATALOG_TTL, async () => {
      const response = await axios.get(
        `https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_API_KEY}&language=en-US&page=${page}`
      );

      return response.data.results.map((m) => ({
        id: m.id,
        title: m.title,
        type: "movie",
        rating: m.vote_average.toFixed(1),
        image: m.poster_path
          ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
          : "/images/default-movie.jpg",
        genres: m.genre_ids.map((id) => genreMap[id] || "Unknown"),
      }));
    });

    if (genre) {
      movies = movies.filter((m) => m.genres.includes(genre));
    }
    if (rating) {
      movies = movies.filter((m) => parseFloat(m.rating) >= parseFloat(rating));
    }

    res.json(movies);
  } catch (error) {
    console.error("❌ Error fetching movies:", error.message);
    res.status(500).send("Movie list error");
  }
});
// Live search across movies + books (not limited to the pre-fetched discover grid).
// Default: 5 + 5 small-thumbnail suggestions for the autocomplete dropdown.
// ?full=1: up to 20 + 20 with full-size posters, for the Search button results grid.
router.get("/search", async (req, res) => {
  const query = (req.query.q || "").trim();
  if (query.length < 2) {
    return res.json([]);
  }
  const full = req.query.full === "1";
  const perType = full ? 20 : 5;

  try {
    const [movieResponse, bookResponse] = await Promise.all([
      axios.get("https://api.themoviedb.org/3/search/movie", {
        params: { api_key: TMDB_API_KEY, query, page: 1 },
      }),
      axios.get("https://www.googleapis.com/books/v1/volumes", {
        params: {
          q: query,
          key: process.env.GOOGLE_BOOKS_API_KEY,
          maxResults: perType,
        },
      }),
    ]);

    const movies = (movieResponse.data.results || [])
      .slice(0, perType)
      .map((m) => ({
        id: m.id,
        title: m.title,
        type: "movie",
        rating: m.vote_average ? m.vote_average.toFixed(1) : "N/A",
        image: m.poster_path
          ? `https://image.tmdb.org/t/p/${full ? "w500" : "w92"}${m.poster_path}`
          : "/images/default-movie.jpg",
        subtitle: m.release_date ? m.release_date.slice(0, 4) : "",
        // Sent back with the "item clicked" interaction so the pick feeds recommendations
        genres: (m.genre_ids || []).map((id) => genreMap[id]).filter(Boolean),
      }));

    const books = (bookResponse.data.items || [])
      .slice(0, perType)
      .map((item) => ({
        id: item.id,
        title: item.volumeInfo.title,
        type: "book",
        rating: item.volumeInfo.averageRating || "N/A",
        image:
          item.volumeInfo.imageLinks?.thumbnail || "/images/default-book.jpg",
        subtitle: (item.volumeInfo.authors || []).join(", "),
        genres: item.volumeInfo.categories || [],
      }));

    res.json([...movies, ...books]);
  } catch (error) {
    console.error("❌ Error fetching search suggestions:", error.message);
    res.status(500).json({ error: "Search failed" });
  }
});

router.get("/movie_detail/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const response = await axios.get(
      `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_API_KEY}&language=en-US`
    );
    const movie = response.data;
    res.render("detail_page/movie_detail", { movie });
  } catch (error) {
    console.error("❌ Error fetching movie detail:", error.message);
    res.status(500).send("Failed to fetch movie detail");
  }
});

// Route for book list (used in Discover page)
router.get("/books", async (req, res) => {
  const { genre, rating } = req.query;
  const startIndex = Number.isInteger(parseInt(req.query.startIndex))
    ? parseInt(req.query.startIndex)
    : 0;
  try {
    let books = await cached(`discover:books:startIndex:${startIndex}`, CATALOG_TTL, async () => {
      const response = await axios.get(
        `${process.env.GOOGLE_BOOKS_API}&startIndex=${startIndex}`
      );
      return (response.data.items || []).map((item) => ({
        id: item.id,
        title: item.volumeInfo.title,
        type: "book",
        rating: item.volumeInfo.averageRating || "N/A",
        image:
          item.volumeInfo.imageLinks?.thumbnail || "/images/default-book.jpg",
        genres: item.volumeInfo.categories || ["General"],
      }));
    });

    if (genre) {
      books = books.filter((b) => b.genres.includes(genre));
    }
    if (rating) {
      books = books.filter((b) => parseFloat(b.rating) >= parseFloat(rating));
    }

    res.json(books);
  } catch (err) {
    console.error("❌ Failed to fetch book list:", err.message);
    res.status(500).send("Book list error");
  }
});

// Route for book detail (with ID)
router.get("/book_detail/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const response = await axios.get(
      `https://www.googleapis.com/books/v1/volumes/${id}?key=${process.env.GOOGLE_BOOKS_API_KEY}`
    );
    const book = response.data;
    res.render("detail_page/book_detail", { book });
  } catch (error) {
    console.error(
      "❌ Error fetching book detail:",
      error.response?.data || error.message
    );
    res.status(500).send("Failed to fetch book detail");
  }
});
module.exports = router;
