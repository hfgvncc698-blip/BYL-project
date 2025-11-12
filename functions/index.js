# /etc/nginx/sites-available/byl
# =========================================
# BoostYourLife — Nginx (HTTPS + SPA + API)
# =========================================

# -------- HTTP -> HTTPS redirect ----------
server {
  listen 80;
  server_name boostyourlife.coach www.boostyourlife.coach;
  return 301 https://$host$request_uri;
}

# ---------------- HTTPS (+ API) -----------
server {
  listen 443 ssl http2;
  server_name boostyourlife.coach www.boostyourlife.coach;

  # -- Certificats (Let’s Encrypt)
  ssl_certificate     /etc/letsencrypt/live/boostyourlife.coach/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/boostyourlife.coach/privkey.pem;

  # -- TLS conseillé
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_prefer_server_ciphers on;

  # -- Dossier du site (index.html, assets, robots, sitemap…)
  #   ⚠️ adapte si ton build est ailleurs
  root /var/www/byl-dist;
  index index.html;

  # -- MIME types (inclut xml et octet-stream pour sitemap)
  include /etc/nginx/mime.types;
  default_type application/octet-stream;

  # -- Taille max payloads (uploads)
  client_max_body_size 10m;

  # -- Timeouts raisonnables
  proxy_connect_timeout 5s;
  proxy_send_timeout    180s;
  proxy_read_timeout    180s;

  # -------------- API -> backend Node/PM2 ----------------
  # IMPORTANT : ce bloc doit être AVANT le fallback SPA
  location ^~ /api/ {

    # --- CORS: préflight rapide si besoin (OPTIONS)
    if ($request_method = OPTIONS) {
      add_header 'Access-Control-Allow-Origin'  $http_origin    always;
      add_header 'Access-Control-Allow-Credentials' 'true'       always;
      add_header 'Access-Control-Allow-Methods' 'GET,POST,PUT,PATCH,DELETE,OPTIONS' always;
      add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Requested-With' always;
      add_header 'Access-Control-Max-Age' '1728000'             always;
      add_header 'Content-Type' 'text/plain; charset=utf-8'     always;
      add_header 'Content-Length' 0                             always;
      return 204;
    }

    # Laisse aussi passer l’en-tête CORS sur réponses normales
    add_header 'Access-Control-Allow-Origin'  $http_origin    always;
    add_header 'Access-Control-Allow-Credentials' 'true'       always;

    proxy_pass         http://localhost:5000;
    proxy_http_version 1.1;

    # headers utiles
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # websockets / keep-alive
    proxy_set_header Upgrade           $http_upgrade;
    proxy_set_header Connection        "upgrade";
  }

  # robots.txt tel quel
  location = /robots.txt {
    try_files /robots.txt =404;
    types { }
    default_type text/plain;
    add_header Content-Type "text/plain; charset=utf-8";
  }

  # sitemap.xml tel quel
  location = /sitemap.xml {
    try_files /sitemap.xml =404;
    types { }
    default_type application/xml;
    add_header Content-Type "application/xml; charset=utf-8";
  }

  # Cache light pour assets fingerprintés (vite: /assets/*.js|css|…)
  location ~* ^/.+\.(?:css|js|gif|jpe?g|png|svg|webp|woff2?)$ {
    expires 7d;
    add_header Cache-Control "public";
    access_log off;
    try_files $uri =404;
  }

  # -------------- Fallback SPA (React/Vite) ---------------
  # A placer EN DERNIER
  location / {
    try_files $uri $uri/ /index.html;
  }

  # (facultatif) pages d’erreur
  error_page 500 502 503 504 /50x.html;
}

