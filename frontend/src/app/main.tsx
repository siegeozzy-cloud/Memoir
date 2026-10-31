import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// One address for the app: the session cookie and Spotify's redirect both belong to 127.0.0.1, not "localhost".
if (location.hostname === 'localhost') location.replace(location.href.replace('//localhost', '//127.0.0.1'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
