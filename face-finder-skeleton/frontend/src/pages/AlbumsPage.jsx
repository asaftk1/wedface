import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

function authHeaders() {
  const t = localStorage.getItem('ff_token')
  return t ? { Authorization: `Bearer ${t}` } : {}
}

export default function AlbumsPage() {
  const [albums, setAlbums] = useState([])
  const [title, setTitle] = useState('')
  const navigate = useNavigate()

  async function load() {
    const r = await fetch(`${API}/api/my/albums`, { headers: { ...authHeaders() } })
    if (r.status === 401) return navigate('/login')
    const j = await r.json()
    setAlbums(j || [])
  }
  useEffect(() => { load() }, [])

  async function createAlbum(e) {
    e.preventDefault()
    const r = await fetch(`${API}/api/my/albums`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ title, is_public: true }),
    })
    const j = await r.json()
    if (!r.ok) return alert(j.detail || 'נכשלה יצירת אלבום')
    setTitle('')
    setAlbums([j, ...albums])
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="card">
        <h2 className="text-xl font-semibold mb-2">צור אלבום חדש</h2>
        <form onSubmit={createAlbum} className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-sm mb-1">שם האלבום</label>
            <input className="input w-80" value={title} onChange={e=>setTitle(e.target.value)} placeholder="למשל: חתונת עדי ואליור" />
          </div>
          <button className="btn" type="submit">צור</button>
        </form>
      </div>

      <div className="card">
        <h2 className="text-xl font-semibold mb-3">האלבומים שלי</h2>
        {!albums.length && <div className="text-gray-500">אין אלבומים עדיין</div>}
        <div className="grid gap-4">
          {albums.map(a => (
            <Link to={`/dashboard/albums/${a.slug}`} key={a.slug} className="p-4 border rounded-xl block hover:bg-gray-50">
              <div className="font-semibold">{a.title}</div>
              <div className="text-sm text-gray-500">מזהה שיתוף: {a.slug}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
