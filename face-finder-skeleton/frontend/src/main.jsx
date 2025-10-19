import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import App from './App.jsx'                 // אפשר להשאיר כעמוד dev אם תרצה
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Photographer from './pages/Photographer.jsx'
import AlbumsPage from './pages/AlbumsPage.jsx'
import AlbumManage from './pages/AlbumManage.jsx'
import GuestAlbum from './pages/GuestAlbum.jsx'
import HostAlbum from './pages/HostAlbum.jsx'

import './styles.css'

function hasToken() { return !!localStorage.getItem('ff_token') }
function Home() { return hasToken() ? <Navigate to="/dashboard/albums" replace /> : <Navigate to="/login" replace /> }

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },

  // פרופיל צלם + טאבים
  { path: '/dashboard', element: <Photographer /> },
  { path: '/dashboard/albums', element: <AlbumsPage /> },
  { path: '/dashboard/albums/:slug', element: <AlbumManage /> },
  { path: '/host/:slug', element: <HostAlbum /> },
  { path: '/a/:slug', element: <GuestAlbum /> },
  

  // אופציונלי: להשאיר את עמוד ה-MVP הישן
  { path: '/dev', element: <App /> },
])

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
