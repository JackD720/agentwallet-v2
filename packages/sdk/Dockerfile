FROM node:18-slim

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code
COPY src ./src

# Expose port
EXPOSE 8080

# Set environment variable for port
ENV PORT=8080

# Run the application
CMD ["node", "src/index.js"]
