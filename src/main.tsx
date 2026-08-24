import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ClientPortal from './ClientPortal'
import './styles.css'

const path = window.location.pathname
const Root = path.startsWith('/client') ? ClientPortal : App

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
