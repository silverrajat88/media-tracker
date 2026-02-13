.PHONY: all install build start dev clean

# Default target: install dependencies, build frontend, and start server
all: install build start

# Install dependencies for both client and server
install:
	@echo "📦 Installing server dependencies..."
	cd server && npm install
	@echo "📦 Installing client dependencies..."
	cd client && npm install

# Build the React frontend
build:
	@echo "🏗️  Building frontend..."
	cd client && npm run build

# Start the Express server (which serves the built frontend)
start:
	@echo "🚀 Starting Media Tracker..."
	cd server && npm run dev

# Run in development mode (if you want to run client/server separately, though server serves client/dist now)
dev:
	@echo "⚠️  Note: The server now serves the client build. For hot-reloading, run 'npm run dev' in client/ separately."
	cd server && npm run dev

# Clean node_modules and build artifacts
clean:
	@echo "🧹 Cleaning up..."
	rm -rf server/node_modules client/node_modules client/dist
