import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

function getGuestToken(slug) { return localStorage.getItem(`ff_guest_${slug}`) }
function setGuestToken(slug, t) { localStorage.setItem(`ff_guest_${slug}`, t) }
function guestHeaders(slug) {
  const t = getGuestToken(slug)
  return t ? { Authorization: `Bearer ${t}` } : {}
}

export default function GuestAlbum() {
  const { slug } = useParams()
  const [step, setStep] = useState('auth') // 'auth' | 'gallery'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [images, setImages] = useState([])
  const [favorites, setFavorites] = useState(new Set())
  const [searchPct, setSearchPct] = useState(0)
  const [results, setResults] = useState([])

  useEffect(() => {
    if (getGuestToken(slug)) {
      setStep('gallery')
      loadImages()
      loadFavorites()
    }
  }, [slug])

  async function guestRegister(e) {
    e?.preventDefault()
    const r = await fetch(`${API}/api/guest/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ album_slug: slug, name, email })
    })
    const j = await r.json()
    if (!r.ok) return alert(j.detail || 'שגיאה בהרשמה')
    setGuestToken(slug, j.token)
    setStep('gallery')
    await loadImages()
    await loadFavorites()
  }

  async function loadImages() {
    const r = await fetch(`${API}/api/guest/albums/${slug}/images`)
    const j = await r.json()
    setImages(j.images || [])
  }

  async function loadFavorites() {
    const r = await fetch(`${API}/api/guest/favorites/${slug}`, { headers: { ...guestHeaders(slug) } })
    if (!r.ok) return
    const j = await r.json()
    setFavorites(new Set(j.rel_paths || []))
  }

  async function toggleFav(rel) {
    const isFav = favorites.has(rel)
    const url = `${API}/api/guest/favorites/${slug}/${isFav ? 'remove' : 'add'}`
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...guestHeaders(slug) },
      body: JSON.stringify({ rel_path: rel })
    })
    if (r.ok) {
      const s = new Set(favorites)
      if (isFav) s.delete(rel); else s.add(rel)
      setFavorites(s)
    }
  }

  function imgUrl(rel) {
    return `${API}/static/albums/${slug}/album/${rel}`
  }

  // חיפוש סלפי – משתמשים ב-endpoint הציבורי הקיים
  function xhrUpload({ url, formData, onProgress }) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', url, true)
      xhr.upload.onloadstart = () => onProgress?.(1)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.max(1, Math.round((e.loaded/e.total)*100)))
      }
      xhr.upload.onloadend = () => onProgress?.(100)
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          try { resolve({ status: xhr.status, json: JSON.parse(xhr.responseText || '{}') }) }
          catch(e){ reject(e) }
        }
      }
      xhr.onerror = reject
      xhr.send(formData)
    })
  }

  async function searchBySelfie(files) {
    if (!files?.length) return
    setSearchPct(1)
    const fd = new FormData()
    for (const f of files) fd.append('selfies', f)
    const r = await xhrUpload({
      url: `${API}/api/albums/${slug}/search?threshold=0.35&top_k=500`,
      formData: fd,
      onProgress: setSearchPct
    })
    setResults(r.json?.results || [])
    setTimeout(()=> setSearchPct(0), 800)
    // אופציונלי: אפשר להחליף את הגלריה לרשימת התוצאות בלבד:
    // setImages((r.json?.results || []).map(x=>x.rel_path))
  }

  function downloadFavorites() {
    window.location.href = `${API}/api/guest/favorites/${slug}/download`
  }

  if (step === 'auth') {
    return (
      <div className="p-6 max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-3">ברוך הבא לאלבום</h1>
        <p className="text-gray-600 mb-4">כדי לשמור מועדפים ולקבל הורדה מותאמת, נכנסים כאורח.</p>
        <form onSubmit={guestRegister} className="flex flex-col gap-3">
          <input className="input" placeholder="שם (רשות)" value={name} onChange={e=>setName(e.target.value)} />
          <input className="input" type="email" placeholder="אימייל (מומלץ)" value={email} onChange={e=>setEmail(e.target.value)} />
          <button className="btn" type="submit">כניסה</button>
        </form>
      </div>
    )
  }

  // GALLERY
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">אלבום אורחים</h1>
        <div className="flex items-center gap-2">
          <label className="btn cursor-pointer">
            העלה סלפי (חיפוש)
            <input type="file" accept="image/*" hidden multiple onChange={(e)=>searchBySelfie(e.target.files)} />
          </label>
          {searchPct > 0 && <span className="text-sm text-gray-600">{searchPct}%</span>}
          <button className="btn" onClick={downloadFavorites}>הורד מועדפים</button>
        </div>
      </div>

      {/* אם יש תוצאות – נציג אותן בראש */}
      {!!results.length && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold mb-2">התאמות מהסלפי</h2>
          <div className="grid-auto">
            {results.map((r, i)=>(
              <div key={i} className="relative p-2 border rounded-xl">
                <button
                  className="absolute top-2 right-2 text-xl"
                  title={favorites.has(r.rel_path) ? 'הסר ממועדפים' : 'הוסף למועדפים'}
                  onClick={()=>toggleFav(r.rel_path)}
                >
                  {favorites.has(r.rel_path) ? '❤️' : '🤍'}
                </button>
                <div className="w-full overflow-hidden rounded-lg bg-gray-100" style={{aspectRatio:'1/1'}}>
                  <img src={imgUrl(r.rel_path)} alt={r.rel_path} style={{width:'100%',height:'100%',objectFit:'cover'}} loading="lazy" />
                </div>
                <div className="text-xs mt-1 text-gray-600">score: {r.score?.toFixed?.(3)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* גלריה מלאה */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-2">כל התמונות</h2>
        {!images.length && <div className="text-gray-500">אין תמונות להצגה</div>}
        <div className="grid-auto">
          {images.map((rel, i)=>(
            <div key={i} className="relative p-2 border rounded-xl">
              <button
                className="absolute top-2 right-2 text-xl"
                title={favorites.has(rel) ? 'הסר ממועדפים' : 'הוסף למועדפים'}
                onClick={()=>toggleFav(rel)}
              >
                {favorites.has(rel) ? '❤️' : '🤍'}
              </button>
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
