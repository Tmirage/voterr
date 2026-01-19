# Voterr

A film voting platform for movie nights that integrates with your Plex ecosystem. Vote on movies, track who's watched what, and organize recurring movie nights with friends.

## Features

- Plex OAuth authentication
- Import Plex users and create local users for guests
- Create groups for different friend circles
- Recurring and one-off movie night schedules
- Nominate movies from your Radarr library
- Vote on nominations with watch history tracking via Tautulli
- Guest access via shareable invite links
- Host assignment with veto power
- Attendance tracking

## Requirements

- Docker and Docker Compose
- Plex Media Server with Plex Pass (for OAuth)
- Radarr (for movie library)
- Tautulli (for watch history) - optional but recommended

## Quick Start

1. Clone the repository:
```bash
git clone https://github.com/Tmirage/voters.git
cd voters
```

2. Copy the environment file and configure:
```bash
cp .env.example .env
```

3. Edit `.env` with your settings:
```env
PLEX_URL=http://your-plex-server:32400
PLEX_TOKEN=your-plex-token
TAUTULLI_URL=http://your-tautulli:8181
TAUTULLI_API_KEY=your-tautulli-api-key
RADARR_URL=http://your-radarr:7878
RADARR_API_KEY=your-radarr-api-key
SESSION_SECRET=generate-a-random-string
```

4. Start with Docker Compose:
```bash
docker-compose up -d
```

5. Access Voterr at `http://localhost:5056`

## Getting API Keys

### Plex Token
1. Sign in to Plex Web App
2. Open any media item
3. Click "Get Info" > "View XML"
4. Find `X-Plex-Token` in the URL

### Tautulli API Key
1. Go to Tautulli Settings
2. Navigate to Web Interface
3. Copy the API Key

### Radarr API Key
1. Go to Radarr Settings
2. Navigate to General
3. Copy the API Key

## Development

### Prerequisites
- Node.js 20+
- npm

### Setup
```bash
# Install dependencies
npm install
cd client && npm install && cd ..

# Start development servers
npm run dev
```

This starts:
- Backend on `http://localhost:5056`
- Frontend on `http://localhost:5173` (proxies API to backend)

### Project Structure
```
voterr/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── context/        # React context (auth)
│   │   ├── lib/            # Utilities (API client)
│   │   └── pages/          # Page components
│   └── ...
├── server/                 # Express backend
│   ├── db/                 # Database setup
│   ├── middleware/         # Express middleware
│   ├── routes/             # API routes
│   └── services/           # External service integrations
├── data/                   # SQLite database (created at runtime)
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## API Endpoints

### Authentication
- `GET /api/auth/plex` - Initiate Plex OAuth
- `GET /api/auth/plex/callback` - Check Plex auth status
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Users
- `GET /api/users` - List all users
- `GET /api/users/plex-friends` - Get importable Plex friends
- `POST /api/users/import-plex` - Import a Plex user
- `POST /api/users/local` - Create a local user
- `DELETE /api/users/:id` - Delete a user

### Groups
- `GET /api/groups` - List user's groups
- `GET /api/groups/:id` - Get group details
- `POST /api/groups` - Create a group
- `POST /api/groups/:id/members` - Add members
- `DELETE /api/groups/:id/members/:userId` - Remove member
- `DELETE /api/groups/:id` - Delete group

### Schedules
- `GET /api/schedules/group/:groupId` - List group schedules
- `POST /api/schedules` - Create a schedule
- `DELETE /api/schedules/:id` - Delete a schedule
- `GET /api/schedules/movie-nights/group/:groupId` - List movie nights
- `GET /api/schedules/movie-nights/:id` - Get movie night details
- `PATCH /api/schedules/movie-nights/:id` - Update movie night
- `POST /api/schedules/movie-nights/:id/attendance` - Set attendance

### Movies
- `GET /api/movies/library` - Get downloaded movies from Radarr
- `GET /api/movies/search?q=term` - Search movies
- `GET /api/movies/:tmdbId` - Get movie details

### Votes
- `GET /api/votes/movie-night/:id` - Get nominations with votes
- `POST /api/votes/nominate` - Nominate a movie
- `DELETE /api/votes/nominations/:id` - Remove nomination
- `POST /api/votes/vote` - Vote for a nomination
- `DELETE /api/votes/vote/:nominationId` - Remove vote
- `POST /api/votes/movie-night/:id/decide` - Pick winner (host/admin)

### Invites
- `POST /api/invites/create` - Create guest invite link
- `GET /api/invites/validate/:token` - Validate invite
- `POST /api/invites/guest-login` - Login as guest via invite
- `GET /api/invites/movie-night/:id` - List invites for movie night
- `DELETE /api/invites/:id` - Delete invite

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `5056` |
| `DATABASE_PATH` | SQLite database path | `./data/voterr.db` |
| `SESSION_SECRET` | Session encryption key | Required in production |
| `NODE_ENV` | Environment (development/production) | `development` |
| `PLEX_URL` | Plex server URL | Required |
| `PLEX_TOKEN` | Plex authentication token | Required |
| `PLEX_CLIENT_ID` | Plex OAuth client ID | `voterr` |
| `TAUTULLI_URL` | Tautulli server URL | Optional |
| `TAUTULLI_API_KEY` | Tautulli API key | Optional |
| `OVERSEERR_URL` | Overseerr server URL | Optional |
| `OVERSEERR_API_KEY` | Overseerr API key | Optional |
| `TMDB_API_KEY` | TMDB API key for movie search | Optional |
| `TZ` | Timezone | `Europe/Amsterdam` |

## Security Notes

- `SESSION_SECRET` is required in production mode. The application will exit with an error if not set when `NODE_ENV=production`.
- Cookies are automatically set to `secure: true` in production mode, requiring HTTPS.
- Admin status changes for users take effect on their next login (session is not immediately updated).

## Docker Installation

### Using Pre-built Image (Recommended)

```bash
docker run -d \
  --name voterr \
  -p 5056:5056 \
  -v ./voterr-data:/app/data \
  -e PLEX_URL=http://your-plex:32400 \
  -e PLEX_TOKEN=your-token \
  -e RADARR_URL=http://your-radarr:7878 \
  -e RADARR_API_KEY=your-key \
  -e SESSION_SECRET=your-secret \
  ghcr.io/tmirage/voterr:latest
```

### Docker Compose

```yaml
services:
  voterr:
    image: ghcr.io/tmirage/voterr:latest
    container_name: voterr
    restart: unless-stopped
    ports:
      - "5056:5056"
    environment:
      - PLEX_URL=http://plex:32400
      - PLEX_TOKEN=${PLEX_TOKEN}
      - TAUTULLI_URL=http://tautulli:8181
      - TAUTULLI_API_KEY=${TAUTULLI_API_KEY}
      - RADARR_URL=http://radarr:7878
      - RADARR_API_KEY=${RADARR_API_KEY}
      - SESSION_SECRET=${SESSION_SECRET}
    volumes:
      - ./voterr-data:/app/data
```

### Supported Architectures

The Docker image is built for multiple platforms:
- `linux/amd64` - Standard x86_64 servers
- `linux/arm64` - Raspberry Pi 4, Apple Silicon, ARM servers

## License

MIT
