# Habit Tracker

A habit tracking web application built with Node.js, Express, PostgreSQL, and deployed on Kubernetes with GitOps using ArgoCD.

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
┌──────────────────────────────────────────────────┐
│              GitHub Repository                    │
│  ┌──────────┐              ┌────────────┐       │
│  │   main   │              │  release   │       │
│  └────┬─────┘              └─────▲──────┘       │
│       │                           │              │
└───────┼───────────────────────────┼──────────────┘
        │                           │
        ▼                           │
┌─────────────────┐                 │
│ GitHub Actions  │─────────────────┘
│ • Build Docker  │
│ • Push to Hub   │
│ • Semantic Ver  │
│ • Update K8s    │
└─────────────────┘
                                    
┌───────────────────────────────────────────┐
│            Kubernetes Cluster             │
│                                           │
│  ┌─────────────┐                         │
│  │   ArgoCD    │ ← Watches release branch│
│  └──────┬──────┘                         │
│         │ (syncs every 30s)              │
│         ▼                                 │
│  ┌──────────────────────┐                │
│  │  habit-tracker-app   │                │
│  │    (2 replicas)      │                │
│  │  NodePort: 30007     │                │
│  └──────────┬───────────┘                │
│             │                             │
│  ┌──────────▼───────────┐                │
│  │   PostgreSQL DB      │                │
│  │   (StatefulSet)      │                │
│  └──────────────────────┘                │
└───────────────────────────────────────────┘
```

## GitOps Workflow

```
Developer                GitHub Actions           ArgoCD              Kubernetes
    │                          │                     │                     │
    │ git push main           │                     │                     │
    ├─────────────────────────>│                     │                     │
    │                          │ Build & Push        │                     │
    │                          │ Docker Image        │                     │
    │                          ├──────────>          │                     │
    │                          │                     │                     │
    │                          │ Create version tag  │                     │
    │                          │ (v1.2.3)           │                     │
    │                          │                     │                     │
    │                          │ Update manifest     │                     │
    │                          │ Push to release     │                     │
    │                          ├────────────────────>│                     │
    │                          │                     │                     │
    │                          │                     │ Detect change       │
    │                          │                     │ (30s poll)          │
    │                          │                     │                     │
    │                          │                     │ Sync & Deploy       │
    │                          │                     ├────────────────────>│
    │                          │                     │                     │
    │<──────────────────────────────────────────────┴─────────────────────┤
    │                    App deployed with new version                     │
```

## Project Structure

```
habit-tracker/
├── .github/
│   └── workflows/
│       └── deploy.yml        # CI/CD pipeline with semantic versioning
├── app.js                    # Main application
├── Dockerfile                # Container image definition
├── package.json              # Node.js dependencies
├── views/
│   └── index.ejs            # Frontend template with dark mode
├── k8s/
│   ├── habit-app.yml        # App Deployment & Service
│   ├── postgres.yml         # PostgreSQL StatefulSet
│   └── argocd-app.yaml      # ArgoCD application config
└── README.md                 # This file
```

## Configuration

### GitHub Secrets Required
- `DOCKERHUB_USERNAME`: Docker Hub username
- `DOCKERHUB_TOKEN`: Docker Hub access token
- `GITHUB_TOKEN`: Auto-provided by GitHub Actions

### Commit Message Convention

Use conventional commits for automatic semantic versioning:

- `feat: add new feature` → Minor version bump (v1.1.0)
- `fix: resolve bug` → Patch version bump (v1.0.1)  
- `feat!: breaking change` → Major version bump (v2.0.0)
- `docs: update readme` → Patch version bump (v1.0.1)
- `BREAKING CHANGE:` in body → Major version bump (v2.0.0)

## Environment

- **Kubernetes**: Self-hosted on Proxmox
- **Docker Registry**: Docker Hub (gorkememir/habit-tracker)
- **Branches**: 
  - `main`: Development branch
  - `release`: Production branch (watched by ArgoCD)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes using conventional commits
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request to `main`
6. After merge, GitHub Actions will:
   - Build and push Docker image
   - Create semantic version tag
   - Update `release` branch
   - ArgoCD automatically deploys to cluster

## License

MIT
