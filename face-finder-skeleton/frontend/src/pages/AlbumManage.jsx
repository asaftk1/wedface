import React, { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

function authHeaders() {
  const t = localStorage.getItem('ff_token')
  return t ? { Authorization: `Bearer ${t}` } : {}
}

export default function AlbumManage() {
  const { slug } = useParams()
  const [album, setAlbum] = useState(null)
  const [images, setImages] = useState([])
  const [uploadPct, setUploadPct] = useState(0)
  const [indexPct, setIndexPct] = useState(0)
  const navigate = useNavigate()

  async function loadAlbum() {
    const r = await fetch(`${API}/api/my/albums/${slug}`, { headers: { ...authHeaders() } })
    if (r.status === 401) return navigate('/login')
    const j = await r.json()
    if (!r.ok) return alert(j.detail || 'האלבום לא נמצא')
    setAlbum(j)
  }

  async function loadImages() {
    const r = await fetch(`${API}/api/my/albums/${slug}/images`, { headers: { ...authHeaders() } })
    const j = await r.json()
    setImages(j.images || [])
  }

  async function copyHostLink() {
    const r = await fetch(`${API}/api/my/albums/${slug}/host_link`, { headers: { ...authHeaders() } })
    const j = await r.json()
    if (!r.ok) return alert(j.detail || 'שגיאה ביצירת קישור')
    // בונים URL מלא מה-origin של הדפדפן
    const full = `${window.location.origin}/host/${j.slug}?k=${encodeURIComponent(j.host_key)}`
    await navigator.clipboard.writeText(full)
    alert('קישור בעלי האירוע הועתק')
  }

  useEffect(() => { loadAlbum(); loadImages() }, [slug])

  function xhrUpload({ url, formData, onProgress }) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', url, true)
      const token = authHeaders().Authorization
      if (token) xhr.setRequestHeader('Authorization', token)
      xhr.upload.onloadstart = () => onProgress?.(1)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.max(1, Math.round((e.loaded / e.total) * 100)))
      }
      xhr.upload.onloadend = () => onProgress?.(100)
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          try { resolve({ status: xhr.status, json: JSON.parse(xhr.responseText || '{}') }) }
          catch (e) { reject(e) }
        }
      }
      xhr.onerror = reject
      xhr.send(formData)
    })
  }

  function startIndexPolling() {
    const t = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/albums/${slug}/index/progress`)
        const j = await r.json()
        setIndexPct(j.percent || 0)
        if ((j.percent || 0) >= 100) {
          clearInterval(t)
          setTimeout(() => setIndexPct(0), 1200)
          loadImages()
        }
      } catch { }
    }, 1000)
  }

  async function uploadZip(file) {
    if (!file) return
    setUploadPct(1)
    const fd = new FormData(); fd.append('zip', file)
    await xhrUpload({
      url: `${API}/api/my/albums/${slug}/upload`,
      formData: fd,
      onProgress: setUploadPct
    })
    startIndexPolling()
    setTimeout(() => setUploadPct(0), 1200)
  }

  const imgUrl = (rel) => `${API}/static/albums/${slug}/album/${rel}`

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <Link className="underline" to="/dashboard/albums">← חזרה לאלבומים</Link>
      </div>

      <div className="card">
        <h2 className="text-xl font-semibold mb-2">{album ? album.title : 'טוען אלבום...'}</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="btn cursor-pointer">
            העלאת ZIP
            <input type="file" accept=".zip" hidden onChange={(e) => uploadZip(e.target.files?.[0])} />
          </label>
          <button className="btn" onClick={copyHostLink}>העתק קישור בעלי האירוע</button>
          <div className="text-sm text-gray-500">שיתוף אורחים: <code>/a/{slug}</code></div>
        </div>

        {(uploadPct > 0 || indexPct > 0) && (
          <div className="mt-3 space-y-2">
            {uploadPct > 0 && (
              <div>
                <div className="text-sm">העלאה: {uploadPct}%</div>
                <div className="w-full h-2 bg-gray-200 rounded">
                  <div className="h-2 rounded" style={{ width: `${uploadPct}%`, background: 'linear-gradient(90deg,#ffd68a,#f59e0b)' }} />
                </div>
              </div>
            )}
            {indexPct > 0 && (
              <div>
                <div className="text-sm">אינדוקס: {indexPct}%</div>
                <div className="w-full h-2 bg-gray-200 rounded">
                  <div className="h-2 rounded" style={{ width: `${indexPct}%`, background: 'linear-gradient(90deg,#a3a3ff,#6366f1)' }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-xl font-semibold mb-3">תמונות באלבום</h2>
        {!images.length && <div className="text-gray-500">אין תמונות להצגה</div>}
        <div className="grid-auto">
          {images.map((rel, i) => (
            <div key={i} className="p-2 border rounded-xl">
              <div className="w-full overflow-hidden rounded-lg bg-gray-100" style={{ aspectRatio: '1/1' }}>
                <img
                  src={imgUrl(rel)}
                  alt={rel}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  loading="lazy"
                />
              </div>
              <div className="text-xs mt-1 break-all text-gray-600">{rel}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
