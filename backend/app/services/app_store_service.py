from __future__ import annotations

from pathlib import Path

from app.services import compose_service

COMPOSE_DIR = compose_service.COMPOSE_DIR

APP_CATALOG: list[dict] = [
    # ── Storage ────────────────────────────────────────────────────────────────
    {
        "id": "nextcloud",
        "name": "Nextcloud",
        "description": "Self-hosted cloud storage and collaboration platform with file sync, calendar, contacts, and more.",
        "category": "Storage",
        "icon": "cloud",
        "ports": [8080],
        "requires_volumes": True,
        "ram_mb": 512,
        "notes": "Default login: admin / changeme. Data stored in /opt/sudo-pi/data/nextcloud",
        "compose": """\
services:
  nextcloud:
    image: lscr.io/linuxserver/nextcloud:latest
    container_name: nextcloud
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=UTC
    volumes:
      - /opt/sudo-pi/data/nextcloud/config:/config
      - /opt/sudo-pi/data/nextcloud/data:/data
    ports:
      - 8080:443
    restart: unless-stopped
""",
    },
    {
        "id": "filebrowser",
        "name": "Filebrowser",
        "description": "Web-based file manager — browse, upload, delete, preview, and share files through a clean browser UI.",
        "category": "Storage",
        "icon": "folder",
        "ports": [8085],
        "requires_volumes": True,
        "ram_mb": 64,
        "notes": "Default login: admin / admin. Serves /opt/sudo-pi/data/files by default.",
        "compose": """\
services:
  filebrowser:
    image: filebrowser/filebrowser:latest
    container_name: filebrowser
    ports:
      - 8085:80
    volumes:
      - /opt/sudo-pi/data/files:/srv
      - /opt/sudo-pi/data/filebrowser/database.db:/database.db
    restart: unless-stopped
""",
    },
    {
        "id": "syncthing",
        "name": "Syncthing",
        "description": "Continuous file synchronization between devices — private, encrypted, and peer-to-peer.",
        "category": "Storage",
        "icon": "refresh-cw",
        "ports": [8384, 22000],
        "requires_volumes": True,
        "ram_mb": 128,
        "notes": "Web UI at http://pi:8384 — add devices by exchanging device IDs.",
        "compose": """\
services:
  syncthing:
    image: lscr.io/linuxserver/syncthing:latest
    container_name: syncthing
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=UTC
    volumes:
      - /opt/sudo-pi/data/syncthing/config:/config
      - /opt/sudo-pi/data/syncthing/data:/data
    ports:
      - 8384:8384
      - 22000:22000/tcp
      - 22000:22000/udp
    restart: unless-stopped
""",
    },
    {
        "id": "photoprism",
        "name": "PhotoPrism",
        "description": "AI-powered photo management — face recognition, geotagging, automatic categorisation, and Albums.",
        "category": "Storage",
        "icon": "camera",
        "ports": [2342],
        "requires_volumes": True,
        "ram_mb": 512,
        "notes": "Default login: admin / insecure. Index your library at http://pi:2342.",
        "compose": """\
services:
  photoprism:
    image: photoprism/photoprism:latest
    container_name: photoprism
    environment:
      - PHOTOPRISM_AUTH_MODE=password
      - PHOTOPRISM_ADMIN_USER=admin
      - PHOTOPRISM_ADMIN_PASSWORD=insecure
      - PHOTOPRISM_SITE_URL=http://localhost:2342/
    ports:
      - 2342:2342
    volumes:
      - /opt/sudo-pi/data/photoprism/originals:/photoprism/originals
      - /opt/sudo-pi/data/photoprism/storage:/photoprism/storage
    restart: unless-stopped
""",
    },
    {
        "id": "immich",
        "name": "Immich",
        "description": "High-performance self-hosted backup solution for photos and videos — Google Photos alternative.",
        "category": "Storage",
        "icon": "image",
        "ports": [2283],
        "requires_volumes": True,
        "ram_mb": 1024,
        "notes": "Create account on first visit at http://pi:2283. Requires machine learning for smart features.",
        "compose": """\
services:
  immich-server:
    image: ghcr.io/immich-app/immich-server:release
    container_name: immich_server
    ports:
      - 2283:3001
    environment:
      - DB_HOSTNAME=immich-postgres
      - DB_USERNAME=postgres
      - DB_PASSWORD=postgres
      - DB_DATABASE_NAME=immich
      - REDIS_HOSTNAME=immich-redis
    volumes:
      - /opt/sudo-pi/data/immich/upload:/usr/src/app/upload
    depends_on:
      - immich-redis
      - immich-postgres
    restart: unless-stopped
  immich-redis:
    image: redis:6.2-alpine
    container_name: immich_redis
    restart: unless-stopped
  immich-postgres:
    image: postgres:14-alpine
    container_name: immich_postgres
    environment:
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_USER=postgres
      - POSTGRES_DB=immich
    volumes:
      - /opt/sudo-pi/data/immich/postgres:/var/lib/postgresql/data
    restart: unless-stopped
""",
    },
    {
        "id": "paperless",
        "name": "Paperless-NGX",
        "description": "Scan, index and archive physical documents as searchable PDFs — go paperless with OCR.",
        "category": "Storage",
        "icon": "file-text",
        "ports": [8000],
        "requires_volumes": True,
        "ram_mb": 512,
        "notes": "Create superuser: docker exec -it paperless python manage.py createsuperuser",
        "compose": """\
services:
  paperless:
    image: ghcr.io/paperless-ngx/paperless-ngx:latest
    container_name: paperless
    ports:
      - 8000:8000
    environment:
      - PAPERLESS_REDIS=redis://paperless-redis:6379
      - PAPERLESS_DBHOST=paperless-db
      - PAPERLESS_SECRET_KEY=change-me-please
    volumes:
      - /opt/sudo-pi/data/paperless/data:/usr/src/paperless/data
      - /opt/sudo-pi/data/paperless/media:/usr/src/paperless/media
      - /opt/sudo-pi/data/paperless/consume:/usr/src/paperless/consume
    depends_on:
      - paperless-redis
      - paperless-db
    restart: unless-stopped
  paperless-redis:
    image: redis:7-alpine
    container_name: paperless_redis
    restart: unless-stopped
  paperless-db:
    image: postgres:15-alpine
    container_name: paperless_db
    environment:
      - POSTGRES_DB=paperless
      - POSTGRES_USER=paperless
      - POSTGRES_PASSWORD=paperless
    volumes:
      - /opt/sudo-pi/data/paperless/postgres:/var/lib/postgresql/data
    restart: unless-stopped
""",
    },

    # ── Media ──────────────────────────────────────────────────────────────────
    {
        "id": "jellyfin",
        "name": "Jellyfin",
        "description": "Free software media system that lets you manage and stream your personal media library.",
        "category": "Media",
        "icon": "tv",
        "ports": [8096],
        "requires_volumes": True,
        "ram_mb": 256,
        "notes": "Access at http://pi:8096 — complete setup wizard on first launch.",
        "compose": """\
services:
  jellyfin:
    image: lscr.io/linuxserver/jellyfin:latest
    container_name: jellyfin
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=UTC
    volumes:
      - /opt/sudo-pi/data/jellyfin/config:/config
      - /opt/sudo-pi/data/jellyfin/cache:/cache
      - /opt/sudo-pi/data/media:/data/media
    ports:
      - 8096:8096
    restart: unless-stopped
""",
    },
    {
        "id": "plex",
        "name": "Plex Media Server",
        "description": "Stream your movies, TV shows, and music anywhere. Discover and organize your media collection.",
        "category": "Media",
        "icon": "film",
        "ports": [32400],
        "requires_volumes": True,
        "ram_mb": 512,
        "notes": "Claim your server at http://pi:32400/web — requires Plex account for remote access.",
        "compose": """\
services:
  plex:
    image: lscr.io/linuxserver/plex:latest
    container_name: plex
    network_mode: host
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=UTC
      - VERSION=docker
    volumes:
      - /opt/sudo-pi/data/plex/config:/config
      - /opt/sudo-pi/data/media:/data/media
    restart: unless-stopped
""",
    },
    {
        "id": "navidrome",
        "name": "Navidrome",
        "description": "Modern music server and streamer compatible with Subsonic/Airsonic clients. Self-host your music.",
        "category": "Media",
        "icon": "music",
        "ports": [4533],
        "requires_volumes": True,
        "ram_mb": 128,
        "notes": "Create first user on http://pi:4533 — compatible with DSub, Ultrasonic, Symfonium.",
        "compose": """\
services:
  navidrome:
    image: deluan/navidrome:latest
    container_name: navidrome
    ports:
      - 4533:4533
    environment:
      - ND_SCANSCHEDULE=1h
      - ND_LOGLEVEL=info
      - ND_BASEURL=
    volumes:
      - /opt/sudo-pi/data/navidrome:/data
      - /opt/sudo-pi/data/music:/music:ro
    restart: unless-stopped
""",
    },
    {
        "id": "audiobookshelf",
        "name": "Audiobookshelf",
        "description": "Self-hosted audiobook and podcast server with mobile apps for iOS and Android.",
        "category": "Media",
        "icon": "headphones",
        "ports": [13378],
        "requires_volumes": True,
        "ram_mb": 128,
        "notes": "Web UI at http://pi:13378. Place audiobooks in /opt/sudo-pi/data/audiobooks.",
        "compose": """\
services:
  audiobookshelf:
    image: ghcr.io/advplyr/audiobookshelf:latest
    container_name: audiobookshelf
    ports:
      - 13378:80
    volumes:
      - /opt/sudo-pi/data/audiobookshelf/config:/config
      - /opt/sudo-pi/data/audiobookshelf/metadata:/metadata
      - /opt/sudo-pi/data/audiobooks:/audiobooks
      - /opt/sudo-pi/data/podcasts:/podcasts
    restart: unless-stopped
""",
    },
    {
        "id": "kavita",
        "name": "Kavita",
        "description": "Self-hosted digital library for manga, comics, and books. Beautiful reader with reading lists.",
        "category": "Media",
        "icon": "book-open",
        "ports": [5000],
        "requires_volumes": True,
        "ram_mb": 128,
        "notes": "Set up admin account at http://pi:5000. Place manga in /opt/sudo-pi/data/manga.",
        "compose": """\
services:
  kavita:
    image: jvmilazz0/kavita:latest
    container_name: kavita
    ports:
      - 5000:5000
    volumes:
      - /opt/sudo-pi/data/manga:/manga
      - /opt/sudo-pi/data/comics:/comics
      - /opt/sudo-pi/data/kavita/config:/kavita/config
    restart: unless-stopped
""",
    },
    {
        "id": "stump",
        "name": "Stump",
        "description": "Fast, lightweight comics, manga and book server with OPDS support and a beautiful web reader.",
        "category": "Media",
        "icon": "book-open",
        "ports": [10801],
        "requires_volumes": True,
        "ram_mb": 64,
        "notes": "Access at http://pi:10801 — OPDS compatible for e-readers.",
        "compose": """\
services:
  stump:
    image: aaronleopold/stump:nightly
    container_name: stump
    ports:
      - 10801:10801
    volumes:
      - /opt/sudo-pi/data/stump/config:/config
      - /opt/sudo-pi/data/comics:/data
    restart: unless-stopped
""",
    },

    # ── Network ────────────────────────────────────────────────────────────────
    {
        "id": "pihole",
        "name": "Pi-hole",
        "description": "Network-wide DNS ad blocker that blocks advertisements and trackers at the DNS level.",
        "category": "Network",
        "icon": "shield",
        "ports": [53, 8081],
        "requires_volumes": True,
        "ram_mb": 128,
        "notes": "Set your router's DNS to the Pi's IP. Web admin at http://pi:8081/admin",
        "compose": """\
services:
  pihole:
    image: pihole/pihole:latest
    container_name: pihole
    ports:
      - "53:53/tcp"
      - "53:53/udp"
      - "8081:80/tcp"
    environment:
      TZ: UTC
      WEBPASSWORD: changeme
    volumes:
      - /opt/sudo-pi/data/pihole/etc-pihole:/etc/pihole
      - /opt/sudo-pi/data/pihole/etc-dnsmasq.d:/etc/dnsmasq.d
    restart: unless-stopped
    cap_add:
      - NET_ADMIN
""",
    },
    {
        "id": "adguard",
        "name": "AdGuard Home",
        "description": "Network-wide ad and tracker blocker with parental controls, DNS-over-HTTPS, and statistics.",
        "category": "Network",
        "icon": "shield-check",
        "ports": [3010, 53],
        "requires_volumes": True,
        "ram_mb": 128,
        "notes": "Complete setup at http://pi:3010. Alternative to Pi-hole with more features.",
        "compose": """\
services:
  adguardhome:
    image: adguard/adguardhome:latest
    container_name: adguardhome
    ports:
      - "53:53/tcp"
      - "53:53/udp"
      - "3010:3000/tcp"
      - "3011:80/tcp"
    volumes:
      - /opt/sudo-pi/data/adguard/work:/opt/adguardhome/work
      - /opt/sudo-pi/data/adguard/conf:/opt/adguardhome/conf
    restart: unless-stopped
    cap_add:
      - NET_ADMIN
""",
    },
    {
        "id": "nginx-proxy-manager",
        "name": "Nginx Proxy Manager",
        "description": "Easy reverse proxy with SSL certificate management, custom domains, and an intuitive web UI.",
        "category": "Network",
        "icon": "arrow-left-right",
        "ports": [80, 443, 81],
        "requires_volumes": True,
        "ram_mb": 128,
        "notes": "Admin at http://pi:81 — default login: admin@example.com / changeme. Manages Let's Encrypt certs automatically.",
        "compose": """\
services:
  nginx-proxy-manager:
    image: jc21/nginx-proxy-manager:latest
    container_name: nginx-proxy-manager
    ports:
      - 80:80
      - 443:443
      - 81:81
    volumes:
      - /opt/sudo-pi/data/npm/data:/data
      - /opt/sudo-pi/data/npm/letsencrypt:/etc/letsencrypt
    restart: unless-stopped
""",
    },
    {
        "id": "uptime-kuma",
        "name": "Uptime Kuma",
        "description": "Self-hosted monitoring tool with a fancy UI for tracking uptime of your services.",
        "category": "Network",
        "icon": "activity",
        "ports": [3001],
        "requires_volumes": True,
        "ram_mb": 128,
        "notes": "Access at http://pi:3001 — create admin account on first visit.",
        "compose": """\
services:
  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: uptime-kuma
    ports:
      - 3001:3001
    volumes:
      - /opt/sudo-pi/data/uptime-kuma:/app/data
    restart: unless-stopped
""",
    },
    {
        "id": "wireguard-easy",
        "name": "WireGuard Easy",
        "description": "The easiest way to run WireGuard VPN — web UI to manage peers, QR codes, and download configs.",
        "category": "Network",
        "icon": "network",
        "ports": [51820, 51821],
        "requires_volumes": True,
        "ram_mb": 64,
        "notes": "Set WG_HOST to your public IP. Admin UI at http://pi:51821.",
        "compose": """\
services:
  wg-easy:
    image: ghcr.io/wg-easy/wg-easy:latest
    container_name: wg-easy
    environment:
      - WG_HOST=your.public.ip
      - PASSWORD=changeme
      - WG_PORT=51820
      - WG_DEFAULT_DNS=1.1.1.1
    volumes:
      - /opt/sudo-pi/data/wireguard:/etc/wireguard
    ports:
      - 51820:51820/udp
      - 51821:51821/tcp
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    sysctls:
      - net.ipv4.conf.all.src_valid_mark=1
      - net.ipv4.ip_forward=1
    restart: unless-stopped
""",
    },
    {
        "id": "homer",
        "name": "Homer",
        "description": "Beautifully simple static homepage for your self-hosted services — fully customizable via YAML.",
        "category": "Network",
        "icon": "layout-dashboard",
        "ports": [8090],
        "requires_volumes": True,
        "ram_mb": 16,
        "notes": "Edit /opt/sudo-pi/data/homer/config.yml to add your services.",
        "compose": """\
services:
  homer:
    image: b4bz/homer:latest
    container_name: homer
    ports:
      - 8090:8080
    volumes:
      - /opt/sudo-pi/data/homer:/www/assets
    restart: unless-stopped
    user: "1000:1000"
""",
    },
    {
        "id": "cloudflared",
        "name": "Cloudflare Tunnel",
        "description": "Expose local services to the internet without opening firewall ports using Cloudflare's secure tunnel.",
        "category": "Network",
        "icon": "cloud",
        "ports": [],
        "requires_volumes": False,
        "ram_mb": 64,
        "notes": "Get your token from Cloudflare Zero Trust dashboard → Tunnels → Create Tunnel.",
        "compose": """\
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    command: tunnel --no-autoupdate run --token YOUR_TOKEN_HERE
    restart: unless-stopped
""",
    },

    # ── Development ────────────────────────────────────────────────────────────
    {
        "id": "portainer",
        "name": "Portainer CE",
        "description": "Lightweight Docker management UI for managing containers, images, networks, and volumes.",
        "category": "Development",
        "icon": "layout-dashboard",
        "ports": [9000],
        "requires_volumes": True,
        "ram_mb": 64,
        "notes": "Create admin account on first visit at http://pi:9000",
        "compose": """\
services:
  portainer:
    image: portainer/portainer-ce:latest
    container_name: portainer
    ports:
      - 9000:9000
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /opt/sudo-pi/data/portainer:/data
    restart: unless-stopped
""",
    },
    {
        "id": "grafana",
        "name": "Grafana",
        "description": "Open source analytics and interactive visualization platform for metrics and logs.",
        "category": "Development",
        "icon": "bar-chart-2",
        "ports": [3000],
        "requires_volumes": True,
        "ram_mb": 256,
        "notes": "Default login: admin / admin. Change password on first login.",
        "compose": """\
services:
  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - 3000:3000
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - /opt/sudo-pi/data/grafana:/var/lib/grafana
    restart: unless-stopped
    user: "1000"
""",
    },
    {
        "id": "gitea",
        "name": "Gitea",
        "description": "Lightweight self-hosted Git service with web UI, issue tracker, and CI/CD support.",
        "category": "Development",
        "icon": "git-branch",
        "ports": [3002, 2222],
        "requires_volumes": True,
        "ram_mb": 128,
        "notes": "Web at http://pi:3002 — SSH clone on port 2222. Complete install wizard on first visit.",
        "compose": """\
services:
  gitea:
    image: gitea/gitea:latest
    container_name: gitea
    environment:
      - USER_UID=1000
      - USER_GID=1000
    ports:
      - 3002:3000
      - 2222:22
    volumes:
      - /opt/sudo-pi/data/gitea:/data
    restart: unless-stopped
""",
    },
    {
        "id": "code-server",
        "name": "VS Code Server",
        "description": "Full Visual Studio Code running in the browser — code, edit, and debug from any device.",
        "category": "Development",
        "icon": "code-2",
        "ports": [8443],
        "requires_volumes": True,
        "ram_mb": 512,
        "notes": "Access at http://pi:8443 — set a strong PASSWORD environment variable.",
        "compose": """\
services:
  code-server:
    image: lscr.io/linuxserver/code-server:latest
    container_name: code-server
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=UTC
      - PASSWORD=changeme
      - SUDO_PASSWORD=changeme
    volumes:
      - /opt/sudo-pi/data/code-server/config:/config
      - /opt/sudo-pi/data:/workspace
    ports:
      - 8443:8443
    restart: unless-stopped
""",
    },
    {
        "id": "prometheus",
        "name": "Prometheus",
        "description": "Time-series metrics collection and alerting system. Pairs perfectly with Grafana for dashboards.",
        "category": "Development",
        "icon": "gauge",
        "ports": [9090],
        "requires_volumes": True,
        "ram_mb": 256,
        "notes": "Access at http://pi:9090 — add targets in /opt/sudo-pi/data/prometheus/prometheus.yml",
        "compose": """\
services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    ports:
      - 9090:9090
    volumes:
      - /opt/sudo-pi/data/prometheus/config:/etc/prometheus
      - /opt/sudo-pi/data/prometheus/data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    restart: unless-stopped
    user: "1000:1000"
""",
    },
    {
        "id": "registry",
        "name": "Docker Registry",
        "description": "Private Docker image registry — store and distribute container images on your own infrastructure.",
        "category": "Development",
        "icon": "box",
        "ports": [5050],
        "requires_volumes": True,
        "ram_mb": 64,
        "notes": "Push images with: docker tag myimage pi:5050/myimage && docker push pi:5050/myimage",
        "compose": """\
services:
  registry:
    image: registry:2
    container_name: docker-registry
    ports:
      - 5050:5000
    volumes:
      - /opt/sudo-pi/data/registry:/var/lib/registry
    restart: unless-stopped
""",
    },

    # ── AI ─────────────────────────────────────────────────────────────────────
    {
        "id": "ollama",
        "name": "Ollama",
        "description": "Run large language models locally — Llama 3, Mistral, Gemma, Phi, and 100+ models offline.",
        "category": "AI",
        "icon": "brain",
        "ports": [11434],
        "requires_volumes": True,
        "ram_mb": 4096,
        "notes": "Pull models: docker exec -it ollama ollama pull llama3. Best with Pi 5 or 8 GB RAM.",
        "compose": """\
services:
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    ports:
      - 11434:11434
    volumes:
      - /opt/sudo-pi/data/ollama:/root/.ollama
    restart: unless-stopped
""",
    },
    {
        "id": "open-webui",
        "name": "Open WebUI",
        "description": "ChatGPT-like web interface for Ollama — chat history, image generation, RAG, and user management.",
        "category": "AI",
        "icon": "sparkles",
        "ports": [3030],
        "requires_volumes": True,
        "ram_mb": 256,
        "notes": "Requires Ollama running. Access at http://pi:3030 — install Ollama first.",
        "compose": """\
services:
  open-webui:
    image: ghcr.io/open-webui/open-webui:main
    container_name: open-webui
    ports:
      - 3030:8080
    environment:
      - OLLAMA_BASE_URL=http://ollama:11434
    volumes:
      - /opt/sudo-pi/data/open-webui:/app/backend/data
    restart: unless-stopped
""",
    },
    {
        "id": "localai",
        "name": "LocalAI",
        "description": "OpenAI-compatible local inference API — drop-in replacement for OpenAI with local models.",
        "category": "AI",
        "icon": "cpu",
        "ports": [8088],
        "requires_volumes": True,
        "ram_mb": 2048,
        "notes": "Compatible with any app that uses the OpenAI API. Models auto-download from Hugging Face.",
        "compose": """\
services:
  localai:
    image: localai/localai:latest-aio-cpu
    container_name: localai
    ports:
      - 8088:8080
    environment:
      - THREADS=4
      - CONTEXT_SIZE=512
    volumes:
      - /opt/sudo-pi/data/localai/models:/models
    restart: unless-stopped
""",
    },
    {
        "id": "whisper",
        "name": "Whisper API",
        "description": "OpenAI Whisper speech-to-text running locally — transcribe audio files via REST API.",
        "category": "AI",
        "icon": "mic",
        "ports": [9000],
        "requires_volumes": True,
        "ram_mb": 1024,
        "notes": "POST audio to http://pi:9000/asr. Supports mp3, wav, ogg. Small model runs on Pi 4.",
        "compose": """\
services:
  whisper:
    image: onerahmet/openai-whisper-asr-webservice:latest-cpu
    container_name: whisper
    ports:
      - 9000:9000
    environment:
      - ASR_MODEL=base
      - ASR_ENGINE=openai_whisper
    volumes:
      - /opt/sudo-pi/data/whisper:/root/.cache/whisper
    restart: unless-stopped
""",
    },

    # ── Productivity ───────────────────────────────────────────────────────────
    {
        "id": "bookstack",
        "name": "BookStack",
        "description": "Structured wiki and documentation platform with books, chapters, and pages hierarchy.",
        "category": "Productivity",
        "icon": "book",
        "ports": [6875],
        "requires_volumes": True,
        "ram_mb": 256,
        "notes": "Default login: admin@admin.com / password. Change immediately after first login.",
        "compose": """\
services:
  bookstack:
    image: lscr.io/linuxserver/bookstack:latest
    container_name: bookstack
    environment:
      - PUID=1000
      - PGID=1000
      - APP_URL=http://localhost:6875
      - DB_HOST=bookstack-db
      - DB_USER=bookstack
      - DB_PASS=bookstack
      - DB_DATABASE=bookstack
    volumes:
      - /opt/sudo-pi/data/bookstack/config:/config
    ports:
      - 6875:80
    depends_on:
      - bookstack-db
    restart: unless-stopped
  bookstack-db:
    image: lscr.io/linuxserver/mariadb:latest
    container_name: bookstack_db
    environment:
      - PUID=1000
      - PGID=1000
      - MYSQL_ROOT_PASSWORD=bookstack
      - MYSQL_DATABASE=bookstack
      - MYSQL_USER=bookstack
      - MYSQL_PASSWORD=bookstack
    volumes:
      - /opt/sudo-pi/data/bookstack/db:/config
    restart: unless-stopped
""",
    },
    {
        "id": "vikunja",
        "name": "Vikunja",
        "description": "Open-source task management — projects, kanban boards, Gantt charts, and team collaboration.",
        "category": "Productivity",
        "icon": "check-square",
        "ports": [3456],
        "requires_volumes": True,
        "ram_mb": 128,
        "notes": "Access at http://pi:3456 — create account on first visit.",
        "compose": """\
services:
  vikunja:
    image: vikunja/vikunja:latest
    container_name: vikunja
    ports:
      - 3456:3456
    environment:
      - VIKUNJA_DATABASE_TYPE=sqlite
      - VIKUNJA_SERVICE_JWTSECRET=change-me-random-string
    volumes:
      - /opt/sudo-pi/data/vikunja:/app/vikunja/files
    restart: unless-stopped
""",
    },
    {
        "id": "linkding",
        "name": "Linkding",
        "description": "Minimal bookmark manager with tagging, search, browser extension support, and sharing.",
        "category": "Productivity",
        "icon": "bookmark",
        "ports": [9090],
        "requires_volumes": True,
        "ram_mb": 64,
        "notes": "Create superuser: docker exec -it linkding python manage.py createsuperuser",
        "compose": """\
services:
  linkding:
    image: sissbruecker/linkding:latest
    container_name: linkding
    ports:
      - 9091:9090
    environment:
      - LD_SUPERUSER_NAME=admin
      - LD_SUPERUSER_PASSWORD=changeme
    volumes:
      - /opt/sudo-pi/data/linkding:/etc/linkding/data
    restart: unless-stopped
""",
    },
    {
        "id": "hedgedoc",
        "name": "HedgeDoc",
        "description": "Real-time collaborative markdown editor — write documents together with your team.",
        "category": "Productivity",
        "icon": "pen-line",
        "ports": [3003],
        "requires_volumes": True,
        "ram_mb": 256,
        "notes": "Access at http://pi:3003 — supports guest access and multiple auth providers.",
        "compose": """\
services:
  hedgedoc:
    image: quay.io/hedgedoc/hedgedoc:latest
    container_name: hedgedoc
    environment:
      - CMD_DB_URL=postgres://hedgedoc:hedgedoc@hedgedoc-db:5432/hedgedoc
      - CMD_DOMAIN=localhost
      - CMD_PORT=3003
      - CMD_ALLOW_ANONYMOUS=true
      - CMD_ALLOW_FREEURL=true
    volumes:
      - /opt/sudo-pi/data/hedgedoc/uploads:/hedgedoc/public/uploads
    ports:
      - 3003:3003
    depends_on:
      - hedgedoc-db
    restart: unless-stopped
  hedgedoc-db:
    image: postgres:13-alpine
    container_name: hedgedoc_db
    environment:
      - POSTGRES_USER=hedgedoc
      - POSTGRES_PASSWORD=hedgedoc
      - POSTGRES_DB=hedgedoc
    volumes:
      - /opt/sudo-pi/data/hedgedoc/db:/var/lib/postgresql/data
    restart: unless-stopped
""",
    },
    {
        "id": "freshrss",
        "name": "FreshRSS",
        "description": "Self-hosted RSS and Atom feed aggregator — read all your news in one place, ad-free.",
        "category": "Productivity",
        "icon": "rss",
        "ports": [8086],
        "requires_volumes": True,
        "ram_mb": 64,
        "notes": "Access at http://pi:8086 — complete setup wizard. Supports Fever and Google Reader APIs.",
        "compose": """\
services:
  freshrss:
    image: lscr.io/linuxserver/freshrss:latest
    container_name: freshrss
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=UTC
    volumes:
      - /opt/sudo-pi/data/freshrss/config:/config
    ports:
      - 8086:80
    restart: unless-stopped
""",
    },
    {
        "id": "wallabag",
        "name": "Wallabag",
        "description": "Self-hosted read-it-later app — save articles, read offline, with browser extension and mobile app.",
        "category": "Productivity",
        "icon": "archive",
        "ports": [8087],
        "requires_volumes": True,
        "ram_mb": 128,
        "notes": "Default login: wallabag / wallabag. Access at http://pi:8087.",
        "compose": """\
services:
  wallabag:
    image: wallabag/wallabag:latest
    container_name: wallabag
    environment:
      - MYSQL_ROOT_PASSWORD=wallaroot
      - SYMFONY__ENV__DATABASE_DRIVER=pdo_sqlite
      - SYMFONY__ENV__DOMAIN_NAME=http://localhost:8087
    volumes:
      - /opt/sudo-pi/data/wallabag/data:/var/www/wallabag/data
      - /opt/sudo-pi/data/wallabag/images:/var/www/wallabag/web/assets/images
    ports:
      - 8087:80
    restart: unless-stopped
""",
    },

    # ── Communication ──────────────────────────────────────────────────────────
    {
        "id": "ntfy",
        "name": "Ntfy",
        "description": "Simple HTTP-based pub-sub notification service — send push notifications from any script.",
        "category": "Communication",
        "icon": "bell-ring",
        "ports": [8088],
        "requires_volumes": True,
        "ram_mb": 32,
        "notes": "Publish: curl -d 'Hello!' http://pi:8088/mytopic — subscribe with the ntfy app.",
        "compose": """\
services:
  ntfy:
    image: binwiederhier/ntfy:latest
    container_name: ntfy
    command: serve
    ports:
      - 8088:80
    volumes:
      - /opt/sudo-pi/data/ntfy/cache:/var/cache/ntfy
      - /opt/sudo-pi/data/ntfy/etc:/etc/ntfy
    restart: unless-stopped
""",
    },
    {
        "id": "gotify",
        "name": "Gotify",
        "description": "Self-hosted server for sending and receiving push messages with an Android app and REST API.",
        "category": "Communication",
        "icon": "send",
        "ports": [8070],
        "requires_volumes": True,
        "ram_mb": 32,
        "notes": "Default login: admin / admin. Create app tokens in the web UI at http://pi:8070.",
        "compose": """\
services:
  gotify:
    image: gotify/server:latest
    container_name: gotify
    ports:
      - 8070:80
    environment:
      - GOTIFY_DEFAULTUSER_PASS=admin
    volumes:
      - /opt/sudo-pi/data/gotify:/app/data
    restart: unless-stopped
""",
    },
    {
        "id": "matrix-synapse",
        "name": "Matrix Synapse",
        "description": "Open-source, decentralized real-time messaging server. Use Element or any Matrix client to connect.",
        "category": "Communication",
        "icon": "message-circle",
        "ports": [8448],
        "requires_volumes": True,
        "ram_mb": 512,
        "notes": "Run: docker exec -it synapse register_new_matrix_user -u admin -p password -a -c /data/homeserver.yaml",
        "compose": """\
services:
  synapse:
    image: matrixdotorg/synapse:latest
    container_name: synapse
    environment:
      - SYNAPSE_SERVER_NAME=localhost
      - SYNAPSE_REPORT_STATS=no
    volumes:
      - /opt/sudo-pi/data/synapse:/data
    ports:
      - 8448:8008
    restart: unless-stopped
""",
    },
    {
        "id": "mattermost",
        "name": "Mattermost",
        "description": "Open-source Slack alternative — channels, direct messages, file sharing, and integrations.",
        "category": "Communication",
        "icon": "message-square",
        "ports": [8065],
        "requires_volumes": True,
        "ram_mb": 512,
        "notes": "Create first user at http://pi:8065 — that user becomes team admin.",
        "compose": """\
services:
  mattermost:
    image: mattermost/mattermost-team-edition:latest
    container_name: mattermost
    ports:
      - 8065:8065
    environment:
      - MM_SQLSETTINGS_DRIVERNAME=postgres
      - MM_SQLSETTINGS_DATASOURCE=postgres://mmuser:mmuser_password@mattermost-db:5432/mattermost?sslmode=disable
    volumes:
      - /opt/sudo-pi/data/mattermost/config:/mattermost/config
      - /opt/sudo-pi/data/mattermost/data:/mattermost/data
      - /opt/sudo-pi/data/mattermost/logs:/mattermost/logs
    depends_on:
      - mattermost-db
    restart: unless-stopped
  mattermost-db:
    image: postgres:13-alpine
    container_name: mattermost_db
    environment:
      - POSTGRES_USER=mmuser
      - POSTGRES_PASSWORD=mmuser_password
      - POSTGRES_DB=mattermost
    volumes:
      - /opt/sudo-pi/data/mattermost/postgres:/var/lib/postgresql/data
    restart: unless-stopped
""",
    },

    # ── Security ───────────────────────────────────────────────────────────────
    {
        "id": "vaultwarden",
        "name": "Vaultwarden",
        "description": "Unofficial Bitwarden-compatible server in Rust. Self-host your password manager.",
        "category": "Security",
        "icon": "lock",
        "ports": [8082],
        "requires_volumes": True,
        "ram_mb": 64,
        "notes": "Compatible with all Bitwarden clients. Admin token required for /admin panel.",
        "compose": """\
services:
  vaultwarden:
    image: vaultwarden/server:latest
    container_name: vaultwarden
    ports:
      - 8082:80
    environment:
      - WEBSOCKET_ENABLED=true
      - SIGNUPS_ALLOWED=true
    volumes:
      - /opt/sudo-pi/data/vaultwarden:/data
    restart: unless-stopped
""",
    },
    {
        "id": "authelia",
        "name": "Authelia",
        "description": "Single Sign-On and 2FA authentication server — protect your self-hosted services with SSO.",
        "category": "Security",
        "icon": "user-check",
        "ports": [9091],
        "requires_volumes": True,
        "ram_mb": 128,
        "notes": "Requires reverse proxy (Nginx/Traefik). Configure authelia.yml with your domain and rules.",
        "compose": """\
services:
  authelia:
    image: authelia/authelia:latest
    container_name: authelia
    ports:
      - 9092:9091
    volumes:
      - /opt/sudo-pi/data/authelia:/config
    restart: unless-stopped
""",
    },
    {
        "id": "keycloak",
        "name": "Keycloak",
        "description": "Enterprise-grade identity and access management — OAuth2, OpenID Connect, LDAP, and SAML.",
        "category": "Security",
        "icon": "key",
        "ports": [8180],
        "requires_volumes": True,
        "ram_mb": 512,
        "notes": "Admin console at http://pi:8180/admin — default: admin / admin. Change immediately.",
        "compose": """\
services:
  keycloak:
    image: quay.io/keycloak/keycloak:latest
    container_name: keycloak
    command: start-dev
    environment:
      - KEYCLOAK_ADMIN=admin
      - KEYCLOAK_ADMIN_PASSWORD=admin
    ports:
      - 8180:8080
    volumes:
      - /opt/sudo-pi/data/keycloak:/opt/keycloak/data
    restart: unless-stopped
""",
    },
    {
        "id": "wazuh",
        "name": "Wazuh",
        "description": "Open-source XDR and SIEM — host intrusion detection, log analysis, and vulnerability scanning.",
        "category": "Security",
        "icon": "shield-check",
        "ports": [1514, 1515, 55000, 9200],
        "requires_volumes": True,
        "ram_mb": 2048,
        "notes": "Requires at least 4 GB RAM. Dashboard at https://pi:443 — admin / SecretPassword.",
        "compose": """\
services:
  wazuh-manager:
    image: wazuh/wazuh-manager:4.7.0
    container_name: wazuh_manager
    ports:
      - 1514:1514
      - 1515:1515
      - 55000:55000
    volumes:
      - /opt/sudo-pi/data/wazuh/manager/api:/var/ossec/api/configuration
      - /opt/sudo-pi/data/wazuh/manager/etc:/var/ossec/etc
      - /opt/sudo-pi/data/wazuh/manager/logs:/var/ossec/logs
      - /opt/sudo-pi/data/wazuh/manager/queue:/var/ossec/queue
    restart: unless-stopped
""",
    },

    # ── Monitoring ─────────────────────────────────────────────────────────────
    {
        "id": "dozzle",
        "name": "Dozzle",
        "description": "Real-time Docker log viewer in the browser — tail logs from all containers with fuzzy search.",
        "category": "Monitoring",
        "icon": "eye",
        "ports": [8080],
        "requires_volumes": False,
        "ram_mb": 16,
        "notes": "Access at http://pi:8089 — no configuration needed, auto-discovers Docker containers.",
        "compose": """\
services:
  dozzle:
    image: amir20/dozzle:latest
    container_name: dozzle
    ports:
      - 8089:8080
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    restart: unless-stopped
""",
    },
    {
        "id": "netdata",
        "name": "Netdata",
        "description": "Real-time performance monitoring with 2,000+ metrics, zero configuration, and beautiful charts.",
        "category": "Monitoring",
        "icon": "activity",
        "ports": [19999],
        "requires_volumes": True,
        "ram_mb": 256,
        "notes": "Access at http://pi:19999 — no login required by default. Monitors system and Docker.",
        "compose": """\
services:
  netdata:
    image: netdata/netdata:latest
    container_name: netdata
    pid: host
    network_mode: host
    cap_add:
      - SYS_PTRACE
      - SYS_ADMIN
    security_opt:
      - apparmor:unconfined
    volumes:
      - /opt/sudo-pi/data/netdata/config:/etc/netdata
      - netdata-lib:/var/lib/netdata
      - netdata-cache:/var/cache/netdata
      - /etc/passwd:/host/etc/passwd:ro
      - /etc/group:/host/etc/group:ro
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /etc/os-release:/host/etc/os-release:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    restart: unless-stopped
volumes:
  netdata-lib:
  netdata-cache:
""",
    },
    {
        "id": "scrutiny",
        "name": "Scrutiny",
        "description": "Hard drive health monitoring via S.M.A.R.T. with web UI and historical failure tracking.",
        "category": "Monitoring",
        "icon": "hard-drive",
        "ports": [8080],
        "requires_volumes": True,
        "ram_mb": 64,
        "notes": "Access at http://pi:8079. Runs smartmontools to collect disk health data.",
        "compose": """\
services:
  scrutiny:
    image: ghcr.io/analogj/scrutiny:master-omnibus
    container_name: scrutiny
    ports:
      - 8079:8080
    cap_add:
      - SYS_RAWIO
    volumes:
      - /run/udev:/run/udev:ro
      - /opt/sudo-pi/data/scrutiny/config:/opt/scrutiny/config
      - /opt/sudo-pi/data/scrutiny/influxdb:/opt/scrutiny/influxdb
    devices:
      - /dev/sda:/dev/sda
    restart: unless-stopped
""",
    },
    {
        "id": "loki",
        "name": "Grafana Loki",
        "description": "Log aggregation system from Grafana Labs — collect, store and query logs like Prometheus.",
        "category": "Monitoring",
        "icon": "scroll-text",
        "ports": [3100],
        "requires_volumes": True,
        "ram_mb": 256,
        "notes": "Pairs with Promtail (log shipper) and Grafana. Add as data source in Grafana with URL http://loki:3100.",
        "compose": """\
services:
  loki:
    image: grafana/loki:latest
    container_name: loki
    ports:
      - 3100:3100
    volumes:
      - /opt/sudo-pi/data/loki:/loki
    command: -config.file=/etc/loki/local-config.yaml
    restart: unless-stopped
  promtail:
    image: grafana/promtail:latest
    container_name: promtail
    volumes:
      - /var/log:/var/log:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - /opt/sudo-pi/data/promtail/config:/etc/promtail
    command: -config.file=/etc/promtail/config.yml
    restart: unless-stopped
""",
    },
    {
        "id": "glances",
        "name": "Glances",
        "description": "Cross-platform system monitoring tool with web UI — CPU, RAM, disk, network, and Docker stats.",
        "category": "Monitoring",
        "icon": "monitor",
        "ports": [61208],
        "requires_volumes": False,
        "ram_mb": 64,
        "notes": "Access at http://pi:61208 — no login required. Shows system and Docker container stats.",
        "compose": """\
services:
  glances:
    image: nicolargo/glances:latest-full
    container_name: glances
    pid: host
    ports:
      - 61208:61208
    environment:
      - GLANCES_OPT=-w
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    restart: unless-stopped
""",
    },

    # ── IoT ────────────────────────────────────────────────────────────────────
    {
        "id": "homeassistant",
        "name": "Home Assistant",
        "description": "Open source home automation platform that puts local control and privacy first.",
        "category": "IoT",
        "icon": "home",
        "ports": [8123],
        "requires_volumes": True,
        "ram_mb": 512,
        "notes": "Access at http://pi:8123 — uses host network for device discovery.",
        "compose": """\
services:
  homeassistant:
    image: homeassistant/home-assistant:stable
    container_name: homeassistant
    network_mode: host
    environment:
      - TZ=UTC
    volumes:
      - /opt/sudo-pi/data/homeassistant:/config
    restart: unless-stopped
    privileged: true
""",
    },
    {
        "id": "node-red",
        "name": "Node-RED",
        "description": "Flow-based programming tool for wiring together hardware devices, APIs, and online services.",
        "category": "IoT",
        "icon": "workflow",
        "ports": [1880],
        "requires_volumes": True,
        "ram_mb": 128,
        "notes": "Access at http://pi:1880 — drag-and-drop flow editor for automation workflows.",
        "compose": """\
services:
  node-red:
    image: nodered/node-red:latest
    container_name: node-red
    ports:
      - 1880:1880
    environment:
      - TZ=UTC
    volumes:
      - /opt/sudo-pi/data/node-red:/data
    restart: unless-stopped
    user: "1000:1000"
""",
    },
    {
        "id": "mosquitto",
        "name": "Mosquitto MQTT",
        "description": "Lightweight MQTT broker for IoT — connect smart devices, sensors, and home automation hubs.",
        "category": "IoT",
        "icon": "radio",
        "ports": [1883, 9001],
        "requires_volumes": True,
        "ram_mb": 32,
        "notes": "MQTT on port 1883, WebSocket on 9001. Subscribe: mosquitto_sub -h pi -t '#'",
        "compose": """\
services:
  mosquitto:
    image: eclipse-mosquitto:latest
    container_name: mosquitto
    ports:
      - 1883:1883
      - 9001:9001
    volumes:
      - /opt/sudo-pi/data/mosquitto/config:/mosquitto/config
      - /opt/sudo-pi/data/mosquitto/data:/mosquitto/data
      - /opt/sudo-pi/data/mosquitto/log:/mosquitto/log
    restart: unless-stopped
""",
    },
    {
        "id": "zigbee2mqtt",
        "name": "Zigbee2MQTT",
        "description": "Bridges your Zigbee devices to MQTT — 2000+ supported Zigbee devices from 400+ vendors.",
        "category": "IoT",
        "icon": "zap",
        "ports": [8099],
        "requires_volumes": True,
        "ram_mb": 128,
        "notes": "Requires a Zigbee USB adapter (e.g. CC2531, Sonoff Zigbee 3.0). Edit configuration.yaml first.",
        "compose": """\
services:
  zigbee2mqtt:
    image: koenkk/zigbee2mqtt:latest
    container_name: zigbee2mqtt
    ports:
      - 8099:8080
    volumes:
      - /opt/sudo-pi/data/zigbee2mqtt:/app/data
      - /run/udev:/run/udev:ro
    environment:
      - TZ=UTC
    devices:
      - /dev/ttyACM0:/dev/ttyACM0
    restart: unless-stopped
    privileged: true
""",
    },
    {
        "id": "esphome",
        "name": "ESPHome",
        "description": "Configure ESP8266/ESP32 firmware via YAML — OTA updates, sensors, switches, and Home Assistant integration.",
        "category": "IoT",
        "icon": "cpu",
        "ports": [6052],
        "requires_volumes": True,
        "ram_mb": 256,
        "notes": "Access at http://pi:6052. Create YAML configs and flash directly from the web UI.",
        "compose": """\
services:
  esphome:
    image: esphome/esphome:latest
    container_name: esphome
    network_mode: host
    volumes:
      - /opt/sudo-pi/data/esphome:/config
    restart: unless-stopped
""",
    },
    {
        "id": "grocy",
        "name": "Grocy",
        "description": "ERP for your home — groceries, household chores, inventory, and recipe management.",
        "category": "IoT",
        "icon": "shopping-cart",
        "ports": [9283],
        "requires_volumes": True,
        "ram_mb": 64,
        "notes": "Access at http://pi:9283 — no login needed by default. Great for managing your home inventory.",
        "compose": """\
services:
  grocy:
    image: lscr.io/linuxserver/grocy:latest
    container_name: grocy
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=UTC
    volumes:
      - /opt/sudo-pi/data/grocy:/config
    ports:
      - 9283:80
    restart: unless-stopped
""",
    },

    # ── Games ──────────────────────────────────────────────────────────────────
    {
        "id": "minecraft-java",
        "name": "Minecraft Java Server",
        "description": "Run your own Minecraft Java Edition server — customizable with plugins, mods, and world settings.",
        "category": "Games",
        "icon": "gamepad-2",
        "ports": [25565],
        "requires_volumes": True,
        "ram_mb": 2048,
        "notes": "Accepts EULA by default. Add players to whitelist.json. Connect with localhost:25565.",
        "compose": """\
services:
  minecraft:
    image: itzg/minecraft-server:latest
    container_name: minecraft
    ports:
      - 25565:25565
    environment:
      - EULA=TRUE
      - MEMORY=1G
      - TYPE=PAPER
      - VERSION=LATEST
      - MOTD=Sudo-Pi Minecraft Server
    volumes:
      - /opt/sudo-pi/data/minecraft:/data
    restart: unless-stopped
""",
    },
    {
        "id": "terraria",
        "name": "Terraria Server",
        "description": "Host your own Terraria world — adventure, dig, build, and fight with friends on your own server.",
        "category": "Games",
        "icon": "swords",
        "ports": [7777],
        "requires_volumes": True,
        "ram_mb": 512,
        "notes": "Place world file in /opt/sudo-pi/data/terraria and set WORLD env var to the filename.",
        "compose": """\
services:
  terraria:
    image: ryshe/terraria:latest
    container_name: terraria
    ports:
      - 7777:7777
    environment:
      - WORLD=world.wld
      - MAXPLAYERS=8
      - PASS=changeme
    volumes:
      - /opt/sudo-pi/data/terraria:/world
    restart: unless-stopped
    stdin_open: true
    tty: true
""",
    },
    {
        "id": "factorio",
        "name": "Factorio Server",
        "description": "Run a private Factorio multiplayer server — build factories and automate production with friends.",
        "category": "Games",
        "icon": "wrench",
        "ports": [34197],
        "requires_volumes": True,
        "ram_mb": 512,
        "notes": "Server saves in /opt/sudo-pi/data/factorio/saves — first run generates a new map.",
        "compose": """\
services:
  factorio:
    image: factoriotools/factorio:latest
    container_name: factorio
    ports:
      - 34197:34197/udp
    volumes:
      - /opt/sudo-pi/data/factorio:/factorio
    restart: unless-stopped
""",
    },
    {
        "id": "valheim",
        "name": "Valheim Server",
        "description": "Host a Valheim dedicated server — survive, explore, and build with friends in the Norse world.",
        "category": "Games",
        "icon": "swords",
        "ports": [2456, 2457, 2458],
        "requires_volumes": True,
        "ram_mb": 2048,
        "notes": "Set SERVER_NAME and SERVER_PASS. Takes 5+ minutes to start on first run.",
        "compose": """\
services:
  valheim:
    image: lloesche/valheim-server:latest
    container_name: valheim
    ports:
      - 2456-2458:2456-2458/udp
    environment:
      - SERVER_NAME=Sudo-Pi Valheim
      - WORLD_NAME=MyWorld
      - SERVER_PASS=changeme
    volumes:
      - /opt/sudo-pi/data/valheim/config:/config
      - /opt/sudo-pi/data/valheim/data:/opt/valheim
    restart: unless-stopped
""",
    },
]

