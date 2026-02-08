import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import { StarredProvider } from './auth/StarredContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <StarredProvider>
        <App />
      </StarredProvider>
    </AuthProvider>
  </StrictMode>,
)
