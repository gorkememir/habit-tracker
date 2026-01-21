# Habit Tracker

A simple habit tracking web application built with Node.js, Express, PostgreSQL, and deployed on Kubernetes with GitOps using ArgoCD.

## Features

- ✅ Add and track daily habits
- 🗑️ Delete habits
- 📊 View all habits with timestamps
- 🌓 Dark mode support
- 📤 Export habits to CSV
- 🔄 Self-healing database schema
- 🚀 Automated CI/CD with semantic versioning
- 🎯 GitOps deployment via ArgoCD

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: PostgreSQL
- **Frontend**: EJS templates
- **Containerization**: Docker
- **Orchestration**: Kubernetes
- **CI/CD**: GitHub Actions + ArgoCD (GitOps)
- **Infrastructure**: Proxmox
- **Registry**: Docker Hub

## Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL

### Setup

1. Clone the repository:
```bash
git clone https://github.com/gorkememir/habit-tracker.git
cd habit-tracker
```

2. Install dependencies:
```bash
npm install
```

3. Configure PostgreSQL connection in [app.js](app.js):
```javascript
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'habitdb',
  password: 'your_password',
  port: 5432,
});
```

4. Run the app:
```bash
node app.js
```

5. Open http://localhost:8080

## Docker

Build and run with Docker:

```bash
docker build -t gorkememir/habit-tracker:latest .
docker run -p 8080:8080 habit-tracker
```

Push to Docker Hub:
```bash
docker push gorkememir/habit-tracker:latest
```

## Kubernetes Deployment

### Prerequisites
- Kubernetes cluster (self-hosted on Proxmox)
- ArgoCD installed
- Docker Hub credentials configured in GitHub Secrets

### CI/CD Pipeline

The project uses a GitOps workflow with semantic versioning:

1. **Developer pushes to `main` branch**
2. **GitHub Actions workflow triggers:**
   - Builds Docker image with commit SHA tag
   - Pushes to Docker Hub
   - Determines semantic version from commit message:
     - `feat:` → minor bump (v1.1.0)
     - `fix:` → patch bump (v1.0.1)
     - `feat!:` or `BREAKING CHANGE:` → major bump (v2.0.0)
   - Updates manifest in `release` branch with new image
   - Creates version tag (e.g., v1.2.3)
3. **ArgoCD watches `release` branch**
   - Auto-syncs changes to Kubernetes (30s interval)
   - Deploys new version to cluster

### Manual Deployment

1. Create namespace:
```bash
kubectl create namespace habit-tracker
```

2. Apply PostgreSQL:
```bash
kubectl apply -f k8s/postgres.yml
```

3. Apply application:
```bash
kubectl apply -f k8s/habit-app.yml
```

4. Access the app:
```
http://<NODE_IP>:30007
```

### ArgoCD Deployment (Automated)

1. Install ArgoCD in your cluster:
```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

2. Apply the ArgoCD application:
```bash
kubectl apply -f k8s/argocd-app.yaml
```

3. ArgoCD will automatically:
   - Monitor the `release` branch
   - Sync changes to the cluster every 30 seconds
   - Self-heal any configuration drift
   - Prune deleted resources

## Architecture

```
┌─────────────┐
│   ArgoCD    │ ─── Monitors GitHub repo
└─────────────┘
       │
       ▼
┌─────────────────────────────┐
│      Kubernetes Cluster     │
│  ┌─────────────────────┐   │
│  │  habit-tracker      │   │
│  │  (2 replicas)       │   │
│  └─────────────────────┘   │
│           │                  │
│  ┌─────────────────────┐   │
│  │   PostgreSQL DB     │   │
│  └─────────────────────┘   │
└─────────────────────────────┘
```

## Project Structure

```
habit-tracker/
├── app.js                 # Main application
├── Dockerfile            # Container image definition
├── package.json          # Node.js dependencies
├── views/                # EJS templates
├── k8s/                  # Kubernetes manifests
│   └── habit-app.yml    # Deployment & Service
└── argocd-app.yaml      # ArgoCD application config
```

## Environment

- **Kubernetes**: Self-hosted on Proxmox
- **Docker Registry**: Docker Hub (gorkememir/habit-tracker)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to GitHub
5. ArgoCD automatically deploys to cluster

## License

MIT
