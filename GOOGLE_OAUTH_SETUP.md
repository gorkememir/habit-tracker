# Google OAuth Setup Instructions

## 1. Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "OAuth 2.0 Client ID"
5. Configure the OAuth consent screen if prompted
6. Choose "Web application" as the application type
7. Add authorized redirect URIs:
   - For local development: `http://localhost:8080/auth/google/callback`
   - For production: `http://your-domain:30007/auth/google/callback`
8. Click "Create" and save your Client ID and Client Secret

## 2. Create Kubernetes Secret

Create a file named `google-oauth-secret.yaml`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: google-oauth-secret
  namespace: habit-tracker
type: Opaque
stringData:
  GOOGLE_CLIENT_ID: "your-google-client-id-here"
  GOOGLE_CLIENT_SECRET: "your-google-client-secret-here"
  SESSION_SECRET: "generate-a-random-string-here"
```

Apply the secret:
```bash
kubectl apply -f google-oauth-secret.yaml
```

## 3. Update Callback URL

In `k8s/habit-app.yml`, update the `GOOGLE_CALLBACK_URL` environment variable with your actual domain or IP address.

## 4. Local Development

For local development, create a `.env` file:

```
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:8080/auth/google/callback
SESSION_SECRET=your-random-session-secret
POSTGRES_USER=postgres
POSTGRES_HOST=localhost
POSTGRES_DB=habitdb
POSTGRES_PASSWORD=mysecretpassword
```

Then install dotenv: `npm install dotenv`

And add to the top of app.js: `require('dotenv').config();`

## 5. Generate Session Secret

You can generate a random session secret with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
