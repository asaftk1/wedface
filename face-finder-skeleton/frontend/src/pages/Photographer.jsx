import React, { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

function authHeaders() {
  const t = localStorage.getItem('ff_token')
  return t ? { Authorization: `Bearer ${t}` } : {}
}

function TabLink({ to, text }) {
  const loc = useLocation()
  const active = loc.pathname === to
  return (
    <Link
      to={to}
      className={`px-4 py-2 rounded-xl border ${active ? 'bg-gray-900 text-white' : 'bg-white'}`}
    >
      {text}
    </Link>
  )
}

export default function Photographer() {
  const navigate = useNavigate()
  useEffect(() => {
    if (!localStorage.getItem('ff_token')) navigate('/login')
  }, [])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">פרופיל צלם</h1>
      <div className="flex gap-2 mb-5">
        <TabLink to="/dashboard/albums" text="אלבומים" />
        {/* טאבים עתידיים:
        <TabLink to="/dashboard/stats" text="סטטיסטיקות" />
        <TabLink to="/dashboard/settings" text="הגדרות" />
        */}
      </div>
      {/* כאן הרואטר הפנימי יציג את התוכן (בדפים נפרדים) */}
    </div>
  )
}
