import React, { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

export default function HostAlbum() {
  const { slug } = useParams()
  const [sp] = useSearchParams()
  const k = sp.get('k') || ''
  const [state, setState] = useState({ ok: null, title: '', images: [] })

  async function verify() {
    const r = await fetch(`${API}/api/host/verify?slug=${encodeURIComponent(slug)}&k=${encodeURIComponent(k)}`)
    const j = await r.json()
    if (!r.ok) {
      setState(s => ({ ...s, ok: false }))
      return
    }
    setState(s => ({ ...s, ok: true, title: j.title }))
  }

  async function loadImages() {
    // כרגע הגלריה ציבורית – אפשר להקשיח בהמשך
    const r = await fetch(`${API}/api/guest/albums/${slug}/images`)
    const j = await r.json()
    setState(s => ({ ...s, images: j.images || [] }))
  }

  useEffect(() => { verify() }, [slug, k])
  useEffect(() => { if (state.ok) loadImages() }, [state.ok])

  const imgUrl = (rel) => `${API}/static/albums/${slug}/album/${rel}`

  if (state.ok === null) {
    return <div className="p-6 max-w-5xl mx-auto">טוען…</div>
  }
  if (state.ok === false) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">קישור לא תקין</h1>
        <p className="text-gray-600">בדוק עם הצלם את הכתובת שקיבלת.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">אלבום: {state.title}</h1>
        <Link className="btn" to={`/a/${slug}`}>צפה כ"אורח"</Link>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-2">כל התמונות</h2>
        {!state.images.length && <div className="text-gray-500">אין תמונות להצגה</div>}
        <div className="grid-auto">
          {state.images.map((rel, i)=>(
            <div key={i} className="p-2 border rounded-xl">
              <div className="w-full overflow-hidden rounded-lg bg-gray-100" style={{aspectRatio:'1/1'}}>
                <img src={imgUrl(rel)} alt={rel} style={{width:'100%',height:'100%',objectFit:'cover'}} loading="lazy" />
              </div>
              <div className="text-xs mt-1 break-all text-gray-600">{rel}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
