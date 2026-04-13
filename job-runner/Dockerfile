FROM node:22-alpine
WORKDIR /app

# Install job-runner dependencies
COPY job-runner/package.json job-runner/package-lock.json* ./job-runner/
RUN cd job-runner && npm install

# Copy shared source (lib/) and root tsconfig (for @/* path alias resolution)
COPY tsconfig.json ./
COPY lib/ ./lib/
COPY job-runner/ ./job-runner/

# tsx handles runtime TypeScript — run tsc --noEmit in CI for type checking
CMD ["job-runner/node_modules/.bin/tsx", "--tsconfig", "job-runner/tsconfig.json", "job-runner/index.ts"]
