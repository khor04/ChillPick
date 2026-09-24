const tmdbApiKey = "4154b8dfb44ef69e6cf3a7d880438188";
const nytApiKey = "DYk1mOvetvkJP2mPGA3upKrHew7XYFuPPSVGPR8tPrh4NW8O";
const googleApiKey = "AIzaSyBwif3CjkeE_8oy4vEIDltxZTaioeFzUhc";
const imageBase = "https://image.tmdb.org/t/p/w780";
const thumbBase = "https://image.tmdb.org/t/p/w342";

let movieData = [],
  chart,
  bookChart;

// Load movie data and then render chart + hero section
async function loadMovieData() {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/movie/popular?api_key=${tmdbApiKey}`
    );
    const data = await res.json();
    movieData = data.results.map((m) => ({
      id: m.id,
      title: m.title,
      rating: m.vote_average,
      popularity: m.popularity,
      overview: m.overview,
      image: m.backdrop_path
        ? imageBase + m.backdrop_path
        : "https://via.placeholder.com/780x439?text=No+Image",
      thumb: m.poster_path
        ? thumbBase + m.poster_path
        : "https://via.placeholder.com/342x513?text=No+Poster",
    }));
    document.getElementById("lastUpdated").textContent =
      "Last updated: " + new Date().toLocaleString();

    // Ensure cinematic renders
    renderByMetric("rating");
  } catch (err) {
    console.error("Movie API error:", err);
  }
}

// Ensure this is globally accessible
function updateChartMetric(metric) {
  renderByMetric(metric);
}
window.updateChartMetric = updateChartMetric; // ✅ Ensure dropdown works

// Book Data
async function loadBookData() {
  try {
    const nytRes = await fetch(
      `https://api.nytimes.com/svc/books/v3/lists/current/hardcover-fiction.json?api-key=${nytApiKey}`
    );
    const nytData = await nytRes.json();
    const combinedBooks = await Promise.all(
      nytData.results.books.slice(0, 5).map(async (nytBook) => {
        const title = nytBook.title;
        const author = nytBook.author;
        let googleBook = null;
        try {
          const googleRes = await fetch(
            `https://www.googleapis.com/books/v1/volumes?q=intitle:"${title}"+inauthor:"${author}"&key=${googleApiKey}`
          );
          const googleData = await googleRes.json();
          if (googleData.items && googleData.items.length > 0) {
            googleBook = googleData.items[0];
          }
        } catch (err) {
          console.warn(`Google fetch failed for ${title}:`, err);
        }
        const info = googleBook?.volumeInfo || {};
        return {
          id: googleBook?.id || title + "-" + author,
          title,
          author,
          description:
            (
              info.description ||
              nytBook.description ||
              "No description available."
            ).slice(0, 150) + "...",
          image:
            info.imageLinks?.thumbnail ||
            "https://via.placeholder.com/342x513?text=No+Cover",
          rank: nytBook.rank,
        };
      })
    );
    document.getElementById("booksLastUpdated").textContent =
      "Last updated: " + new Date().toLocaleString();
    renderBookHeroSection(combinedBooks);
    renderBookChart(combinedBooks);
  } catch (err) {
    console.error("Books API error:", err);
    document.getElementById("booksLastUpdated").textContent =
      "⚠️ Failed to load books.";
  }
}

function renderByMetric(metric) {
  const topMovies = [...movieData]
    .sort((a, b) => b[metric] - a[metric])
    .slice(0, 5);
  renderMovieChart(metric, topMovies);
  renderHeroSection(topMovies);
}

function updateChartMetric(metric) {
  renderByMetric(metric);
}

