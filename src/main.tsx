import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { FinanceProvider } from './context/FinanceContext'
import { registerServiceWorker } from './lib/pushNotifications'
import './index.css'

// Registra o Service Worker do PWA para Web Push e notificações
registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <FinanceProvider>
        <App />
      </FinanceProvider>
    </AuthProvider>
  </React.StrictMode>,
)

