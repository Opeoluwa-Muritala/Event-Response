# Event Response Platform Setup Guide

This platform is designed to be open-sourced and easily deployable by NGOs and governments for real-time event mapping and volunteer coordination.

## 📋 Prerequisites

1.  **Google Maps API Key**:
    -   Go to the [Google Cloud Console](https://console.cloud.google.com/).
    -   Enable the **Maps JavaScript API**.
    -   Create an API Key and restrict it to your domain.
2.  **Firebase Project**:
    -   Go to the [Firebase Console](https://console.firebase.google.com/).
    -   Create a new project.
    -   Enable **Firestore Database**, **Firebase Storage**, and **Firebase Authentication**.
    -   Register a Web App and copy the configuration.

## 🛠️ Configuration

Set the following environment variables in your deployment environment (e.g.`.env` file):

```env
# Google Maps
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# Firebase
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

## 🚀 Deployment

### 1. Firebase Hosting
Run the following commands in your terminal:
```bash
firebase init hosting
firebase deploy
```

### 2. Cloud Functions
To enable push notifications, deploy the functions in the `/functions` directory:
```bash
cd functions
npm install
firebase deploy --only functions
```