function renderMovieChart(metric, sortedData) {
  const options = {
    chart: { type: "bar", height: 400 },
    series: [
      {
        name: metric === "rating" ? "IMDb Rating" : "Popularity",
        data: sortedData.map((m) => m[metric]),
      },
    ],
    plotOptions: {
      bar: { borderRadius: 10, columnWidth: "50%", distributed: true },
    },
    dataLabels: {
      enabled: true,
      style: { colors: ["#fff"], fontWeight: "bold" },
    },
    xaxis: {
      categories: sortedData.map((m) => m.title),
      labels: { rotate: -30, style: { fontSize: "13px", colors: "#6B4F3D" } },
    },
    yaxis: {
      title: {
        text: metric === "rating" ? "IMDb Ratings" : "Popularity Score",
        style: { color: "#6B4F3D" },
      },
      max: metric === "rating" ? 10 : undefined,
    },
    tooltip: {
      custom: ({ dataPointIndex }) => {
        const m = sortedData[dataPointIndex];
        return `
      <div style="padding: 10px; max-width: 220px;">
        <div style="font-weight: 600; font-size: 15px;">${m.title}</div>
        <div style="font-size: 14px;">Rating: ${m.rating.toFixed(1)}</div>
        <div style="font-size: 14px;">Popularity: ${Math.round(
          m.popularity
        )}</div>
      
      </div>
    `;
      },
    },
    colors: ["#6B4F3D"],
    legend: { show: false },
  };
  if (!chart) {
    chart = new ApexCharts(
      document.querySelector("#entertainmentChart"),
      options
    );
    chart.render();
  } else {
    chart.updateOptions(options);
  }
}
function renderHeroSection(movies) {
  const hero = document.getElementById("cinematicSection");
  const carousel = document.getElementById("nezhaCarousel");
  const dots = document.getElementById("nezhaDots");
  const info = document.getElementById("nezhaInfo");

  carousel.innerHTML = "";
  dots.innerHTML = "";

  if (movies.length === 0) return;

  const first = movies[0];
  hero.style.backgroundImage = `url('${first.image}')`;
  info.innerHTML = `<h1>${first.title}</h1><p>${first.overview}</p><a href="/movie_detail/${first.id}" class="btn btn-outline-light">Details</a>`;

  movies.forEach((m, i) => {
    const card = document.createElement("div");
    card.className = "nezha-card";
    if (i === 0) card.classList.add("active");
    card.innerHTML = `<img src="${m.thumb}" alt="${m.title}">`;

    card.onclick = () => {
      hero.style.backgroundImage = `url('${m.image}')`;
      info.innerHTML = `<h1>${m.title}</h1><p>${m.overview}</p><a href="/movie_detail/${m.id}" class="btn btn-outline-light">Details</a>`;
      document
        .querySelectorAll(".nezha-card")
        .forEach((c) => c.classList.remove("active"));
      document
        .querySelectorAll(".nezha-dot")
        .forEach((d) => d.classList.remove("active"));
      card.classList.add("active");
      dots.children[i].classList.add("active");
    };

    carousel.appendChild(card);

    const dot = document.createElement("div");
    dot.className = "nezha-dot";
    if (i === 0) dot.classList.add("active");
    dot.onclick = card.onclick;
    dots.appendChild(dot);
  });
}
function renderBookChart(books) {
  const options = {
    chart: { type: "bar", height: 400 },
    series: [{ name: "Rank", data: books.map((book) => 11 - book.rank) }],
    plotOptions: {
      bar: { borderRadius: 10, columnWidth: "50%", distributed: true },
    },
    dataLabels: {
      enabled: true,
      formatter: (_, { dataPointIndex }) => `#${books[dataPointIndex].rank}`,
      style: { colors: ["#fff"], fontWeight: "bold" },
    },
    xaxis: {
      categories: books.map((b) => b.title),
      labels: { rotate: -30, style: { fontSize: "13px", colors: "#6B4F3D" } },
    },
    yaxis: {
      min: 0,
      max: 10,
      title: { text: "Ranking", style: { color: "#6B4F3D" } },
    },
    tooltip: {
      custom: ({ dataPointIndex }) => {
        const b = books[dataPointIndex];
        return `
      <div style="padding: 10px; max-width: 220px;">
        <div style="font-weight: 600; font-size: 15px;">${b.title}</div>
        <div style="font-size: 14px;">Author: ${b.author}</div>

      </div>
    `;
      },
    },
    colors: ["#6B4F3D"],
    legend: { show: false },
  };
  if (!bookChart) {
    bookChart = new ApexCharts(document.querySelector("#booksChart"), options);
    bookChart.render();
  } else {
    bookChart.updateOptions(options);
  }
}
function renderBookHeroSection(books) {
  const hero = document.getElementById("bookCinematicSection");
  const carousel = document.getElementById("bookCarousel");
  const dots = document.getElementById("bookDots");
  const info = document.getElementById("bookInfo");

  carousel.innerHTML = "";
  dots.innerHTML = "";

  if (books.length === 0) return;

  const first = books[0];
  hero.style.backgroundImage = `linear-gradient(to right, rgba(0,0,0,0.7), rgba(0,0,0,0.2)), url('${first.image}')`;
  info.innerHTML = `<h1>${first.title}</h1><p>${first.description}</p><a href="/book_detail/${first.id}" class="btn btn-outline-light">Details</a>`;

  books.forEach((b, i) => {
    const card = document.createElement("div");
    card.className = "nezha-card";
    if (i === 0) card.classList.add("active");
    card.innerHTML = `<img src="${b.image}" alt="${b.title}">`;

    card.onclick = () => {
      hero.style.backgroundImage = `linear-gradient(to right, rgba(0,0,0,0.7), rgba(0,0,0,0.2)), url('${b.image}')`;
      info.innerHTML = `<h1>${b.title}</h1><p>${b.description}</p><a href="/book_detail/${b.id}" class="btn btn-outline-light">Details</a>`;
      document
        .querySelectorAll("#bookCarousel .nezha-card")
        .forEach((c) => c.classList.remove("active"));
      document
        .querySelectorAll("#bookDots .nezha-dot")
        .forEach((d) => d.classList.remove("active"));
      card.classList.add("active");
      dots.children[i].classList.add("active");
    };

    carousel.appendChild(card);

    const dot = document.createElement("div");
    dot.className = "nezha-dot";
    if (i === 0) dot.classList.add("active");
    dot.onclick = card.onclick;
    dots.appendChild(dot);
  });
}
function checkLoginAndToggleCTA() {
  fetch("/account/profile-data", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      const callToAction = document.getElementById("callToAction");
      if (data && data.username) {
        callToAction?.classList.add("d-none");
      } else {
        callToAction?.classList.remove("d-none");
      }
    })
    .catch(() => {
      // On error, default to show CTA
      document.getElementById("callToAction")?.classList.remove("d-none");
    });
}