_CATALOG_BY_ID: dict[str, dict] = {app["id"]: app for app in APP_CATALOG}


def _is_installed(app_id: str) -> bool:
    stack_dir = COMPOSE_DIR / app_id
    return stack_dir.exists() and (stack_dir / "docker-compose.yml").exists()


async def list_apps() -> list[dict]:
    COMPOSE_DIR.mkdir(parents=True, exist_ok=True)
    result: list[dict] = []
    for app in APP_CATALOG:
        entry = {k: v for k, v in app.items() if k != "compose"}
        entry["installed"] = _is_installed(app["id"])
        result.append(entry)
    return result


async def get_app(app_id: str) -> dict:
    app = _CATALOG_BY_ID.get(app_id)
    if app is None:
        raise ValueError(f"App {app_id!r} not found in catalog")
    entry = {k: v for k, v in app.items() if k != "compose"}
    entry["installed"] = _is_installed(app_id)
    return entry


async def install_app(app_id: str) -> dict:
    app = _CATALOG_BY_ID.get(app_id)
    if app is None:
        raise ValueError(f"App {app_id!r} not found in catalog")
    if _is_installed(app_id):
        raise ValueError(f"App {app_id!r} is already installed")

    await compose_service.create_stack(app_id, app["compose"])
    result = await compose_service.start_stack(app_id)
    return {
        "app_id": app_id,
        "name": app["name"],
        "installed": True,
        "output": result.get("output", ""),
    }


async def uninstall_app(app_id: str, remove_data: bool = False) -> dict:
    app = _CATALOG_BY_ID.get(app_id)
    if app is None:
        raise ValueError(f"App {app_id!r} not found in catalog")
    if not _is_installed(app_id):
        raise ValueError(f"App {app_id!r} is not installed")

    result = await compose_service.remove_stack(app_id, remove_volumes=remove_data)
    return {
        "app_id": app_id,
        "name": app["name"],
        "installed": False,
        "output": result.get("output", ""),
    }
