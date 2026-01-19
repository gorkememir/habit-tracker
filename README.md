# Habit Tracker

A simple habit tracking web application built with Node.js, Express, PostgreSQL, and deployed on Kubernetes with ArgoCD.

## Features

- ✅ Add and track daily habits
- 🗑️ Delete habits
- 📊 View all habits with timestamps
- 🔄 Self-healing database schema
- 🚀 Auto-deployed via ArgoCD

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: PostgreSQL
- **Frontend**: EJS templates
- **Containerization**: Docker
- **Orchestration**: Kubernetes
- **CI/CD**: ArgoCD
- **Infrastructure**: Proxmox

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

### Manual Deployment

1. Create namespace:
```bash
kubectl create namespace habit-tracker
```

2. Apply manifests:
```bash
kubectl apply -f k8s/habit-app.yml
```

3. Access the app:
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
kubectl apply -f argocd-app.yaml
```

3. ArgoCD will automatically:
   - Monitor the GitHub repository
   - Sync changes to the cluster
   - Self-heal any drift

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