function showExplorePromptIfFirstLogin() {
  fetch("/account/profile-data", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data?.isFirstLogin) {
        const wrapper = document.getElementById("recommendWrapper");
        if (wrapper) {
          wrapper.classList.add("blurred");

          const overlay = document.createElement("div");
          overlay.className =
            "position-absolute top-50 start-50 translate-middle text-center bg-white p-4 rounded shadow";
          overlay.innerHTML = `
              <h5>Explore to get personalized picks</h5>
              <a href="/discover" class="btn btn-warning mt-2">Go to Discover Page</a>
            `;
          wrapper.appendChild(overlay);
        }
      }
    })
    .catch((err) => {
      console.warn("Failed to check first login:", err);
    });
}

// --- Footer and Startup ---
window.addEventListener("DOMContentLoaded", () => {
  loadMovieData();
  loadBookData();
  checkLoginAndToggleCTA();
  showExplorePromptIfFirstLogin();

  fetch("../partials/footer.html")
    .then((res) => (res.ok ? res.text() : Promise.reject()))
    .then((html) => (document.getElementById("footer").innerHTML = html))
    .catch(() => {
      document.getElementById(
        "footer"
      ).innerHTML = `<footer class="bg-dark text-white text-center py-4"><p>© 2025 ChillPick</p></footer>`;
    });

  const signupBtn = document.getElementById("signupBtn");
  if (signupBtn) {
    signupBtn.addEventListener(
      "click",
      () => (window.location.href = "/account/register")
    );
  }
});
