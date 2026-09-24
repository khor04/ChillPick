# ChillPick

ChillPick is a movie and book recommendation platform. Users can discover trending and personalized picks, track what they're watching or reading, review and discuss titles with other users, and get notified when someone interacts with their reviews.

## Tech Stack

- **Backend**: Node.js, Express 5
- **Database**: MongoDB (Atlas) via Mongoose
- **Sessions**: express-session + connect-mongo
- **Templating**: EJS
- **External APIs**: TMDB (movies), Google Books + NYT Books (books), ImageKit (profile picture hosting)
- **Email**: Brevo
- **Scheduled jobs**: node-cron

## Features

- Accounts with email verification, password reset, and session timeout warnings
- Movie & book discovery with search, autocomplete, and personalized recommendations
- Watchlist & history tracking with status badges shown across the app
- Reviews with likes, replies, and in-app notifications
- Legitimate "Where to Watch" / "Read Preview" links
- Rate limiting and server-side caching for security and performance

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- Access to the shared MongoDB Atlas cluster

### Setup
1. Clone or copy the project files
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file in the project root (see [Environment Variables](#environment-variables) below)
4. Start the server:
   ```
   npm start
   ```
5. Visit `http://localhost:3000`

## Environment Variables

Create a `.env` file with the following keys. Ask a teammate for the actual values — **never commit this file**.

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Shared MongoDB Atlas connection string |
| `SESSION_SECRET` | Secret used to sign session cookies |
| `TMDB_API_KEY` | The Movie Database API key (movies) |
| `GOOGLE_BOOKS_API` | Full Google Books API URL used for the Discover catalog |
| `GOOGLE_BOOKS_API_KEY` | Google Books API key |
| `NYT_BOOKS_API_KEY` | New York Times Books API key (popular books) |
| `BREVO_API_KEY` | Brevo API key. When set, all emails are sent through Brevo's HTTP API. When empty, emails fall back to Gmail SMTP below |
| `MAIL_FROM` | Sender address for all emails. With Brevo it must be a verified sender in your Brevo account. Defaults to `EMAIL_USER` |
| `EMAIL_USER` / `EMAIL_PASS` | Gmail account used for the Gmail SMTP fallback (local development without a Brevo key) |
| `IMAGEKIT_PUBLIC_KEY` / `IMAGEKIT_PRIVATE_KEY` / `IMAGEKIT_URL_ENDPOINT` | ImageKit credentials for profile picture uploads |
| `CLIENT_URL` | Public site URL used in verification and password-reset email links (defaults to `http://localhost:3000`; set it when deployed) |



## Project Structure

```
routes/       Express route handlers (account, discover, movie/book detail, watchlist, notifications, ...)
models/       Mongoose schemas
services/     External API integrations, caching, notifications, recommendations
middleware/   Rate limiting
views/        EJS templates
js/           Client-side scripts
css/          Stylesheets
```

- If your local `node_modules` is out of date after pulling new code, run `npm install` again to pick up any newly added dependencies.
