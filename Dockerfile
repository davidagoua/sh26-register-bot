# Utiliser une image de Node.js officielle stable
FROM node:20-slim

# Installer manuellement les dépendances nécessaires à Chromium pour tourner sur Linux
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Définir une variable d'environnement pour indiquer à Puppeteer d'utiliser le Chromium installé par le système
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Définir le dossier de travail dans le conteneur
WORKDIR /app

# Copier d'abord les fichiers de dépendances pour bénéficier du cache Docker
COPY package*.json ./

# Installer les dépendances Node.js
RUN npm install

# Copier le reste du code de l'application
COPY . .

# Créer les dossiers de stockage si pas déjà présents (facultatif mais recommandé)
RUN mkdir -p inscriptions_photos inscriptions_pdf .wwebjs_auth

# Lancer l'application
CMD ["node", "bot.js"]